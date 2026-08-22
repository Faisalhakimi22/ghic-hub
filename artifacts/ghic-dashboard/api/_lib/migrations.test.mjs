import assert from "node:assert/strict";
import test from "node:test";
import { runTenancyMigrations, DEFAULT_WORKSPACE_ID } from "./migrations.mjs";

function fakeQuery({ fail = false, onTransaction = null } = {}) {
  const transactions = [];
  const q = (strings, ...values) => ({
    // Values inlined, for readable assertions about statement content.
    text: strings.reduce(
      (out, part, index) => out + part + (index < values.length ? String(values[index]) : ""),
      "",
    ),
    // What the driver actually sends: interpolations become bind
    // placeholders. Kept separate because the difference is where a real
    // bug lived -- a $1 inside a $$-quoted DO body is inert text, so the
    // statement declares no parameters while one is supplied, and Postgres
    // rejects the bind. Inlining values hid that completely.
    parameterized: strings.reduce(
      (out, part, index) => out + part + (index < values.length ? `$${index + 1}` : ""),
      "",
    ),
    values,
  });
  q.transaction = async (statements) => {
    transactions.push(statements);
    if (onTransaction) await onTransaction(statements);
    if (fail) throw new Error("migration transaction failed");
    return [];
  };
  q.transactions = transactions;
  return q;
}

/** Drop balanced parenthesised groups, leaving only the outer query. */
function outerQuery(sql) {
  let out = "";
  let depth = 0;
  for (const char of sql) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (depth === 0) out += char;
  }
  return out.replace(/\s+/g, " ").trim();
}

test("the default workspace insert cannot fire once migration 2 is recorded", async () => {
  // Two bugs have lived in this one statement. First it had no guard at all
  // and ran on every cold start. Then it was guarded as
  // `SELECT MAX(...) FROM ghic_org_settings WHERE NOT EXISTS (...)`, which
  // does not work: an aggregate with no GROUP BY emits exactly one row however
  // many inputs survive the WHERE, so with that table empty the insert still
  // fired. Both recreated ghic-default-workspace as an ownerless row.
  //
  // Asserting the text contains a WHERE clause is what let the second bug
  // through -- the text was right and the semantics were wrong. So this checks
  // the structural property that makes the guard work: the guarded SELECT must
  // not aggregate over a table, which means no FROM outside a subquery.
  const q = fakeQuery();
  await runTenancyMigrations(q);

  const insert = q.transactions[0]
    .map((statement) => statement.text)
    .find((text) => text.startsWith("INSERT INTO ghic_workspaces"));

  assert.ok(insert, "the default workspace insert should still exist");

  const outer = outerQuery(insert);
  assert.match(outer, /WHERE NOT EXISTS/);
  assert.equal(
    / FROM /i.test(outer),
    false,
    `the guarded SELECT must not aggregate over a table, or WHERE cannot ` +
      `suppress the row. Outer query was: ${outer}`,
  );
  // ON CONFLICT was never the guard: it stops a duplicate id, not a row being
  // recreated after the original was deliberately deleted.
  assert.match(insert, /ON CONFLICT \(id\) DO NOTHING/);
});

test("MAX over org settings is still read, just not as the driving table", async () => {
  const q = fakeQuery();
  await runTenancyMigrations(q);
  const insert = q.transactions[0]
    .map((statement) => statement.text)
    .find((text) => text.startsWith("INSERT INTO ghic_workspaces"));
  // The original name is still preserved when the backfill does run.
  assert.match(insert, /SELECT MAX\(workspace_name\) FROM ghic_org_settings/);
  assert.match(insert, /COALESCE\(/);
});

test("every ghic_workspaces write in the migration is version-guarded", async () => {
  const q = fakeQuery();
  await runTenancyMigrations(q);

  const writes = q.transactions[0]
    .map((statement) => statement.text)
    .filter((text) => /^(INSERT INTO|UPDATE) ghic_workspaces\b/.test(text));

  assert.ok(writes.length > 0);
  for (const write of writes) {
    assert.match(write, /ghic_schema_migrations WHERE version = 2/, write.slice(0, 80));
  }
});

test("migration is one locked transaction with validation before completion", async () => {
  const q = fakeQuery();
  await runTenancyMigrations(q);

  assert.equal(q.transactions.length, 1);
  const statements = q.transactions[0].map((statement) => statement.text);
  assert.match(statements[0], /pg_advisory_xact_lock/);
  assert.doesNotMatch(
    statements.filter((text) => /DO \$\$/.test(text)).join("\n"),
    /\$\{/,
  );
  assert.ok(statements.some((text) => /tenancy migration validation failed/.test(text)));
  assert.match(statements.at(-1), /INSERT INTO ghic_schema_migrations/);
  assert.match(statements.at(-1), /version = 4/);
});

test("concurrent migration attempts serialize at the transaction boundary", async () => {
  let tail = Promise.resolve();
  let active = 0;
  let maximumActive = 0;
  const q = fakeQuery({
    onTransaction: async () => {
      const previous = tail;
      let release;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      release();
    },
  });

  await Promise.all([runTenancyMigrations(q), runTenancyMigrations(q)]);
  assert.equal(maximumActive, 1);
  assert.equal(q.transactions.length, 2);
  assert.ok(q.transactions.every((tx) => /pg_advisory_xact_lock/.test(tx[0].text)));
});

test("failed migration transaction does not prevent a later retry", async () => {
  let attempts = 0;
  const q = fakeQuery({
    onTransaction: async () => { attempts += 1; },
  });
  q.transaction = async (statements) => {
    q.transactions.push(statements);
    if (attempts++ === 0) throw new Error("rollback me");
    return [];
  };

  await assert.rejects(() => runTenancyMigrations(q), /rollback me/);
  await runTenancyMigrations(q);
  assert.equal(q.transactions.length, 2);
});

test("validation failure is represented as a transaction-aborting assertion", async () => {
  const q = fakeQuery();
  await runTenancyMigrations(q);
  const validation = q.transactions[0].map((statement) => statement.text).join("\n");

  assert.match(validation, /RAISE EXCEPTION/);
  assert.match(validation, /default workspace is missing/);
  assert.match(validation, /repository ownership mismatch/);
  assert.match(validation, /repository state mismatch/);
  assert.match(validation, /repository chunk mismatch/);
  assert.match(validation, /ledger workspace cannot be established/);
  assert.match(validation, /conflicting ledger workspace attribution/);
  assert.match(validation, /ledger repository workspace mismatch/);
  assert.match(validation, /ledger installation workspace mismatch/);
  assert.match(validation, /ledger ownership validation failed/);
});

test("ledger attribution validates repository and installation mappings", async () => {
  const q = fakeQuery();
  await runTenancyMigrations(q);
  const sql = q.transactions[0].map((statement) => statement.text).join("\n");

  // Matching repo/install ownership is the only source used for backfill.
  assert.match(sql, /COALESCE\([\s\S]*SELECT r\.workspace_id[\s\S]*SELECT i\.workspace_id/);
  // A conflicting existing attribution aborts before migration completion.
  assert.match(sql, /l\.workspace_id IS DISTINCT FROM COALESCE\(r\.workspace_id, i\.workspace_id\)/);
  // Unmappable events are not assigned a default workspace.
  assert.match(sql, /l\.workspace_id IS NULL[\s\S]*EXISTS \([\s\S]*ghic_github_repositories/);
});

test("ledger attribution conflict is transaction-fatal and retryable", async () => {
  let attempts = 0;
  const q = fakeQuery({
    onTransaction: async (statements) => {
      attempts += 1;
      const sql = statements.map((statement) => statement.text).join("\n");
      assert.match(sql, /conflicting ledger workspace attribution/);
      if (attempts === 1) throw new Error("conflicting ledger attribution");
    },
  });

  await assert.rejects(() => runTenancyMigrations(q), /conflicting ledger attribution/);
  await runTenancyMigrations(q);
  assert.equal(q.transactions.length, 2);
});

test("ledger validation remains active when earlier tenancy versions already exist", async () => {
  const q = fakeQuery();
  await runTenancyMigrations(q);
  const sql = q.transactions[0].map((statement) => statement.text).join("\n");

  assert.match(sql, /version = 4/);
  assert.match(sql, /workspace attribution is conflicting or incomplete/);
  assert.match(sql, /l\.workspace_id IS NULL[\s\S]*r\.workspace_id IS NOT NULL/);
});

test("rerunning an applied migration is harmless", async () => {
  const q = fakeQuery();
  await runTenancyMigrations(q);
  await runTenancyMigrations(q);

  assert.equal(q.transactions.length, 2);
  const second = q.transactions[1].map((statement) => statement.text).join("\n");
  assert.match(second, /IF EXISTS \(SELECT 1 FROM ghic_schema_migrations/);
  assert.match(second, /WHERE NOT EXISTS \(SELECT 1 FROM ghic_schema_migrations/);
});

test("ownership constraints reject mismatched installation and repository writes", async () => {
  const q = fakeQuery();
  await runTenancyMigrations(q);
  const sql = q.transactions[0].map((statement) => statement.text).join("\n");

  assert.match(sql, /FOREIGN KEY \(workspace_id, installation_id\)/);
  assert.match(sql, /REFERENCES ghic_github_installations \(workspace_id, installation_id\)/);
  assert.match(sql, /ghic_prevent_installation_transfer/);
  assert.match(sql, /ghic_prevent_repository_transfer/);
  assert.match(sql, /installation ownership is immutable/);
  assert.match(sql, /repository ownership is immutable/);
});

test("state and chunk writes require the repository workspace", async () => {
  const q = fakeQuery();
  await runTenancyMigrations(q);
  const sql = q.transactions[0].map((statement) => statement.text).join("\n");

  assert.match(sql, /ghic_state_repository_workspace_fk/);
  assert.match(sql, /ghic_chunks_repository_workspace_fk/);
  assert.match(sql, /FOREIGN KEY \(workspace_id, repo\)/);
  assert.match(sql, /REFERENCES ghic_github_repositories \(workspace_id, repo_full_name\)/);
});

test("valid ownership relationships preserve vector storage and dimensions", async () => {
  const q = fakeQuery();
  await runTenancyMigrations(q);
  const sql = q.transactions[0].map((statement) => statement.text).join("\n");

  assert.match(sql, /FOREIGN KEY \(workspace_id\) REFERENCES ghic_workspaces\(id\)/);
  assert.doesNotMatch(sql, /DROP COLUMN embedding|UPDATE ghic_repo_chunks[\s\S]*embedding/);
  assert.doesNotMatch(sql, /vector\(/);
  assert.match(sql, /ghic_schema_migrations/);
});

// ---------------------------------------------------------------------------
// The production case: 0 connected repositories, 1 repository_state row,
// 1891 repo_chunks rows, 33 ledger rows none of which map to a repository.
//
// These assertions are structural -- the fake executes no SQL, so they pin
// the statements the migration emits rather than the rows it would touch.
// That is the honest limit of this harness, stated here so nobody reads a
// passing suite as proof the migration ran against data.
// ---------------------------------------------------------------------------

async function migrationSql() {
  const q = fakeQuery();
  await runTenancyMigrations(q);
  return {
    statements: q.transactions[0],
    sql: q.transactions[0].map((s) => s.text).join("\n"),
  };
}

// Two spellings of the same backfill. Statements outside a DO block bind the
// workspace id as a parameter (the fake inlines it bare); statements inside
// one cannot use parameters, so it appears as a quoted SQL literal.
const SWEEP = (table) =>
  new RegExp(
    `UPDATE ${table}\\s+SET workspace_id = '?${DEFAULT_WORKSPACE_ID}'?\\s+WHERE workspace_id IS NULL`,
  );

/** SQL with `--` comments removed, so prose cannot satisfy or trip a match. */
const stripComments = (sql) => sql.replace(/--[^\n]*/g, "");

test("state and chunk rows with no connected repository fall back to the default workspace", async () => {
  const { sql } = await migrationSql();

  // Production is exactly this: nothing in ghic_github_repositories, so the
  // join backfill matches zero rows and every state/chunk row would keep a
  // NULL workspace_id without an unconditional sweep.
  for (const table of ["ghic_repository_state", "ghic_repo_chunks"]) {
    assert.match(sql, SWEEP(table), `${table} has no default-workspace sweep`);
  }
});

test("the default sweep never overwrites ownership the join could determine", async () => {
  const { sql } = await migrationSql();

  for (const [table, alias] of [
    ["ghic_repository_state", "s"],
    ["ghic_repo_chunks", "c"],
  ]) {
    const join = sql.indexOf(`UPDATE ${table} ${alias}`);
    const sweep = sql.search(SWEEP(table));
    assert.ok(join >= 0, `${table} join backfill missing`);
    assert.ok(sweep >= 0, `${table} sweep missing`);
    // Ordering is the safety property. If the sweep ran first it would
    // claim rows for the default workspace that the join would otherwise
    // have attributed to their real owner.
    assert.ok(join < sweep, `${table} sweep must run after the join backfill`);
  }
});

test("the sweep is confined to the one-time single-tenant expand", async () => {
  const { statements } = await migrationSql();
  const block = statements
    .map((s) => s.text)
    .find((text) => SWEEP("ghic_repository_state").test(text));

  assert.ok(block, "sweep statement not found");
  // Guarded by the version-2 early return, so a database that has since
  // grown a second workspace can never have rows reassigned by it.
  assert.match(
    block,
    /IF EXISTS \(SELECT 1 FROM ghic_schema_migrations WHERE version = 2\) THEN\s+RETURN;/,
  );
});

test("indexed repositories with no connected repository do not abort the migration", async () => {
  const { sql } = await migrationSql();

  // Out-of-band indexing legitimately produces state and chunks for
  // repositories absent from ghic_github_repositories. A validating
  // composite FK scans those rows and fails; NOT VALID enforces the rule
  // on new writes and grandfathers the legacy rows.
  for (const name of [
    "ghic_state_repository_workspace_fk",
    "ghic_chunks_repository_workspace_fk",
  ]) {
    assert.match(
      sql,
      new RegExp(`ADD CONSTRAINT ${name}[\\s\\S]{0,240}?NOT VALID`),
      `${name} must be added NOT VALID`,
    );
  }
});

test("workspace foreign keys still validate, because the sweep guarantees they can", async () => {
  const { sql } = await migrationSql();

  // These reference ghic_workspaces(id), which the sweep populates for
  // every row. They must NOT be NOT VALID -- weakening them would give up
  // a tenancy guarantee the data can actually satisfy.
  for (const name of ["ghic_state_workspace_fk", "ghic_chunks_workspace_fk"]) {
    const start = sql.indexOf(`ADD CONSTRAINT ${name}`);
    assert.ok(start > 0, `${name} not found`);
    const statement = sql.slice(start, sql.indexOf(";", start));
    assert.doesNotMatch(
      statement,
      /NOT VALID/,
      `${name} should validate against existing rows`,
    );
  }
});

test("unmappable ledger rows are left unattributed rather than defaulted", async () => {
  const { sql } = await migrationSql();

  // Production has 33 ledger rows across 5 repositories, none connected.
  // Attributing them to the default workspace would be a guess presented
  // as a fact, so they stay NULL -- and ghic_ledger is deliberately absent
  // from the SET NOT NULL block, which is what makes that survivable.
  assert.doesNotMatch(sql, SWEEP("ghic_ledger"));
  assert.doesNotMatch(
    sql,
    /ALTER TABLE ghic_ledger ALTER COLUMN workspace_id SET NOT NULL/,
  );
});

test("every table promoted to NOT NULL has a backfill that cannot leave nulls", async () => {
  const { sql } = await migrationSql();
  const promoted = [
    ...sql.matchAll(/ALTER TABLE (\w+) ALTER COLUMN workspace_id SET NOT NULL/g),
  ].map((m) => m[1]);

  assert.ok(promoted.length >= 4, "expected several NOT NULL promotions");
  for (const table of promoted) {
    assert.match(
      sql,
      SWEEP(table),
      `${table} is promoted to NOT NULL without an unconditional backfill`,
    );
  }
});

// ---------------------------------------------------------------------------
// Bind-parameter safety
// ---------------------------------------------------------------------------

test("no DO block carries a bind parameter", async () => {
  const { statements } = await migrationSql();

  // A $$-quoted body is a string literal to the parser, so an interpolated
  // $1 inside it is inert text. The statement then declares zero parameters
  // while the driver supplies one, and Postgres rejects the bind.
  for (const statement of statements) {
    if (!/DO \$\$/.test(statement.text)) continue;
    assert.equal(
      statement.values.length,
      0,
      `DO block carries ${statement.values.length} bind parameter(s):\n` +
        statement.parameterized.slice(0, 240),
    );
  }
});

test("version literals inside DO blocks stay in step with the exported constants", async () => {
  const { statements } = await migrationSql();
  const referenced = new Set();
  for (const statement of statements) {
    if (!/DO \$\$/.test(statement.text)) continue;
    for (const m of statement.text.matchAll(
      /ghic_schema_migrations WHERE version = (\d+)/g,
    )) {
      referenced.add(Number(m[1]));
    }
  }
  // The literals exist only because parameters cannot be used here. This is
  // the guard against them drifting as the version constants change.
  assert.deepEqual([...referenced].sort(), [2, 3, 4]);
});

test("hardcoded workspace ids in DO blocks match the exported constant", async () => {
  const { statements } = await migrationSql();
  for (const statement of statements) {
    if (!/DO \$\$/.test(statement.text)) continue;
    for (const m of statement.text.matchAll(/SET workspace_id = '([^']+)'/g)) {
      assert.equal(
        m[1],
        DEFAULT_WORKSPACE_ID,
        "a hardcoded workspace id drifted from DEFAULT_WORKSPACE_ID",
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Idempotency and rollback
// ---------------------------------------------------------------------------

test("re-running the migration emits identical statements and re-guards every version", async () => {
  const first = await migrationSql();
  const second = await migrationSql();

  assert.equal(first.sql, second.sql, "migration statements are not deterministic");
  for (const version of [2, 3, 4]) {
    assert.match(
      first.sql,
      new RegExp(
        `INSERT INTO ghic_schema_migrations \\(version\\)\\s+SELECT ${version}\\s+WHERE NOT EXISTS`,
      ),
      `version ${version} is not recorded idempotently`,
    );
  }
});

test("schema changes are guarded so a partial re-run cannot duplicate them", async () => {
  const { sql: raw } = await migrationSql();
  const sql = stripComments(raw);

  for (const [, guard, table] of sql.matchAll(/CREATE TABLE (IF NOT EXISTS )?(\w+)/g)) {
    assert.ok(guard, `CREATE TABLE ${table} is missing IF NOT EXISTS`);
  }
  for (const [, guard, index] of sql.matchAll(/CREATE INDEX (IF NOT EXISTS )?(\w+)/g)) {
    assert.ok(guard, `CREATE INDEX ${index} is missing IF NOT EXISTS`);
  }
  for (const [, guard, column] of sql.matchAll(/ADD COLUMN (IF NOT EXISTS )?(\w+)/g)) {
    assert.ok(guard, `ADD COLUMN ${column} is missing IF NOT EXISTS`);
  }
  // Constraints have no IF NOT EXISTS, so each must be behind a catalog check.
  for (const [, name] of sql.matchAll(/ADD CONSTRAINT (\w+)/g)) {
    assert.match(
      sql,
      new RegExp(`conname = '${name}'`),
      `ADD CONSTRAINT ${name} is not guarded by a pg_constraint check`,
    );
  }
});

test("the whole migration is one transaction, so a failure rolls everything back", async () => {
  const q = fakeQuery({ fail: true });
  await assert.rejects(() => runTenancyMigrations(q), /migration transaction failed/);

  // One transaction means one rollback boundary: no version row can be
  // recorded for work that did not land.
  assert.equal(q.transactions.length, 1);
  const statements = q.transactions[0];
  assert.match(statements[0].text, /pg_advisory_xact_lock/);
  assert.ok(
    statements.some((s) => /INSERT INTO ghic_schema_migrations/.test(s.text)),
    "version records must be inside the same transaction as the work",
  );
});

// ---------------------------------------------------------------------------
// Regression: the first production run aborted here.
//
//   NeonDbError: tenancy migration validation failed: repository state mismatch
//   code P0001, PL/pgSQL inline_code_block line 54 at RAISE
//
// Production held 1 ghic_repository_state row and 1891 ghic_repo_chunks rows
// for Faisalhakimi22/github-issue-classifier, and 0 rows in
// ghic_github_repositories -- because GHIC indexes out of band, the Vercel
// Python runtime having no git. The validation asserted that every indexed
// repository is also a connected repository, which is not true of this system.
// ---------------------------------------------------------------------------

function validationClause(sql, table, alias) {
  // The EXISTS body of the check guarding `table`, from its FROM to its
  // closing paren.
  const start = sql.indexOf(`FROM ${table} ${alias}\n`);
  assert.ok(start > 0, `${table} validation block not found`);
  return sql.slice(start, sql.indexOf(") THEN", start));
}

test("validation no longer rejects an indexed repository that is not connected", async () => {
  const { sql } = await migrationSql();

  for (const [table, alias] of [
    ["ghic_repository_state", "s"],
    ["ghic_repo_chunks", "c"],
  ]) {
    const clause = validationClause(sql, table, alias);
    // The exact condition that aborted the production run.
    assert.doesNotMatch(
      clause,
      /OR r\.repo_full_name IS NULL/,
      `${table} still rejects rows with no connected repository`,
    );
  }
});

test("the mismatch arm cannot fire on an unmatched LEFT JOIN row", async () => {
  const { sql } = await migrationSql();

  for (const [table, alias] of [
    ["ghic_repository_state", "s"],
    ["ghic_repo_chunks", "c"],
  ]) {
    const clause = validationClause(sql, table, alias);
    // Deleting the rejection alone is not enough. An unmatched LEFT JOIN
    // row has r.workspace_id = NULL, and NULL IS DISTINCT FROM 'ghic-...'
    // evaluates TRUE, so the mismatch condition would raise the very same
    // error. It must be guarded by the row actually existing.
    assert.match(
      clause,
      new RegExp(
        `r\\.repo_full_name IS NOT NULL\\s+AND r\\.workspace_id IS DISTINCT FROM ${alias}\\.workspace_id`,
      ),
      `${table} mismatch check is not guarded by repository existence`,
    );
  }
});

test("validation still rejects an unattributed row", async () => {
  const { sql } = await migrationSql();

  // The check that the backfill actually ran. Losing this would let the
  // migration record success while leaving rows with no workspace at all.
  for (const [table, alias] of [
    ["ghic_repository_state", "s"],
    ["ghic_repo_chunks", "c"],
  ]) {
    const clause = validationClause(sql, table, alias);
    assert.match(
      clause,
      new RegExp(`WHERE ${alias}\\.workspace_id IS NULL`),
      `${table} no longer checks for unattributed rows`,
    );
  }
});

test("validation still rejects genuine cross-tenant corruption", async () => {
  const { sql } = await migrationSql();

  // A connected repository in workspace A whose state/chunks claim
  // workspace B is real corruption and must still abort the migration.
  for (const [table, alias] of [
    ["ghic_repository_state", "s"],
    ["ghic_repo_chunks", "c"],
  ]) {
    const clause = validationClause(sql, table, alias);
    assert.match(
      clause,
      new RegExp(`r\\.workspace_id IS DISTINCT FROM ${alias}\\.workspace_id`),
      `${table} no longer detects a workspace mismatch`,
    );
  }
  assert.match(sql, /repository state mismatch/);
  assert.match(sql, /repository chunk mismatch/);
});

// The predicate's truth table, stated explicitly. This mirrors the SQL
// rather than executing it -- only a real database proves the SQL itself,
// which is why the fix was also evaluated read-only against production.
// Its value is pinning the intended semantics so a future edit that changes
// them has to change this table too, deliberately.
test("the validation predicate has the intended truth table", () => {
  const raises = (row) =>
    row.workspace_id === null ||
    (row.repo_full_name !== null && row.repo_workspace_id !== row.workspace_id);

  const WS = "ghic-default-workspace";

  // The production case: indexed, never connected, swept to the default.
  assert.equal(
    raises({ workspace_id: WS, repo_full_name: null, repo_workspace_id: null }),
    false,
    "an unconnected indexed repository must not abort the migration",
  );
  // Backfill failed to attribute the row.
  assert.equal(
    raises({ workspace_id: null, repo_full_name: null, repo_workspace_id: null }),
    true,
    "an unattributed row must abort the migration",
  );
  // Connected and consistent.
  assert.equal(
    raises({ workspace_id: WS, repo_full_name: "a/b", repo_workspace_id: WS }),
    false,
  );
  // Connected and contradictory -- cross-tenant corruption.
  assert.equal(
    raises({ workspace_id: WS, repo_full_name: "a/b", repo_workspace_id: "other" }),
    true,
    "a workspace mismatch must abort the migration",
  );
});

test("the production row shape passes every v2 validation check", async () => {
  const { sql } = await migrationSql();

  // 0 connected repositories means the repository-ownership and
  // installation checks iterate empty sets and cannot raise; the intent
  // table is likewise empty. The state and chunk checks are the only ones
  // that see rows, and they are the two just fixed.
  for (const check of [
    "repository ownership mismatch",
    "invalid installation workspace",
    "invalid installation intent workspace",
  ]) {
    assert.match(sql, new RegExp(check), `${check} check disappeared`);
  }
  // Ledger rows stay unattributed, and the ledger check only fires when a
  // row HAS a workspace it should not have.
  assert.match(sql, /l\.workspace_id IS NOT NULL\s+AND r\.repo_full_name IS NULL/);
});

// ---------------------------------------------------------------------------
// The v2 fix was incomplete: v3 carried a byte-identical copy of both checks
// under different RAISE messages ("ownership migration validation failed:
// repository state workspace" / "... repository chunk workspace"). Evaluated
// read-only against production, the shipped v3 form rejected 1 state row and
// 1891 chunk rows -- it would have aborted the retry immediately after v2
// finally succeeded.
//
// These assertions are global rather than per-version, so a third copy in a
// future migration fails here instead of in production.
// ---------------------------------------------------------------------------

test("no validation anywhere rejects an indexed repository for not being connected", async () => {
  const { sql } = await migrationSql();

  // Deliberately narrow: `AND r.repo_full_name IS NULL` is legitimate and
  // used by the ledger checks, where absence of a repository is the thing
  // being tested. Only the disjunctive form is a rejection of the row.
  const offenders = [...sql.matchAll(/OR\s+r\.repo_full_name IS NULL/g)];
  assert.equal(
    offenders.length,
    0,
    `${offenders.length} validation(s) still reject rows with no connected repository`,
  );
});

test("every state/chunk validation guards its mismatch arm against the LEFT JOIN null", async () => {
  const { sql } = await migrationSql();

  // v2 state, v2 chunks, v3 state, v3 chunks.
  const guarded = [
    ...sql.matchAll(
      /r\.repo_full_name IS NOT NULL\s+AND r\.workspace_id IS DISTINCT FROM [sc]\.workspace_id/g,
    ),
  ];
  assert.equal(
    guarded.length,
    4,
    `expected 4 guarded mismatch arms (v2 + v3, state + chunks), found ${guarded.length}`,
  );
});

test("v3 ownership validations survive the correction", async () => {
  const { sql } = await migrationSql();

  // The checks must still exist and still catch unattributed rows -- the
  // fix narrows what they reject, it does not remove them.
  for (const message of [
    "ownership migration validation failed: repository state workspace",
    "ownership migration validation failed: repository chunk workspace",
  ]) {
    assert.match(sql, new RegExp(message.replace(/[:]/g, "[:]")));
  }
  assert.match(sql, /WHERE s\.workspace_id IS NULL/);
  assert.match(sql, /WHERE c\.workspace_id IS NULL/);
});

test("v3 validations that passed the production audit are unchanged", async () => {
  const { sql } = await migrationSql();

  // These were measured against production and returned 0 rows. Pinning
  // them so a later edit cannot silently alter what they accept.
  for (const message of [
    "ownership migration validation failed: installation workspace",
    "ownership migration validation failed: repository workspace",
    "ownership migration validation failed: installation intent workspace",
    "ownership migration validation failed: duplicate installation ownership",
    "ownership migration validation failed: duplicate repository ownership",
  ]) {
    assert.ok(sql.includes(message), `${message} disappeared`);
  }
  // v4's single check, likewise measured at 0 rows.
  assert.ok(
    sql.includes(
      "ledger ownership validation failed: workspace attribution is conflicting or incomplete",
    ),
  );
});
