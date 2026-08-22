import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import { getGitHubConnectionSummary } from "./github-installations.mjs";

/**
 * Guards against selecting a column that does not exist.
 *
 * getGitHubConnectionSummary selected `connected_at` from
 * ghic_github_installations for as long as the endpoint existed. That column
 * lives on ghic_github_repositories, not on installations, so every call
 * failed with SQLSTATE 42703 and the dashboard silently rendered no GitHub
 * connection panel at all -- the request failed, so the "nothing connected"
 * branch never ran.
 *
 * Every existing test passed throughout, because they fake the query function
 * with canned row objects. A fake will answer any column you ask it for. The
 * only way to catch this without a live database is to check the SQL against
 * the schema the application itself declares, which is what this does.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (name) => readFileSync(join(HERE, name), "utf8");

/** Columns a table has, read from the statements that create and alter it. */
function declaredColumns(table) {
  const files = [source("db.mjs"), source("migrations.mjs")];
  const columns = new Set();

  for (const text of files) {
    // CREATE TABLE ... ( ... ) -- take the identifier starting each line.
    const create = new RegExp(
      `CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\)`,
      "g",
    );
    for (const match of text.matchAll(create)) {
      for (const line of match[1].split("\n")) {
        const name = line.trim().match(/^([a-z_][a-z0-9_]*)\s+[A-Za-z]/);
        // CONSTRAINT/PRIMARY/FOREIGN etc. are not columns.
        if (name && !/^(constraint|primary|foreign|unique|check)$/i.test(name[1])) {
          columns.add(name[1]);
        }
      }
    }

    // ALTER TABLE ... ADD COLUMN IF NOT EXISTS <name>
    const alter = new RegExp(
      `ALTER TABLE ${table}\\s+ADD COLUMN IF NOT EXISTS\\s+([a-z_][a-z0-9_]*)`,
      "gi",
    );
    for (const match of text.matchAll(alter)) columns.add(match[1]);
  }
  return columns;
}

/** Remove balanced parenthesised groups so subqueries do not confuse parsing. */
function stripGroups(text) {
  let out = "";
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (depth === 0) out += char;
  }
  return out;
}

/** Bare column identifiers selected from `table` in one statement. */
function selectedColumns(sql, table) {
  const flat = sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ");
  const match = flat.match(new RegExp(`SELECT (.*?) FROM ${table}\\b`, "i"));
  if (!match) return [];
  return stripGroups(match[1])
    .split(",")
    .map((part) => part.trim().split(/\s+AS\s+/i)[0].trim())
    .filter((expression) => /^[a-z_][a-z0-9_]*$/.test(expression));
}

function captureSql() {
  const statements = [];
  const q = (strings, ...values) => {
    statements.push(strings.join(" ? "));
    return Promise.resolve([]);
  };
  return {
    statements,
    deps: { database: async () => q, githubAppConfigured: () => true },
  };
}

test("the schema reader finds the columns it is supposed to", async () => {
  const columns = declaredColumns("ghic_github_installations");
  // Sanity: if this parsing broke, every assertion below would pass vacuously.
  for (const expected of [
    "installation_id", "account_login", "account_type", "account_github_id",
    "repository_selection", "connected_by_firebase_uid", "connection_status",
    "status_reason", "status_changed_at", "created_at", "updated_at",
    "revoked_at", "workspace_id",
  ]) {
    assert.ok(columns.has(expected), `expected to find column ${expected}`);
  }
  // The column that never existed on this table.
  assert.equal(columns.has("connected_at"), false);
});

test("every column the connection summary selects exists on the table", async () => {
  const capture = captureSql();
  await getGitHubConnectionSummary("ws_test", capture.deps);

  const columns = declaredColumns("ghic_github_installations");
  const statement = capture.statements.find((text) =>
    /FROM ghic_github_installations/.test(text),
  );
  assert.ok(statement, "the summary should query ghic_github_installations");

  const selected = selectedColumns(statement, "ghic_github_installations");
  assert.ok(selected.length >= 8, `parsed too few columns: ${selected}`);

  for (const column of selected) {
    assert.ok(
      columns.has(column),
      `SELECT references ${column}, which ghic_github_installations does not have`,
    );
  }
});

test("the summary still exposes connectedAt to callers", async () => {
  // The fix aliases created_at, so the API contract must not have moved.
  const capture = captureSql();
  await getGitHubConnectionSummary("ws_test", capture.deps);
  const statement = capture.statements.find((text) =>
    /FROM ghic_github_installations/.test(text),
  );
  assert.match(statement, /created_at AS connected_at/);
});

test("a column that does not exist would be caught", async () => {
  // Proves the guard has teeth rather than passing because nothing is checked.
  const columns = declaredColumns("ghic_github_installations");
  const bogus = selectedColumns(
    "SELECT installation_id, connected_at FROM ghic_github_installations WHERE x",
    "ghic_github_installations",
  );
  assert.deepEqual(bogus, ["installation_id", "connected_at"]);
  assert.equal(columns.has("connected_at"), false);
});
