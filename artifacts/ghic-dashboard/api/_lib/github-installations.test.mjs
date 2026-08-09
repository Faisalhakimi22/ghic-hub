import assert from "node:assert/strict";
import test from "node:test";

import {
  completeGitHubInstallation,
  refreshGitHubInstallation,
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
    return Promise.resolve([]);
  };
  return { q, statements };
}

function deps(overrides = {}) {
  const db = overrides.db || fakeDatabase();
  return {
    statements: db.statements,
    value: {
      database: async () => db.q,
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

const VIEWER = { id: "firebase-uid-1", githubId: "555" };

function wrote(statements) {
  return statements.some((s) => /^(INSERT|UPDATE)/i.test(s.text));
}

test("a viewer with no GitHub identity cannot connect an installation", async () => {
  const d = deps();
  await assert.rejects(
    completeGitHubInstallation(
      { id: "firebase-uid-1", githubId: null },
      { installationId: 100 },
      d.value,
    ),
    (error) => error.status === 403 && error.code === "github_identity_required",
  );
  assert.equal(wrote(d.statements), false);
});

test("an installation id is required", async () => {
  const d = deps();
  await assert.rejects(
    completeGitHubInstallation(VIEWER, {}, d.value),
    (error) => error.status === 400 && error.code === "installation_id_required",
  );
});

test("cancelling the installation writes nothing and is not an error", async () => {
  const d = deps();
  const result = await completeGitHubInstallation(
    VIEWER,
    { setupAction: "cancel" },
    d.value,
  );
  assert.equal(result.cancelled, true);
  assert.equal(wrote(d.statements), false);
});

test("an unconfigured GitHub App refuses rather than recording an unverified claim", async () => {
  const d = deps({ value: { githubAppConfigured: () => false } });
  await assert.rejects(
    completeGitHubInstallation(VIEWER, { installationId: 100 }, d.value),
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
    completeGitHubInstallation(VIEWER, { installationId: 100 }, d.value),
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
    completeGitHubInstallation(VIEWER, { installationId: 100 }, d.value),
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
    { installationId: 100 },
    d.value,
  );
  assert.equal(result.ok, true);
  assert.equal(result.accountLogin, "acme");
  assert.equal(result.repositoryCount, 1);
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
    completeGitHubInstallation(VIEWER, { installationId: 100 }, d.value),
    (error) => error.status === 403 && error.code === "installation_suspended",
  );
  assert.equal(wrote(d.statements), false);
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
    completeGitHubInstallation(VIEWER, { installationId: 100 }, d.value),
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
      revoked_at: null,
    },
  });
  const d = deps({ db });
  const result = await completeGitHubInstallation(
    VIEWER,
    { installationId: 100 },
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
  await completeGitHubInstallation(VIEWER, { installationId: 100 }, d.value);
  const prune = d.statements.find((s) =>
    /UPDATE ghic_github_repositories SET active = false/.test(s.text),
  );
  assert.ok(prune, "expected a deactivation statement for removed repositories");
  assert.match(prune.text, /repo_full_name <> ALL/);
  assert.deepEqual(prune.values[1], ["octocat/hello"]);
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
