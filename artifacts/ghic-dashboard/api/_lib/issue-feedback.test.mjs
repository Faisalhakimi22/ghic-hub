import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { parseIssueIdentifier, readIssueFeedback, saveIssueFeedback, validateFeedback } from "./issue-feedback.mjs";
import { activityFromLedgerRow, readIssues } from "./product-data.mjs";

// Real PostgreSQL statements, disposable memory only. Never application bootstrap.
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE ghic_workspace_members (workspace_id text, firebase_uid text, role text,
      PRIMARY KEY(workspace_id, firebase_uid));
    CREATE TABLE ghic_github_installations (installation_id bigint PRIMARY KEY,
      workspace_id text NOT NULL, connection_status text, revoked_at timestamptz);
    CREATE TABLE ghic_github_repositories (repo_full_name text PRIMARY KEY,
      workspace_id text NOT NULL, installation_id bigint NOT NULL, active boolean);
    CREATE TABLE ghic_ledger (id bigserial PRIMARY KEY, workspace_id text,
      data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO ghic_workspace_members VALUES ('a','alice','owner'),('b','bob','owner');
    INSERT INTO ghic_github_installations VALUES (10,'a','connected',NULL),(20,'b','connected',NULL);
    INSERT INTO ghic_github_repositories VALUES ('a/repo','a',10,true),('b/repo','b',20,true);
    INSERT INTO ghic_ledger(workspace_id,data) VALUES
      ('a','{"type":"analysis","repo":"a/repo","number":1,"analysis_status":"complete","title":"A issue"}'),
      ('b','{"type":"analysis","repo":"b/repo","number":1,"analysis_status":"complete","title":"B issue"}');
  `);
  const q = (text, values = []) => ({
    text, values,
    then(resolve, reject) { return db.query(text, values).then((r) => r.rows).then(resolve, reject); },
  });
  q.transaction = (statements) => db.transaction(async (tx) => {
    const results = [];
    for (const s of statements) results.push((await tx.query(s.text, s.values)).rows);
    return results;
  });
  const deps = { getDatabase: async () => q, getCapabilities: async () => ({ ledger: true }) };
  const viewer = { id: "alice", name: "Alice", workspaceId: "a", role: "owner", workspaceRole: "owner" };
  const input = () => ({ requestId: randomUUID(), analysisId: "1", decision: "accepted" });
  const save = (body = input(), actor = viewer, issue = "a~repo~1") => saveIssueFeedback(actor, issue, body, deps);
  const events = async () => (await db.query("SELECT * FROM ghic_ledger WHERE data->>'type'='maintainer_feedback'")).rows;
  return { db, q, deps, viewer, input, save, events };
}

test("real SQL appends a maintainer decision without modifying the analysis", async (t) => {
  const f = await fixture(t);
  const before = (await f.db.query("SELECT * FROM ghic_ledger ORDER BY id")).rows;
  const response = await f.save({ ...f.input(), decision: "corrected", classification: "question", reason: "A usage question." });
  assert.equal(response.feedback.decision, "corrected");
  assert.equal(response.feedback.analysisId, "1");
  assert.equal(response.feedback.actor, "Alice");
  assert.equal(response.replayed, false);
  assert.deepEqual((await f.db.query("SELECT * FROM ghic_ledger WHERE id <= 2 ORDER BY id")).rows, before);
  const [event] = await f.events();
  assert.equal(event.workspace_id, "a");
  assert.equal(event.data.workspace_id, "a");
  assert.equal(event.data.installation_id, 10);
  assert.equal(event.data.actor_uid, "alice");
  const feed = await readIssueFeedback(f.viewer, "a~repo~1", f.deps);
  assert.equal(feed.analysisId, "1");
  assert.equal(feed.items.length, 1);
  const activity = activityFromLedgerRow(event);
  assert.equal(activity.actor, "Alice");
  assert.equal(activity.title, "Maintainer decision recorded");
  assert.doesNotMatch(JSON.stringify(activity), /A usage question/);
});

for (const role of ["owner", "admin", "member", "viewer"]) {
  test(`feedback preserves ${role} workspace permissions`, async (t) => {
    const f = await fixture(t);
    await f.db.query("UPDATE ghic_workspace_members SET role=$1 WHERE firebase_uid='alice'", [role]);
    const actor = { ...f.viewer, role, workspaceRole: role };
    if (["owner", "admin"].includes(role)) {
      await f.save(f.input(), actor);
      assert.equal((await f.events()).length, 1);
    } else {
      await assert.rejects(() => f.save(f.input(), actor), { status: 403 });
      assert.equal((await f.events()).length, 0);
    }
  });
}

for (const change of [
  "DELETE FROM ghic_workspace_members WHERE firebase_uid='alice'",
  "UPDATE ghic_workspace_members SET role='viewer' WHERE firebase_uid='alice'",
]) {
  test(`stale actor cannot bypass current membership: ${change.split(" ")[0]}`, async (t) => {
    const f = await fixture(t);
    await f.db.exec(change);
    await assert.rejects(() => f.save(), { status: 403 });
    assert.equal((await f.events()).length, 0);
  });
}

test("cross-workspace repository, analysis and history are isolated by real SQL", async (t) => {
  const f = await fixture(t);
  await assert.rejects(() => f.save({ ...f.input(), analysisId: "2" }), { status: 409 });
  await assert.rejects(() => f.save({ ...f.input(), analysisId: "2" }, f.viewer, "b~repo~1"), { status: 409 });
  await f.save({ ...f.input(), analysisId: "2" }, { ...f.viewer, id: "bob", workspaceId: "b" }, "b~repo~1");
  assert.deepEqual(await readIssueFeedback(f.viewer, "b~repo~1", f.deps), { items: [], analysisId: null });
  assert.equal((await f.events()).length, 1);
  await assert.rejects(() => f.save(f.input(), { ...f.viewer, workspaceId: "" }), { status: 403 });
});

for (const sql of [
  "UPDATE ghic_github_installations SET connection_status='disconnected' WHERE installation_id=10",
  "UPDATE ghic_github_installations SET connection_status='revoked' WHERE installation_id=10",
  "UPDATE ghic_github_installations SET connection_status='suspended' WHERE installation_id=10",
  "UPDATE ghic_github_installations SET connection_status=NULL WHERE installation_id=10",
  "UPDATE ghic_github_installations SET revoked_at=now() WHERE installation_id=10",
  "UPDATE ghic_github_repositories SET active=false WHERE repo_full_name='a/repo'",
  "UPDATE ghic_github_repositories SET installation_id=20 WHERE repo_full_name='a/repo'",
]) {
  test(`connection must be valid: ${sql}`, async (t) => {
    const f = await fixture(t);
    await f.db.exec(sql);
    await assert.rejects(() => f.save(), { status: 409 });
    assert.equal((await f.events()).length, 0);
  });
}

test("concurrent duplicate submissions append exactly one event", async (t) => {
  const f = await fixture(t);
  const input = f.input();
  const responses = await Promise.all([f.save(input), f.save(input), f.save(input)]);
  assert.equal((await f.events()).length, 1);
  assert.equal(responses.filter((r) => !r.replayed).length, 1);
  assert.equal(new Set(responses.map((r) => r.feedback.id)).size, 1);
  await assert.rejects(() => f.save({ ...input, decision: "rejected" }), { status: 409 });
  assert.equal((await f.events()).length, 1);
});

test("feedback never applies an old decision to a newer analysis, including failed analyses", async (t) => {
  const f = await fixture(t);
  await f.db.exec(`INSERT INTO ghic_ledger(workspace_id,data)
    SELECT 'a',jsonb_build_object('type','analysis','repo','a/repo','number',1,'analysis_status','complete')
    FROM generate_series(1,12)`);
  assert.equal((await readIssueFeedback(f.viewer, "a~repo~1", f.deps)).analysisId, "14");
  await assert.rejects(() => f.save(), { status: 409 });
  await f.save({ ...f.input(), analysisId: "14" });
  await f.db.exec(`INSERT INTO ghic_ledger(workspace_id,data)
    VALUES ('a','{"type":"analysis","repo":"a/repo","number":1,"analysis_status":"failed"}')`);
  assert.equal((await readIssueFeedback(f.viewer, "a~repo~1", f.deps)).analysisId, null);
  await assert.rejects(() => f.save({ ...f.input(), analysisId: "14" }), { status: 409 });
});

test("database failure rolls back without a partial decision", async (t) => {
  const f = await fixture(t);
  await f.db.exec(`ALTER TABLE ghic_ledger ADD CONSTRAINT test_reject_feedback
    CHECK (data->>'type' <> 'maintainer_feedback')`);
  await assert.rejects(() => f.save(), /test_reject_feedback/);
  assert.equal((await f.events()).length, 0);
  await f.db.exec("ALTER TABLE ghic_ledger DROP CONSTRAINT test_reject_feedback");
  await f.save();
  assert.equal((await f.events()).length, 1);
});

test("exact issue lookup finds an old analysis beyond the newest 100 without crossing tenants", async (t) => {
  const f = await fixture(t);
  await f.db.exec(`INSERT INTO ghic_ledger(workspace_id,data,created_at)
    SELECT 'a',jsonb_build_object('type','analysis','repo','a/repo','number',n,'analysis_status','complete'), now() + interval '1 day'
    FROM generate_series(2,110) n`);
  const result = await readIssues({ workspaceId: "a", repositoryId: "a~repo", issueNumber: 1, limit: 1 }, f.deps);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].number, 1);
  assert.equal(result.items[0].analysisId, "1");
  assert.equal((await readIssues({ workspaceId: "a", repositoryId: "b~repo", issueNumber: 1 }, f.deps)).total, 0);
});

test("feedback input rejects workspace spoofing, invalid identifiers and obvious credentials", () => {
  const valid = { requestId: randomUUID(), analysisId: "1", decision: "accepted" };
  assert.deepEqual(parseIssueIdentifier("owner~repo~12"), { repo: "owner/repo", number: 12 });
  for (const id of ["a~repo~0", "a~repo~-1", "a~repo~NaN", "a~repo~2147483648", "%xx~1", "x~1"]) {
    assert.throws(() => parseIssueIdentifier(id), { status: 400 });
  }
  for (const patch of [
    { workspaceId: "b" }, { analysisId: "0" }, { requestId: "invalid" }, { decision: "unknown" },
    { decision: "corrected" }, { classification: "bug" }, { reason: "x".repeat(1001) },
    { reason: "postgresql://synthetic.invalid" }, { reason: "-----BEGIN PRIVATE KEY-----" },
    { reason: "Bearer synthetic-test-value" },
  ]) assert.throws(() => validateFeedback({ ...valid, ...patch }), { status: 400 });
});

test("invalid issue-number filters fail before any database access", async () => {
  for (const issueNumber of ["invalid", 0, -1, 1.5, 2147483648]) {
    await assert.rejects(() => readIssues({ workspaceId: "a", issueNumber }, {
      getDatabase: async () => assert.fail("Must not access the database"),
    }), { status: 400 });
  }
});
