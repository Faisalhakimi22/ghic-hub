import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { runTenancyMigrations } from "./migrations.mjs";

// No URL, environment lookup, network driver, or application bootstrap. The
// actual migration statements run against disposable in-memory PostgreSQL.
function queryAdapter(db) {
  const q = (parts, ...values) => ({
    text: parts.reduce((sql, part, i) => sql + part + (i < values.length ? `$${i + 1}` : ""), ""),
    values,
  });
  q.transaction = (statements) => db.transaction(async (tx) => {
    for (const statement of statements) await tx.query(statement.text, statement.values);
  });
  return q;
}

async function pythonTables(db, { stateRepo = "a/repo", stateWorkspace = "a", chunkRepo = "a/repo", chunkWorkspace = "a" } = {}) {
  await db.exec(`
    CREATE TABLE ghic_repository_state (repo TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, data JSONB NOT NULL);
    CREATE TABLE ghic_repo_chunks (id TEXT PRIMARY KEY, repo TEXT NOT NULL, path TEXT NOT NULL,
      workspace_id TEXT NOT NULL, embedding vector(1536) NOT NULL);
    CREATE TABLE ghic_ledger (id BIGSERIAL PRIMARY KEY, workspace_id TEXT, data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  `);
  await db.query("INSERT INTO ghic_repository_state VALUES ($1, $2, $3::jsonb)", [stateRepo, stateWorkspace, JSON.stringify({ indexed_sha: "0123456789abcdef", status: "ready", dimensions: 1536 })]);
  // Synthetic numeric fixture, not an embedding provider result or production vector.
  const numericFixture = JSON.stringify(Array.from({ length: 1536 }, (_, i) => (i % 11) / 11));
  await db.query("INSERT INTO ghic_repo_chunks VALUES ('chunk-1', $1, 'main.py', $2, $3::vector)", [chunkRepo, chunkWorkspace, numericFixture]);
}

async function fixture(t, options = {}) {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await db.exec(`
    CREATE EXTENSION vector;
    CREATE TABLE ghic_schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
    INSERT INTO ghic_schema_migrations(version) VALUES (2),(3),(4),(5);
    CREATE TABLE ghic_users (firebase_uid TEXT PRIMARY KEY, role TEXT NOT NULL);
    INSERT INTO ghic_users VALUES ('user-a','owner'),('user-b','owner');
    CREATE TABLE ghic_workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    INSERT INTO ghic_workspaces(id,name) VALUES ('a','Workspace A'),('b','Workspace B');
    CREATE TABLE ghic_org_settings (id INTEGER PRIMARY KEY CHECK (id = 1), workspace_name TEXT NOT NULL,
      settings JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT, workspace_id TEXT);
    CREATE TABLE ghic_github_installations (installation_id BIGINT PRIMARY KEY, workspace_id TEXT NOT NULL);
    INSERT INTO ghic_github_installations VALUES (10,'a'),(20,'b');
    CREATE TABLE ghic_github_repositories (repo_full_name TEXT PRIMARY KEY,
      installation_id BIGINT NOT NULL REFERENCES ghic_github_installations(installation_id), workspace_id TEXT NOT NULL);
    INSERT INTO ghic_github_repositories VALUES ('a/repo',10,'a'),('b/repo',20,'b');
    CREATE TABLE ghic_github_installation_intents (state_hash TEXT PRIMARY KEY, firebase_uid TEXT NOT NULL, workspace_id TEXT NOT NULL);
    CREATE TABLE ghic_plans (plan TEXT PRIMARY KEY, max_repositories INTEGER, max_issues_per_period INTEGER,
      period TEXT NOT NULL DEFAULT 'month', updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    INSERT INTO ghic_plans(plan,max_repositories,max_issues_per_period,period) VALUES ('starter',1,500,'month');
  `);
  if (!options.withoutPythonTables) await pythonTables(db, options);
  return { db, migrate: () => runTenancyMigrations(queryAdapter(db)) };
}

async function versions(db) {
  return (await db.query("SELECT version FROM ghic_schema_migrations ORDER BY version")).rows.map((r) => r.version);
}

async function protectedData(db) {
  return {
    chunks: (await db.query("SELECT id, repo, path, workspace_id, md5(embedding::text) AS hash, vector_dims(embedding) AS dimensions FROM ghic_repo_chunks ORDER BY id")).rows,
    state: (await db.query("SELECT * FROM ghic_repository_state ORDER BY repo")).rows,
    ledger: (await db.query("SELECT * FROM ghic_ledger ORDER BY id")).rows,
    type: (await db.query("SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = 'ghic_repo_chunks'::regclass AND attname = 'embedding'")).rows,
  };
}

async function assertRolledBack(db) {
  assert.deepEqual(await versions(db), [2, 3, 4, 5]);
  assert.deepEqual((await db.query("SELECT max_issues_per_period, period FROM ghic_plans WHERE plan = 'starter'")).rows, [{ max_issues_per_period: 500, period: "month" }]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'ghic_ledger_workspace_fk'")).rows[0].n, 0);
}

test("real SQL validates ownership, preserves vectors/SHA/history, and records v6/v7 once", async (t) => {
  const { db, migrate } = await fixture(t);
  await db.query("INSERT INTO ghic_ledger(workspace_id,data) VALUES ('a',$1),('b',$2),(NULL,$3)", [
    { repo: "a/repo", installation_id: 10 }, { installation_id: 20 }, { event: "legacy_unknown" },
  ]);
  const before = await protectedData(db);
  await migrate();
  assert.deepEqual(await versions(db), [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(await protectedData(db), before);
  assert.deepEqual(before.type, [{ type: "vector(1536)" }]);
  const constraints = (await db.query(`SELECT conname, convalidated FROM pg_constraint WHERE conname IN
    ('ghic_ledger_workspace_fk','ghic_state_repository_workspace_fk','ghic_chunks_repository_workspace_fk') ORDER BY conname`)).rows;
  assert.equal(constraints.length, 3);
  assert.ok(constraints.every((c) => c.convalidated));
  assert.deepEqual((await db.query("SELECT max_repositories, max_issues_per_period, period FROM ghic_plans WHERE plan = 'starter'")).rows,
    [{ max_repositories: 1, max_issues_per_period: 50, period: "day" }]);
  await migrate();
  assert.deepEqual(await versions(db), [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(await protectedData(db), before);
  assert.equal((await db.query("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'ghic_ledger' AND column_name = 'workspace_id'")).rows[0].is_nullable, "YES");
});

for (const [name, workspace, data, message] of [
  ["missing workspace", "absent", { repo: "a/repo" }, /invalid ledger workspace/],
  ["repository attribution conflict", "b", { repo: "a/repo" }, /conflicting ledger attribution/],
  ["installation attribution conflict", "b", { installation_id: 10 }, /conflicting ledger attribution/],
  ["repository/installation disagreement", "a", { repo: "a/repo", installation_id: 20 }, /conflicting ledger attribution/],
  ["unassigned repository/installation disagreement", null, { repo: "a/repo", installation_id: 20 }, /conflicting ledger attribution/],
]) {
  test(`real SQL rejects ${name} without rewriting historical attribution`, async (t) => {
    const { db, migrate } = await fixture(t);
    await db.query("INSERT INTO ghic_ledger(workspace_id,data) VALUES ($1,$2)", [workspace, data]);
    const before = await protectedData(db);
    await assert.rejects(migrate, message);
    await assertRolledBack(db);
    assert.deepEqual(await protectedData(db), before);
  });
}

test("failed real migration can retry after an operator corrects only the disposable fixture", async (t) => {
  const { db, migrate } = await fixture(t);
  await db.query("INSERT INTO ghic_ledger(workspace_id,data) VALUES ('b',$1)", [{ repo: "a/repo" }]);
  await assert.rejects(migrate, /conflicting ledger attribution/);
  await assertRolledBack(db);
  await db.exec("UPDATE ghic_ledger SET workspace_id = 'a'");
  await migrate();
  assert.deepEqual(await versions(db), [2, 3, 4, 5, 6, 7]);
});

for (const [name, options] of [
  ["orphan state", { stateRepo: "absent/repo" }],
  ["cross-workspace state", { stateWorkspace: "b" }],
  ["orphan chunks", { chunkRepo: "absent/repo" }],
  ["cross-workspace chunks", { chunkWorkspace: "b" }],
]) {
  test(`real constraint validation rejects ${name}, preserving all rows on rollback`, async (t) => {
    const { db, migrate } = await fixture(t, options);
    const before = await protectedData(db);
    await assert.rejects(migrate, { code: "23503" });
    await assertRolledBack(db);
    assert.deepEqual(await protectedData(db), before);
  });
}

test("real constraints reject new invalid writes and ownership transfers", async (t) => {
  const { db, migrate } = await fixture(t);
  await migrate();
  for (const sql of [
    "INSERT INTO ghic_ledger(workspace_id,data) VALUES ('absent','{}')",
    "INSERT INTO ghic_repository_state VALUES ('b/repo','a','{}')",
    "UPDATE ghic_repo_chunks SET workspace_id = 'b' WHERE id = 'chunk-1'",
    "INSERT INTO ghic_github_repositories VALUES ('other/repo',10,'b')",
  ]) await assert.rejects(() => db.exec(sql), { code: "23503" });
  for (const sql of [
    "UPDATE ghic_github_installations SET workspace_id = 'b' WHERE installation_id = 10",
    "UPDATE ghic_github_repositories SET installation_id = 20, workspace_id = 'b' WHERE repo_full_name = 'a/repo'",
  ]) await assert.rejects(() => db.exec(sql), /ownership is immutable/);
  await db.exec("INSERT INTO ghic_repository_state VALUES ('b/repo','b','{}'); INSERT INTO ghic_ledger(workspace_id,data) VALUES (NULL,'{}'),('a','{}');");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM ghic_repository_state")).rows[0].n, 2);
});

test("Python tables created after v7 receive validated constraints on the next bootstrap", async (t) => {
  const { db, migrate } = await fixture(t, { withoutPythonTables: true });
  await migrate();
  await pythonTables(db);
  await migrate();
  assert.deepEqual(await versions(db), [2, 3, 4, 5, 6, 7]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN ('ghic_ledger_workspace_fk','ghic_state_repository_workspace_fk','ghic_chunks_repository_workspace_fk') AND convalidated")).rows[0].n, 3);
});

test("late-created ledger cannot bypass attribution validation after v7 was recorded", async (t) => {
  const { db, migrate } = await fixture(t, { withoutPythonTables: true });
  await migrate();
  await pythonTables(db);
  await db.query("INSERT INTO ghic_ledger(workspace_id,data) VALUES ('b',$1)", [{ repo: "a/repo" }]);
  const before = await protectedData(db);
  await assert.rejects(migrate, /conflicting ledger attribution/);
  assert.deepEqual(await protectedData(db), before);
  assert.deepEqual(await versions(db), [2, 3, 4, 5, 6, 7]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'ghic_ledger_workspace_fk'")).rows[0].n, 0);
});

test("a populated NOT VALID ownership constraint is validated without changing data", async (t) => {
  const { db, migrate } = await fixture(t);
  await db.exec(`ALTER TABLE ghic_github_repositories ADD CONSTRAINT ghic_repositories_workspace_repo_key UNIQUE(workspace_id, repo_full_name);
    ALTER TABLE ghic_repository_state ADD CONSTRAINT ghic_state_repository_workspace_fk
      FOREIGN KEY(workspace_id, repo) REFERENCES ghic_github_repositories(workspace_id, repo_full_name) NOT VALID;
    ALTER TABLE ghic_repo_chunks ADD CONSTRAINT ghic_chunks_repository_workspace_fk
      FOREIGN KEY(workspace_id, repo) REFERENCES ghic_github_repositories(workspace_id, repo_full_name) NOT VALID;`);
  const before = await protectedData(db);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN ('ghic_state_repository_workspace_fk','ghic_chunks_repository_workspace_fk') AND NOT convalidated")).rows[0].n, 2);
  await migrate();
  assert.deepEqual(await protectedData(db), before);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN ('ghic_state_repository_workspace_fk','ghic_chunks_repository_workspace_fk') AND convalidated")).rows[0].n, 2);
});

test("a same-named constraint pointing at the wrong parent cannot satisfy the contract", async (t) => {
  const { db, migrate } = await fixture(t);
  await db.exec(`CREATE TABLE unrelated_workspaces(id TEXT PRIMARY KEY);
    ALTER TABLE ghic_ledger ADD CONSTRAINT ghic_ledger_workspace_fk
      FOREIGN KEY(workspace_id) REFERENCES unrelated_workspaces(id);`);
  await assert.rejects(migrate, /ledger constraint missing or invalid/);
  assert.deepEqual(await versions(db), [2, 3, 4, 5]);
});
