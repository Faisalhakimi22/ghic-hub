import assert from "node:assert/strict";
import test from "node:test";

import {
  completeGitHubInstallation,
  createGitHubInstallationIntent,
} from "./github-installations.mjs";

const VIEWER = {
  id: "firebase-user-1",
  githubId: "555",
  workspaceId: "ghic-workspace",
  workspaceRole: "owner",
};
const STATE = "callback-state";

function fakeDeps(options = {}) {
  const statements = [];
  let transactions = 0;
  const intent = options.intent === undefined
    ? {
        firebase_uid: VIEWER.id,
        workspace_id: "ghic-workspace",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumed_at: null,
        status: "pending",
      }
    : options.intent;
  const q = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push({ text, values });
    if (text.startsWith("SELECT firebase_uid, workspace_id")) {
      return Promise.resolve(intent ? [intent] : []);
    }
    if (text.startsWith("SELECT connected_by_firebase_uid")) {
      return Promise.resolve(options.existingInstallation ? [options.existingInstallation] : []);
    }
    if (text.startsWith("SELECT workspace_id, role FROM ghic_workspace_members")) {
      return Promise.resolve([{
        workspace_id: VIEWER.workspaceId,
        role: VIEWER.workspaceRole,
      }]);
    }
    if (text.startsWith("UPDATE ghic_github_installation_intents")) {
      return Promise.resolve(options.replay ? [] : [{ state_hash: "hash" }]);
    }
    if (text.startsWith("INSERT INTO ghic_github_installations")) {
      return Promise.resolve([{ installation_id: 100 }]);
    }
    if (text.startsWith("INSERT INTO ghic_github_repositories")) {
      return Promise.resolve([{ repo_full_name: "acme/widgets" }]);
    }
    return Promise.resolve([]);
  };
  const value = {
    database: async () => q,
    transaction: async (queries) => {
      transactions += 1;
      const transactionNumber = transactions;
      if (options.persistenceFailure) throw new Error("transaction failed");
      const results = await Promise.all(queries);
      if (options.concurrent && transactionNumber > 1) results[3] = [];
      return results;
    },
    githubAppConfigured: () => true,
    fetchInstallation: async () => {
      if (options.githubFailure) throw Object.assign(new Error("GitHub unavailable"), { status: 502 });
      return {
        id: 100,
        account: { id: 555, login: "octocat", type: "User" },
        repository_selection: "selected",
      };
    },
    listInstallationRepositories: async () => [
      { id: 1, full_name: "acme/widgets", private: false },
    ],
    fetchGitHubUserById: async () => ({ login: "octocat" }),
    verifyOrgMembership: async () => true,
    ...(options.value || {}),
  };
  return { value, statements, get transactions() { return transactions; } };
}

function completeInput(extra = {}) {
  return { installationId: 100, state: STATE, ...extra };
}

test("creates a cryptographically random short-lived installation intent", async () => {
  const d = fakeDeps();
  const result = await createGitHubInstallationIntent(VIEWER, d.value);
  assert.equal(result.ok, true);
  assert.match(result.installUrl, /state=[A-Za-z0-9_-]{40,}/);
  assert.ok(new Date(result.expiresAt).getTime() > Date.now());
  assert.equal(d.statements[0].text.startsWith("INSERT INTO ghic_github_installation_intents"), true);
  assert.notEqual(d.statements[0].values[0], new URL(result.installUrl).searchParams.get("state"));
});

test("missing and forged states fail before GitHub verification", async () => {
  const d = fakeDeps({ intent: null });
  await assert.rejects(
    completeGitHubInstallation(VIEWER, { installationId: 100 }, d.value),
    (error) => error.code === "installation_state_required",
  );
  await assert.rejects(
    completeGitHubInstallation(VIEWER, completeInput({ state: "forged" }), d.value),
    (error) => error.code === "invalid_installation_state",
  );
  assert.equal(d.transactions, 0);
});

test("expired, user-mismatched, and workspace-mismatched states fail closed", async () => {
  for (const intent of [
    {
      firebase_uid: VIEWER.id,
      workspace_id: "ghic-workspace",
      expires_at: new Date(Date.now() - 1_000).toISOString(),
      consumed_at: null,
      status: "pending",
    },
    {
      firebase_uid: "another-user",
      workspace_id: "ghic-workspace",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      consumed_at: null,
      status: "pending",
    },
    {
      firebase_uid: VIEWER.id,
      workspace_id: "another-workspace",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      consumed_at: null,
      status: "pending",
    },
  ]) {
    const d = fakeDeps({ intent });
    await assert.rejects(
      completeGitHubInstallation(VIEWER, completeInput(), d.value),
    );
    assert.equal(d.transactions, 0);
  }
});

test("cancellation consumes the intent and creates no installation", async () => {
  const d = fakeDeps();
  const result = await completeGitHubInstallation(
    VIEWER,
    { setupAction: "cancel", state: STATE },
    d.value,
  );
  assert.equal(result.cancelled, true);
  assert.equal(d.transactions, 1);
  assert.equal(d.statements.some((s) => s.text.startsWith("INSERT INTO ghic_github_installations")), false);
});

test("replayed state and concurrent callbacks allow only one callback", async () => {
  const replay = fakeDeps({ replay: true });
  await assert.rejects(
    completeGitHubInstallation(VIEWER, completeInput(), replay.value),
    (error) => error.code === "installation_state_replayed",
  );

  const concurrent = fakeDeps({ concurrent: true });
  const results = await Promise.allSettled([
    completeGitHubInstallation(VIEWER, completeInput(), concurrent.value),
    completeGitHubInstallation(VIEWER, completeInput(), concurrent.value),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected")[0].reason.code, "installation_state_replayed");
});

test("invalid installation ids, GitHub ownership/API failures, and persistence failures do not connect", async () => {
  const invalid = fakeDeps();
  await assert.rejects(
    completeGitHubInstallation(VIEWER, { state: STATE, installationId: "bad" }, invalid.value),
    (error) => error.code === "installation_id_required",
  );

  const mismatch = fakeDeps({
    value: {
      fetchInstallation: async () => ({
        id: 100,
        account: { id: 999, login: "other", type: "User" },
      }),
    },
  });
  await assert.rejects(
    completeGitHubInstallation(VIEWER, completeInput(), mismatch.value),
    (error) => error.code === "installation_user_mismatch",
  );

  const unavailable = fakeDeps({ githubFailure: true });
  await assert.rejects(completeGitHubInstallation(VIEWER, completeInput(), unavailable.value));
  assert.equal(unavailable.transactions, 0);

  const failedPersistence = fakeDeps({ persistenceFailure: true });
  await assert.rejects(completeGitHubInstallation(VIEWER, completeInput(), failedPersistence.value));
  assert.equal(failedPersistence.transactions, 1);
  assert.equal(failedPersistence.statements.some((s) => s.text.startsWith("INSERT INTO ghic_github_installations")), true);
});

test("repository data is always read from GitHub, not callback input", async () => {
  const d = fakeDeps();
  const result = await completeGitHubInstallation(
    VIEWER,
    completeInput({ repositories: [{ full_name: "attacker/forged" }] }),
    d.value,
  );
  assert.deepEqual(result.repositories.map((repo) => repo.fullName), ["acme/widgets"]);
});

test("callback persistence is gated by locked membership and consumed state", async () => {
  const d = fakeDeps();
  await completeGitHubInstallation(VIEWER, completeInput(), d.value);

  const texts = d.statements.map((statement) => statement.text);
  const membershipLock = texts.findIndex((text) =>
    text.startsWith("SELECT workspace_id, role FROM ghic_workspace_members"),
  );
  const intentConsume = texts.findIndex((text) =>
    text.startsWith("UPDATE ghic_github_installation_intents"),
  );
  assert.ok(membershipLock >= 0 && membershipLock < intentConsume);
  assert.match(texts[membershipLock], /role IN \('owner', 'admin'\).*FOR UPDATE/);

  const installationWrite = texts.find((text) =>
    text.startsWith("INSERT INTO ghic_github_installations"),
  );
  const repositoryWrite = texts.find((text) =>
    text.startsWith("INSERT INTO ghic_github_repositories"),
  );
  assert.match(installationWrite, /ghic_workspace_members/);
  assert.match(installationWrite, /status = 'consumed'/);
  assert.match(repositoryWrite, /\) SELECT/);
  assert.match(repositoryWrite, /ghic_workspace_members/);
  assert.match(repositoryWrite, /status = 'consumed'/);

  const guards = texts.filter((text) => text.includes(" AS ownership_guard") ||
    text.includes(" AS repository_guard") || text.includes(" AS membership_guard"));
  assert.equal(guards.length, 3);
  for (const guard of guards) {
    assert.match(guard, /SELECT 1 \/ CASE WHEN EXISTS/);
    assert.doesNotMatch(guard, /NULLIF\(0, 0\)/);
  }
  const repositoryGuard = guards.find((guard) => guard.includes("repository_guard"));
  assert.doesNotMatch(repositoryGuard, /active = true/);
});

test("trusted refresh bypasses callback state only, never workspace membership", async () => {
  const d = fakeDeps();
  const result = await completeGitHubInstallation(
    VIEWER,
    { installationId: 100, requireIntent: false },
    d.value,
  );
  assert.equal(result.ok, true);
  const writes = d.statements.filter((statement) =>
    /^INSERT INTO ghic_github_(installations|repositories)/.test(statement.text),
  );
  assert.ok(writes.length >= 2);
  for (const write of writes) {
    assert.match(write.text, /ghic_workspace_members/);
    assert.ok(write.values.includes(false));
  }
});
