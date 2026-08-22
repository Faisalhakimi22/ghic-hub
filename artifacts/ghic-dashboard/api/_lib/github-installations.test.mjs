import assert from "node:assert/strict";
import test from "node:test";

import {
  completeGitHubInstallation,
  disconnectGitHubInstallation,
  getGitHubConnectionSummary,
  refreshGitHubInstallation,
  syncInstallationRepositories,
  deactivateRepository,
} from "./github-installations.mjs";

/**
 * A tagged-template stand-in for the Neon client.
 *
 * Records every statement so tests can assert that nothing was written on
 * a rejected request, and answers the one SELECT these functions make.
 */
function fakeDatabase({ existingInstallation = null } = {}) {
  const statements = [];
  const q = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push({ text, values });
    if (text.startsWith("SELECT connected_by_firebase_uid")) {
      return Promise.resolve(existingInstallation ? [existingInstallation] : []);
    }
    if (text.startsWith("SELECT installation_id FROM")) {
      return Promise.resolve(existingInstallation ? [existingInstallation] : []);
    }
    if (text.startsWith("SELECT firebase_uid, workspace_id")) {
      return Promise.resolve([{
        firebase_uid: VIEWER.id,
        workspace_id: "ghic-workspace",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumed_at: null,
        status: "pending",
      }]);
    }
    if (text.startsWith("SELECT workspace_id, role FROM ghic_workspace_members")) {
      return Promise.resolve([{
        workspace_id: "ghic-workspace",
        role: "owner",
      }]);
    }
    if (text.startsWith("UPDATE ghic_github_installation_intents")) {
      return Promise.resolve([{ state_hash: "test-hash" }]);
    }
    if (text.startsWith("INSERT INTO ghic_github_installations")) {
      return Promise.resolve([{ installation_id: 100 }]);
    }
    if (text.startsWith("INSERT INTO ghic_github_repositories")) {
      return Promise.resolve([{ repo_full_name: "octocat/hello" }]);
    }
    return Promise.resolve([]);
  };
  return { q, statements };
}

function deps(overrides = {}) {
  const db = overrides.db || fakeDatabase();
  const transactionCalls = [];
  return {
    statements: db.statements,
    transactionCalls,
    value: {
      database: async () => db.q,
      transaction: async (queries) => {
        transactionCalls.push(queries);
        return Promise.all(queries);
      },
      githubAppConfigured: () => true,
      fetchInstallation: async () => ({
        id: 100,
        account: { id: 555, login: "octocat", type: "User" },
        repository_selection: "selected",
      }),
      listInstallationRepositories: async () => [
        {
          id: 1,
          full_name: "octocat/hello",
          private: false,
          default_branch: "main",
          html_url: "https://github.com/octocat/hello",
        },
      ],
      fetchGitHubUserById: async () => ({ login: "octocat" }),
      verifyOrgMembership: async () => true,
      ...overrides.value,
    },
  };
}

const VIEWER = {
  id: "firebase-uid-1",
  githubId: "555",
  workspaceId: "ghic-workspace",
  workspaceRole: "owner",
};
const STATE = "test-state";

function wrote(statements) {
  return statements.some((s) => /^(INSERT|UPDATE)/i.test(s.text));
}

test("a viewer with no GitHub identity cannot connect an installation", async () => {
  const d = deps();
  await assert.rejects(
    completeGitHubInstallation(
      { ...VIEWER, githubId: null },
      { installationId: 100 },
      d.value,
    ),
    (error) => error.status === 403 && error.code === "github_identity_required",
  );
  assert.equal(wrote(d.statements), false);
});

test("members and viewers cannot manage GitHub installations", async () => {
  for (const workspaceRole of ["viewer", "member"]) {
    for (const operation of [
      (viewer, injected) => completeGitHubInstallation(
        viewer,
        { installationId: 100, state: STATE },
        injected,
      ),
      (viewer, injected) => refreshGitHubInstallation(viewer, 100, injected),
      (viewer, injected) => disconnectGitHubInstallation(viewer, 100, injected),
    ]) {
      const d = deps();
      await assert.rejects(
        operation({ ...VIEWER, workspaceRole }, d.value),
        (error) => error.status === 403 && error.code === "workspace_role_required",
      );
      assert.equal(wrote(d.statements), false);
    }
  }
});

test("admins and owners may enter the verified GitHub installation flow", async () => {
  for (const workspaceRole of ["admin", "owner"]) {
    const d = deps();
    const result = await completeGitHubInstallation(
      { ...VIEWER, workspaceRole },
      { installationId: 100, state: STATE },
      d.value,
    );
    assert.equal(result.ok, true);
  }
});

test("an installation id is required", async () => {
  const d = deps();
  await assert.rejects(
    completeGitHubInstallation(VIEWER, { state: STATE }, d.value),
    (error) => error.status === 400 && error.code === "installation_id_required",
  );
});

test("cancelling the installation writes nothing and is not an error", async () => {
  const d = deps();
  const result = await completeGitHubInstallation(
    VIEWER,
    { setupAction: "cancel", state: STATE },
    d.value,
  );
  assert.equal(result.cancelled, true);
  assert.equal(
    d.statements.some((statement) => /INSERT INTO ghic_github_installations/.test(statement.text)),
    false,
  );
});

test("an unconfigured GitHub App refuses rather than recording an unverified claim", async () => {
  const d = deps({ value: { githubAppConfigured: () => false } });
  await assert.rejects(
    completeGitHubInstallation(VIEWER, { installationId: 100, state: STATE }, d.value),
    (error) =>
      error.status === 503 && error.code === "github_app_not_configured",
  );
  assert.equal(wrote(d.statements), false);
});

test("a personal installation belonging to a different GitHub user is refused", async () => {
  // The browser claims installation 100. GitHub says it belongs to user
  // 999. The viewer signed in as GitHub user 555. The claim loses.
  const d = deps({
    value: {
      fetchInstallation: async () => ({
        id: 100,
        account: { id: 999, login: "someone-else", type: "User" },
      }),
    },
  });
  await assert.rejects(
    completeGitHubInstallation(VIEWER, { installationId: 100, state: STATE }, d.value),
    (error) =>
      error.status === 403 && error.code === "installation_user_mismatch",
  );
  assert.equal(wrote(d.statements), false);
});

test("an organization installation requires verified admin membership", async () => {
  const d = deps({
    value: {
      fetchInstallation: async () => ({
        id: 100,
        account: { id: 777, login: "acme", type: "Organization" },
      }),
      verifyOrgMembership: async () => false,
    },
  });
  await assert.rejects(
    completeGitHubInstallation(VIEWER, { installationId: 100, state: STATE }, d.value),
    (error) =>
      error.status === 403 && error.code === "installation_org_forbidden",
  );
  assert.equal(wrote(d.statements), false);
});

test("an organization admin may connect the organization installation", async () => {
  const d = deps({
    value: {
      fetchInstallation: async () => ({
        id: 100,
        account: { id: 777, login: "acme", type: "Organization" },
        repository_selection: "all",
      }),
      verifyOrgMembership: async () => true,
    },
  });
  const result = await completeGitHubInstallation(
    VIEWER,
    { installationId: 100, state: STATE },
    d.value,
  );
  assert.equal(result.ok, true);
  assert.equal(result.accountLogin, "acme");
  assert.equal(result.repositoryCount, 1);
  assert.equal(d.transactionCalls.length, 1);
  assert.equal(wrote(d.statements), true);
});

test("a suspended installation is not treated as connected", async () => {
  const d = deps({
    value: {
      fetchInstallation: async () => ({
        id: 100,
        account: { id: 555, login: "octocat", type: "User" },
        suspended_at: "2026-01-01T00:00:00Z",
      }),
    },
  });
  await assert.rejects(
    completeGitHubInstallation(VIEWER, { installationId: 100, state: STATE }, d.value),
    (error) => error.status === 403 && error.code === "installation_suspended",
  );
  assert.equal(wrote(d.statements), false);
});

test("refreshing a suspended installation persists suspended status", async () => {
  const db = fakeDatabase({ existingInstallation: { installation_id: 100 } });
  const d = deps({
    db,
    value: {
      fetchInstallation: async () => ({
        id: 100,
        account: { id: 555, login: "octocat", type: "User" },
        suspended_at: "2026-01-01T00:00:00Z",
      }),
    },
  });
  const result = await refreshGitHubInstallation(VIEWER, 100, d.value);
  assert.equal(result.suspended, true);
  assert.ok(
    d.statements.some((s) => /connection_status = 'suspended'/.test(s.text)),
  );
});

test("a personal installation already claimed by another member returns 409", async () => {
  const db = fakeDatabase({
    existingInstallation: {
      connected_by_firebase_uid: "firebase-uid-2",
      connected_by_github_id: "999",
      revoked_at: null,
    },
  });
  const d = deps({ db });
  await assert.rejects(
    completeGitHubInstallation(VIEWER, { installationId: 100, state: STATE }, d.value),
    (error) =>
      error.status === 409 && error.code === "installation_already_linked",
  );
  assert.equal(wrote(d.statements), false);
});

test("re-connecting the same installation as the same actor is idempotent", async () => {
  const db = fakeDatabase({
    existingInstallation: {
      connected_by_firebase_uid: VIEWER.id,
      connected_by_github_id: VIEWER.githubId,
      workspace_id: VIEWER.workspaceId,
      revoked_at: null,
    },
  });
  const d = deps({ db });
  const result = await completeGitHubInstallation(
    VIEWER,
    { installationId: 100, state: STATE },
    d.value,
  );
  assert.equal(result.ok, true);
  assert.match(
    d.statements.find((s) => s.text.startsWith("INSERT INTO ghic_github_installations")).text,
    /ON CONFLICT \(installation_id\) DO UPDATE/,
  );
});

test("repositories no longer in the installation are deactivated, not deleted", async () => {
  const d = deps();
  await completeGitHubInstallation(VIEWER, { installationId: 100, state: STATE }, d.value);
  const prune = d.statements.find((s) =>
    /UPDATE ghic_github_repositories SET active = false/.test(s.text),
  );
  assert.ok(prune, "expected a deactivation statement for removed repositories");
  assert.match(prune.text, /repo_full_name <> ALL/);
  assert.ok(
    prune.values.some((value) =>
      Array.isArray(value) && value.includes("octocat/hello"),
    ),
  );
});

test("re-syncing an installation this workspace never connected returns 404", async () => {
  const d = deps({ db: fakeDatabase({ existingInstallation: null }) });
  await assert.rejects(
    refreshGitHubInstallation(VIEWER, 100, d.value),
    (error) =>
      error.status === 404 && error.code === "installation_not_connected",
  );
});

test("re-syncing an installation GitHub has forgotten marks it revoked", async () => {
  const db = fakeDatabase({ existingInstallation: { installation_id: 100 } });
  const d = deps({
    db,
    value: {
      fetchInstallation: async () => {
        throw Object.assign(new Error("gone"), {
          status: 404,
          code: "installation_not_found",
        });
      },
    },
  });
  const result = await refreshGitHubInstallation(VIEWER, 100, d.value);
  assert.equal(result.revoked, true);
  assert.ok(
    d.statements.some((s) => /SET revoked_at = now\(\)/.test(s.text)),
    "expected the installation to be marked revoked",
  );
});

test("disconnect removes GHIC access without revoking GitHub authorization", async () => {
  const statements = [];
  const q = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push({ text, values });
    if (text.startsWith("SELECT installation_id, account_type")) {
      return Promise.resolve([{
        installation_id: 100,
        account_type: "User",
        account_github_id: 555,
        connected_by_firebase_uid: VIEWER.id,
        connected_by_github_id: VIEWER.githubId,
        connection_status: "connected",
      }]);
    }
    if (text.startsWith("SELECT workspace_id, role FROM ghic_workspace_members")) {
      return Promise.resolve([{
        workspace_id: VIEWER.workspaceId,
        role: VIEWER.workspaceRole,
      }]);
    }
    return Promise.resolve([]);
  };
  const d = deps({ db: { q, statements } });
  const result = await disconnectGitHubInstallation(VIEWER, 100, d.value);
  assert.equal(result.disconnected, true);
  const disconnect = statements.find((s) => /connection_status = 'disconnected'/.test(s.text));
  assert.ok(disconnect);
  assert.doesNotMatch(disconnect.text, /revoked_at/);
  assert.match(disconnect.text, /ghic_workspace_members/);
  assert.ok(statements.some((statement) =>
    /FOR UPDATE/.test(statement.text) && /ghic_workspace_members/.test(statement.text),
  ));
});

test("a malformed installation id is rejected before any GitHub call", async () => {
  let called = false;
  const d = deps({
    value: {
      fetchInstallation: async () => {
        called = true;
        return {};
      },
    },
  });
  await assert.rejects(
    refreshGitHubInstallation(VIEWER, "not-a-number", d.value),
    (error) => error.status === 400,
  );
  assert.equal(called, false);
});

function ownershipDeps({
  installationWorkspace = "workspace-a",
  installationStatus = "connected",
  installationRevokedAt = null,
  repository = null,
} = {}) {
  const statements = [];
  const q = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push({ text, values });
    if (text.startsWith("SELECT workspace_id, connection_status, revoked_at")) {
      return Promise.resolve([{
        workspace_id: installationWorkspace,
        connection_status: installationStatus,
        revoked_at: installationRevokedAt,
      }]);
    }
    if (text.startsWith("SELECT repo_full_name, installation_id, workspace_id")) {
      return Promise.resolve(repository ? [repository] : []);
    }
    if (text.startsWith("SELECT r.workspace_id, i.workspace_id")) {
      return Promise.resolve(repository ? [{
        workspace_id: repository.workspace_id,
        installation_workspace_id: installationWorkspace,
      }] : []);
    }
    if (text.startsWith("SELECT installation_id, account_login")) {
      return Promise.resolve([{
        installation_id: 100,
        account_login: "octocat",
        account_type: "User",
        repository_selection: "selected",
        connected_at: null,
        revoked_at: installationRevokedAt,
        connection_status: installationStatus,
        status_reason: null,
        status_changed_at: null,
        // The only repository fixture is in another workspace and must not
        // be counted by the workspace-qualified subquery.
        repository_count: 0,
      }]);
    }
    return Promise.resolve([]);
  };
  const transactionCalls = [];
  return {
    statements,
    value: {
      database: async () => q,
      transaction: async (queries) => {
        transactionCalls.push(queries);
        return Promise.all(queries);
      },
      githubAppConfigured: () => true,
    },
  };
}

test("connection summary excludes repositories from a different workspace", async () => {
  const d = ownershipDeps({
    repository: {
      repo_full_name: "octocat/other",
      installation_id: 100,
      workspace_id: "workspace-b",
    },
  });
  const result = await getGitHubConnectionSummary("workspace-a", d.value);
  assert.equal(result.installations[0].repositoryCount, 0);
  const query = d.statements.find((statement) =>
    statement.text.startsWith("SELECT installation_id, account_login"),
  );
  assert.match(query.text, /r\.workspace_id = ghic_github_installations\.workspace_id/);
  assert.match(query.text, /ghic_github_installations\.revoked_at IS NULL/);
  assert.match(query.text, /ghic_github_installations\.connection_status = 'connected'/);
});

test("connection summary fails closed for an unknown installation lifecycle state", async () => {
  const d = ownershipDeps({ installationStatus: "pending" });
  const result = await getGitHubConnectionSummary("workspace-a", d.value);

  assert.equal(result.installations[0].status, "unauthorized");
  assert.equal(result.installations[0].repositoryCount, 0);
});

test("repository sync derives the installation workspace and preserves it", async () => {
  const d = ownershipDeps();
  await syncInstallationRepositories(
    100,
    [{ full_name: "octocat/hello", id: 1, private: false }],
    null,
    d.value,
  );
  const insert = d.statements.find((statement) =>
    statement.text.startsWith("INSERT INTO ghic_github_repositories"),
  );
  assert.ok(insert.values.includes("workspace-a"));
});

test("repository sync rejects a repository owned by another workspace", async () => {
  const d = ownershipDeps({
    repository: {
      repo_full_name: "octocat/hello",
      installation_id: 200,
      workspace_id: "workspace-b",
    },
  });
  await assert.rejects(
    syncInstallationRepositories(
      100,
      [{ full_name: "octocat/hello", id: 1 }],
      "workspace-a",
      d.value,
    ),
    (error) => error.status === 409 && error.code === "repository_ownership_conflict",
  );
  assert.equal(d.statements.some((statement) => statement.text.startsWith("INSERT")), false);
});

test("repository sync rejects an explicitly mismatched workspace", async () => {
  const d = ownershipDeps();
  await assert.rejects(
    syncInstallationRepositories(100, [{ full_name: "octocat/hello" }], "workspace-b", d.value),
    (error) => error.status === 403 && error.code === "workspace_ownership_mismatch",
  );
});

test("repository sync fails closed when installation workspace cannot be resolved", async () => {
  const d = ownershipDeps({ installationWorkspace: null });
  await assert.rejects(
    syncInstallationRepositories(100, [{ full_name: "octocat/hello" }], null, d.value),
    (error) => error.status === 404 && error.code === "installation_not_connected",
  );
});

test("repository sync fails closed for lifecycle-inactive installations", async () => {
  for (const options of [
    { installationStatus: "disconnected" },
    { installationStatus: "suspended" },
    { installationStatus: "revoked", installationRevokedAt: "2026-01-01T00:00:00Z" },
  ]) {
    const d = ownershipDeps(options);
    await assert.rejects(
      syncInstallationRepositories(
        100,
        [{ full_name: "octocat/hello" }],
        null,
        d.value,
      ),
      (error) => error.status === 409 && error.code === "installation_not_connected",
    );
    assert.equal(d.statements.some((statement) => statement.text.startsWith("INSERT")), false);
  }
});

test("repository deactivation rejects cross-workspace mutation", async () => {
  const d = ownershipDeps({
    repository: {
      repo_full_name: "octocat/hello",
      installation_id: 100,
      workspace_id: "workspace-a",
    },
  });
  await assert.rejects(
    deactivateRepository("octocat/hello", "workspace-b", d.value),
    (error) => error.status === 403 && error.code === "workspace_ownership_mismatch",
  );
  assert.equal(d.statements.some((statement) => statement.text.startsWith("UPDATE")), false);
});

test("repository deactivation derives workspace and succeeds for the owning workspace", async () => {
  const d = ownershipDeps({
    repository: {
      repo_full_name: "octocat/hello",
      installation_id: 100,
      workspace_id: "workspace-a",
    },
  });
  await deactivateRepository("octocat/hello", null, d.value);
  const update = d.statements.find((statement) => statement.text.startsWith("UPDATE"));
  assert.ok(update);
  assert.ok(update.values.includes("workspace-a"));
});

test("repository deactivation fails closed without authoritative workspace context", async () => {
  const d = ownershipDeps({ repository: null });
  await assert.rejects(
    deactivateRepository("octocat/missing", null, d.value),
    (error) => error.status === 404 && error.code === "repository_not_connected",
  );
});
