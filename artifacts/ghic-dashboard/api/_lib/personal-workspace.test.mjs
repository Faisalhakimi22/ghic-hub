import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PERSONAL_WORKSPACE_NAME,
  bootstrapUserWorkspace,
  newWorkspaceId,
} from "./db.mjs";
import { getGitHubConnectionSummary } from "./github-installations.mjs";

/**
 * A store that applies the bootstrap CTE's semantics rather than matching its
 * text. Asserting that a statement *mentions* a workspace proves nothing about
 * who ends up owning what, and ownership is the entire point here.
 */
function bootstrapStore() {
  const users = new Map();
  const workspaces = new Map();
  const settings = new Map();
  const members = new Map(); // `${workspaceId}|${uid}` -> role
  const statements = [];
  let lock = Promise.resolve();

  const q = (strings, ...values) => {
    const query = { text: strings.join("?").replace(/\s+/g, " ").trim(), values };
    statements.push(query);
    return query;
  };

  q.transaction = (queries) => {
    const run = lock.then(() => {
      const cte = queries[1];
      const uid = cte.values[0];
      const workspaceId = cte.values[5];

      // INSERT ... ON CONFLICT (firebase_uid) DO NOTHING
      if (users.has(uid)) return [[], []];
      const user = {
        firebase_uid: uid,
        github_id: cte.values[1],
        name: cte.values[2],
        email: cte.values[3],
        avatar_url: cte.values[4],
        role: "owner",
        settings: {},
      };

      // The workspace CTE is gated on the account having no membership yet.
      const alreadyAMember = [...members.keys()].some((key) => key.endsWith(`|${uid}`));
      if (alreadyAMember) return [[], []];

      users.set(uid, user);
      workspaces.set(workspaceId, { id: workspaceId, name: cte.values[6] });
      settings.set(workspaceId, { workspace_id: workspaceId, workspace_name: cte.values[6] });
      members.set(`${workspaceId}|${uid}`, "owner");
      return [[], [user]];
    });
    lock = run.catch(() => {});
    return run;
  };

  return { q, statements, users, workspaces, settings, members };
}

const claims = (uid) => ({
  uid,
  githubId: null,
  name: uid,
  email: `${uid}@example.test`,
  avatarUrl: null,
});

function workspaceOf(store, uid) {
  const key = [...store.members.keys()].find((k) => k.endsWith(`|${uid}`));
  return key ? key.split("|")[0] : null;
}

test("two accounts get two separate workspaces, each its own owner", async () => {
  const store = bootstrapStore();
  const a = await bootstrapUserWorkspace(store.q, claims("user-a"), "ws_aaa");
  const b = await bootstrapUserWorkspace(store.q, claims("user-b"), "ws_bbb");

  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(store.workspaces.size, 2);
  assert.notEqual(workspaceOf(store, "user-a"), workspaceOf(store, "user-b"));
  assert.equal(store.members.get("ws_aaa|user-a"), "owner");
  assert.equal(store.members.get("ws_bbb|user-b"), "owner");
  // Neither account is a member of the other's workspace, which is what makes
  // every workspace-scoped query isolate them.
  assert.equal(store.members.has("ws_aaa|user-b"), false);
  assert.equal(store.members.has("ws_bbb|user-a"), false);
});

test("the second account is admitted rather than refused", async () => {
  // The old bootstrap allowed exactly one account ever and 403'd the rest,
  // because there was one shared workspace to protect. Per-account workspaces
  // remove the thing that needed protecting.
  const store = bootstrapStore();
  await bootstrapUserWorkspace(store.q, claims("user-a"), "ws_aaa");
  const second = await bootstrapUserWorkspace(store.q, claims("user-b"), "ws_bbb");
  assert.equal(second.length, 1);
  assert.equal(second[0].firebase_uid, "user-b");
});

test("signing in again never mints a second workspace", async () => {
  const store = bootstrapStore();
  await bootstrapUserWorkspace(store.q, claims("user-a"), "ws_aaa");
  const again = await bootstrapUserWorkspace(store.q, claims("user-a"), "ws_ccc");

  assert.equal(again.length, 0);
  assert.equal(store.workspaces.size, 1);
  assert.equal(store.workspaces.has("ws_ccc"), false);
  assert.equal(workspaceOf(store, "user-a"), "ws_aaa");
});

test("concurrent signups for one identity produce one workspace", async () => {
  const store = bootstrapStore();
  const results = await Promise.all([
    bootstrapUserWorkspace(store.q, claims("user-a"), "ws_first"),
    bootstrapUserWorkspace(store.q, claims("user-a"), "ws_second"),
  ]);
  assert.equal(results.filter((rows) => rows.length === 1).length, 1);
  assert.equal(results.filter((rows) => rows.length === 0).length, 1);
  assert.equal(store.workspaces.size, 1);
  assert.equal([...store.members.keys()].length, 1);
});

test("the signup is one transaction and is locked per account", async () => {
  const store = bootstrapStore();
  await bootstrapUserWorkspace(store.q, claims("user-a"), "ws_aaa");

  assert.match(store.statements[0].text, /pg_advisory_xact_lock/);
  // Per-account, not global: a single global lock would serialise every
  // signup in the product behind one queue.
  assert.match(store.statements[0].text, /ghic\.user-bootstrap:/);
  assert.equal(store.statements[0].values[0], "user-a");

  const cte = store.statements[1].text;
  for (const fragment of [
    /WITH inserted_user AS/,
    /inserted_workspace AS/,
    /inserted_settings AS/,
    /inserted_membership AS/,
    /JOIN inserted_membership/,
  ]) {
    assert.match(cte, fragment);
  }
});

test("a user is never left without a workspace or membership", async () => {
  // The final SELECT joins the user CTE to the membership CTE, so a run that
  // created a user but no membership returns nothing and the caller treats it
  // as a failed signup rather than admitting a half-made account.
  const store = bootstrapStore();
  store.members.set("ws_pre|user-a", "owner"); // membership exists, user row does not
  const result = await bootstrapUserWorkspace(store.q, claims("user-a"), "ws_new");

  assert.equal(result.length, 0);
  assert.equal(store.users.has("user-a"), false);
  assert.equal(store.workspaces.has("ws_new"), false);
});

test("nothing about a workspace is derived from the account", async () => {
  const claim = claims("user-a");
  const first = newWorkspaceId();
  const second = newWorkspaceId();

  assert.notEqual(first, second);
  assert.match(first, /^ws_[0-9a-f]{32}$/);
  for (const value of [claim.uid, claim.email, claim.name]) {
    assert.equal(first.includes(value), false);
  }
  // The displayed name is a constant the owner can change later, not
  // something lifted out of the token.
  assert.equal(DEFAULT_PERSONAL_WORKSPACE_NAME, "Personal Workspace");
});

test("runtime signup never touches the shared migration workspace", async () => {
  const store = bootstrapStore();
  await bootstrapUserWorkspace(store.q, claims("user-a"), newWorkspaceId());
  for (const statement of store.statements) {
    assert.equal(statement.text.includes("ghic-default-workspace"), false);
    assert.equal(statement.values.includes("ghic-default-workspace"), false);
  }
});

/**
 * Isolation at the query layer. The bootstrap tests prove two accounts own
 * two workspaces; these prove a workspace-scoped read cannot see across them.
 */
function connectionStore(rowsByWorkspace) {
  const seen = [];
  const q = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    seen.push({ text, values });
    if (text.startsWith("SELECT installation_id")) {
      const workspaceId = values[0];
      return Promise.resolve(rowsByWorkspace[workspaceId] ?? []);
    }
    return Promise.resolve([]);
  };
  return {
    seen,
    value: { database: async () => q, githubAppConfigured: () => true },
  };
}

const INSTALLATION_A = {
  installation_id: 111, account_login: "alice", account_type: "User",
  repository_selection: "selected", repository_count: 1, connection_status: "connected",
  revoked_at: null, connected_at: new Date().toISOString(),
  updated_at: new Date().toISOString(), status_reason: null, status_changed_at: null,
};
const INSTALLATION_B = { ...INSTALLATION_A, installation_id: 222, account_login: "bob" };

test("a workspace read returns only that workspace's installation", async () => {
  const store = connectionStore({ ws_aaa: [INSTALLATION_A], ws_bbb: [INSTALLATION_B] });

  const a = await getGitHubConnectionSummary("ws_aaa", store.value);
  const b = await getGitHubConnectionSummary("ws_bbb", store.value);

  assert.deepEqual(a.installations.map((i) => i.installationId), [111]);
  assert.deepEqual(b.installations.map((i) => i.installationId), [222]);
  // The workspace is a bound parameter on every read, not a filter applied
  // after the fact in JavaScript.
  for (const statement of store.seen) {
    assert.equal(statement.values[0].startsWith("ws_"), true);
  }
});

test("an account with no installations sees an empty workspace, not another's", async () => {
  const store = connectionStore({ ws_aaa: [INSTALLATION_A] });
  const b = await getGitHubConnectionSummary("ws_bbb", store.value);
  assert.deepEqual(b.installations, []);
});

test("a workspace-scoped read fails closed with no workspace", async () => {
  const store = connectionStore({});
  for (const workspaceId of [undefined, null, "", "   "]) {
    await assert.rejects(
      getGitHubConnectionSummary(workspaceId, store.value),
      (error) => error.status === 403,
    );
  }
});
