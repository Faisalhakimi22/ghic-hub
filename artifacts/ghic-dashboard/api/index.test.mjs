import assert from "node:assert/strict";
import test from "node:test";

import { AuthError } from "./_lib/auth.mjs";
import { createHandler } from "./index.mjs";

function request(path, { method = "GET", body, role = "viewer" } = {}) {
  return {
    url: `https://hub.example/api/index?path=${encodeURIComponent(path)}`,
    method,
    headers: {},
    body,
    role,
    async *[Symbol.asyncIterator]() {},
  };
}

function requestWithQuery(path, query, options = {}) {
  const params = new URLSearchParams({ path, ...query });
  return {
    url: `https://hub.example/api/index?${params.toString()}`,
    method: options.method || "GET",
    headers: {},
    body: options.body,
    role: options.role || "viewer",
    async *[Symbol.asyncIterator]() {},
  };
}

function response() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

function dependencies(overrides = {}) {
  return {
    allowUnconfiguredDatabase: true,
    verifyRequest: async (req) => ({ uid: `uid-${req.role}`, name: req.role }),
    authenticateUser: async (claims) => ({
      id: claims.uid,
      role: claims.name,
      workspaceId: "workspace-a",
      workspaceName: "Workspace A",
      workspaceRole: claims.name,
      settings: { notificationPreferences: { criticalAlerts: true } },
    }),
    getOrgSettings: async () => ({ workspaceName: "GHIC", updatedAt: null }),
    getUser: async (id) => ({
      id,
      role: id.includes("admin") ? "admin" : "member",
    }),
    listUsers: async () => [],
    updateOrgSettings: async (patch) => patch,
    updateUserRole: async (id, role) => ({ id, role }),
    updateUserSettings: async (id, patch) => ({ id, settings: patch }),
    runtimeHealth: async () => ({ available: true, status: "ok" }),
    readRepositories: async () => ({
      items: [],
      total: 0,
      indexedTotal: 0,
      page: 1,
      limit: 50,
    }),
    readIssues: async () => ({ items: [], total: 0, page: 1, limit: 50 }),
    readAggregate: async () => ({}),
    readLedgerEvents: async () => [],
    readAnalytics: async () => ({}),
    readDuplicateCandidates: async () => ({ items: [], total: 0 }),
    searchProductData: async () => ({ total: 0 }),
    getGitHubConnectionSummary: async () => ({
      configured: true,
      installUrl: "https://github.com/apps/ghic/installations/new",
      installations: [],
    }),
    createGitHubInstallationIntent: async () => ({
      ok: true,
      installUrl: "https://github.com/apps/ghic/installations/new?state=test",
      expiresAt: "2026-08-10T00:10:00.000Z",
    }),
    completeGitHubInstallation: async (viewer, input) => ({
      ok: true,
      installationId: Number(input.installationId),
      viewerId: viewer.id,
      repositoryCount: 0,
      repositories: [],
    }),
    refreshGitHubInstallation: async (viewer, id) => ({
      ok: true,
      installationId: Number(id),
    }),
    disconnectGitHubInstallation: async (viewer, id) => ({
      ok: true,
      installationId: Number(id),
      disconnected: true,
    }),
    usageForWorkspace: async (workspaceId) => ({
      plan: "starter",
      period: "2026-08",
      enforced: true,
      workspaceId,
      issues: { used: 12, limit: 500, remaining: 488 },
      repositories: { used: 1, limit: 1, remaining: 0 },
      outcomes: { counted: 12 },
    }),
    ...overrides,
  };
}

test("unauthenticated requests receive 401 before product data is read", async () => {
  let dataRead = false;
  const handler = createHandler(
    dependencies({
      verifyRequest: async () => {
        throw new AuthError("Missing bearer token.");
      },
      readAggregate: async () => {
        dataRead = true;
        return {};
      },
    }),
  );
  const res = response();
  await handler(request("dashboard/overview"), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "authentication_required");
  assert.equal(res.headers["cache-control"], "private, no-store");
  assert.equal(dataRead, false);
});

test("valid Firebase identity without workspace membership receives 403", async () => {
  const handler = createHandler(
    dependencies({
      authenticateUser: async () => {
        throw Object.assign(new Error("This account is not a member."), {
          status: 403,
          code: "workspace_access_denied",
        });
      },
    }),
  );
  const res = response();
  await handler(request("me"), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "workspace_access_denied");
});

test("issues are scoped to the authenticated workspace, not a query parameter", async () => {
  let received;
  const handler = createHandler(
    dependencies({
      authenticateUser: async (claims) => ({
        id: claims.uid,
        role: "member",
        workspaceId: "workspace-a",
        settings: {},
      }),
      readIssues: async (params) => {
        received = params;
        return {
          items: [{ id: "acme/repo~1", repositoryName: "acme/repo", number: 1 }],
          total: 1,
          page: 1,
          limit: 50,
        };
      },
    }),
  );
  const res = response();
  await handler(
    requestWithQuery("issues", {
      workspaceId: "workspace-b",
      workspace_id: "workspace-b",
      repository: "other/repo",
      number: "99",
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(received.workspaceId, "workspace-a");
  assert.equal(received.workspace_id, "workspace-b");
  assert.equal(received.repository, "other/repo");
});

test("issue detail keeps the authenticated workspace when repository and number are changed", async () => {
  let received;
  const handler = createHandler(
    dependencies({
      authenticateUser: async (claims) => ({
        id: claims.uid,
        role: "member",
        workspaceId: "workspace-a",
        settings: {},
      }),
      readIssues: async (params) => {
        received = params;
        return { items: [], total: 0, page: 1, limit: 100 };
      },
    }),
  );
  const res = response();
  await handler(request("issues/other-repo~999"), res);
  assert.equal(res.statusCode, 404);
  assert.equal(received.workspaceId, "workspace-a");
  assert.equal(received.repositoryId, "other-repo");
});

test("unauthenticated issue reads fail before the issue query runs", async () => {
  let read = false;
  const handler = createHandler(
    dependencies({
      verifyRequest: async () => {
        throw new AuthError("Missing bearer token.");
      },
      readIssues: async () => {
        read = true;
        return { items: [], total: 0, page: 1, limit: 50 };
      },
    }),
  );
  const res = response();
  await handler(request("issues"), res);
  assert.equal(res.statusCode, 401);
  assert.equal(read, false);
});

test("a non-member cannot read issues", async () => {
  const handler = createHandler(
    dependencies({
      authenticateUser: async () => {
        throw Object.assign(new Error("This account is not a member."), {
          status: 403,
          code: "workspace_access_denied",
        });
      },
    }),
  );
  const res = response();
  await handler(request("issues"), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "workspace_access_denied");
});

test("database query failures return a useful service-unavailable response", async () => {
  const handler = createHandler(
    dependencies({
      readRepositories: async () => {
        const error = new Error("database detail must not reach the client");
        error.name = "NeonDbError";
        throw error;
      },
    }),
  );
  const res = response();
  await handler(request("repositories"), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "database_unavailable");
  assert.doesNotMatch(res.body.error, /database detail/);
});

for (const role of ["owner", "admin", "member", "viewer"]) {
  test(`${role} can read authenticated workspace data`, async () => {
    const handler = createHandler(dependencies());
    const res = response();
    await handler(request("dashboard/overview", { role }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.stats.trackedRepositories, 0);
    assert.equal(res.headers["cache-control"], "private, no-store");
  });
}

test("every role may update only its own persisted settings", async () => {
  for (const role of ["owner", "admin", "member", "viewer"]) {
    let updatedUid = null;
    const handler = createHandler(
      dependencies({
        updateUserSettings: async (uid, patch) => {
          updatedUid = uid;
          return { id: uid, role, settings: patch };
        },
      }),
    );
    const res = response();
    await handler(
      request("me/settings", {
        role,
        method: "PATCH",
        body: { timezone: "Asia/Karachi" },
      }),
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(updatedUid, `uid-${role}`);
  }
});

test("a self-settings request cannot change RBAC role", async () => {
  const handler = createHandler(dependencies());
  const res = response();
  await handler(
    request("me/settings", {
      role: "viewer",
      method: "PATCH",
      body: { role: "owner" },
    }),
    res,
  );
  assert.equal(res.statusCode, 403);
});

test("only an owner can rename the workspace", async () => {
  for (const role of ["admin", "member", "viewer"]) {
    const handler = createHandler(dependencies());
    const res = response();
    await handler(
      request("organization", {
        role,
        method: "PATCH",
        body: { workspaceName: "Other" },
      }),
      res,
    );
    assert.equal(res.statusCode, 403);
  }

  const handler = createHandler(
    dependencies({
      updateOrgSettings: async ({ workspaceName }) => ({
        workspaceName,
        updatedAt: null,
      }),
    }),
  );
  const res = response();
  await handler(
    request("organization", {
      role: "owner",
      method: "PATCH",
      body: { workspaceName: "Production" },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.workspaceName, "Production");
});

test("member and viewer cannot change another member role", async () => {
  for (const role of ["member", "viewer"]) {
    const handler = createHandler(dependencies());
    const res = response();
    await handler(
      request("organization/members/uid-target", {
        role,
        method: "PATCH",
        body: { role: "viewer" },
      }),
      res,
    );
    assert.equal(res.statusCode, 403);
  }
});

test("admin can manage member/viewer but cannot manage an admin", async () => {
  const handler = createHandler(dependencies());
  const allowed = response();
  await handler(
    request("organization/members/uid-target", {
      role: "admin",
      method: "PATCH",
      body: { role: "viewer" },
    }),
    allowed,
  );
  assert.equal(allowed.statusCode, 200);

  const denied = response();
  await handler(
    request("organization/members/uid-admin", {
      role: "admin",
      method: "PATCH",
      body: { role: "member" },
    }),
    denied,
  );
  assert.equal(denied.statusCode, 403);
});

test("owner can manage every valid role", async () => {
  const handler = createHandler(dependencies());
  const res = response();
  await handler(
    request("organization/members/uid-admin", {
      role: "owner",
      method: "PATCH",
      body: { role: "owner" },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.role, "owner");
});

// --- GitHub App connection -------------------------------------------------

test("the GitHub connection summary requires authentication", async () => {
  let reached = false;
  const handler = createHandler(
    dependencies({
      verifyRequest: async () => {
        throw new AuthError("Missing bearer token.");
      },
      getGitHubConnectionSummary: async () => {
        reached = true;
        return {};
      },
    }),
  );
  const res = response();
  await handler(request("github/connection"), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "authentication_required");
  assert.equal(reached, false);
});

test("creating an installation intent requires authentication and returns a stateful URL", async () => {
  let reached = false;
  const handler = createHandler(
    dependencies({
      createGitHubInstallationIntent: async (viewer) => {
        reached = viewer.id === "uid-owner";
        return {
          ok: true,
          installUrl: "https://github.com/apps/ghic/installations/new?state=test",
          expiresAt: "2026-08-10T00:10:00.000Z",
        };
      },
    }),
  );
  const res = response();
  await handler(request("github/installations/intent", { method: "POST", role: "owner" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(reached, true);
  assert.match(res.body.installUrl, /[?&]state=/);
});

test("completing an installation requires authentication", async () => {
  let reached = false;
  const handler = createHandler(
    dependencies({
      verifyRequest: async () => {
        throw new AuthError("Missing bearer token.");
      },
      completeGitHubInstallation: async () => {
        reached = true;
        return {};
      },
    }),
  );
  const res = response();
  await handler(
    request("github/installations", {
      method: "POST",
      body: { installationId: 42 },
    }),
    res,
  );
  assert.equal(res.statusCode, 401);
  assert.equal(reached, false);
});

test("an authenticated installation callback reaches the verifier with the viewer", async () => {
  let seen = null;
  const handler = createHandler(
    dependencies({
      completeGitHubInstallation: async (viewer, input) => {
        seen = { viewer, input };
        return { ok: true, installationId: 99, repositoryCount: 2 };
      },
    }),
  );
  const res = response();
  await handler(
    request("github/installations", {
      method: "POST",
      role: "owner",
      body: { installationId: 99, setupAction: "install", state: "callback-state" },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.repositoryCount, 2);
  // The viewer comes from the verified token, never from the request body.
  assert.equal(seen.viewer.id, "uid-owner");
  assert.equal(seen.input.installationId, 99);
  assert.equal(seen.input.state, "callback-state");
});

test("a cancelled installation is not an error", async () => {
  const handler = createHandler(
    dependencies({
      completeGitHubInstallation: async () => ({ ok: true, cancelled: true }),
    }),
  );
  const res = response();
  await handler(
    request("github/installations", {
      method: "POST",
      body: { setupAction: "cancel" },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.cancelled, true);
});

test("an installation owned by another GitHub account is refused", async () => {
  const handler = createHandler(
    dependencies({
      completeGitHubInstallation: async () => {
        throw Object.assign(
          new Error(
            "This GitHub App installation belongs to a different GitHub user.",
          ),
          { status: 403, code: "installation_user_mismatch" },
        );
      },
    }),
  );
  const res = response();
  await handler(
    request("github/installations", {
      method: "POST",
      body: { installationId: 7 },
    }),
    res,
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "installation_user_mismatch");
});

test("an installation already claimed by another member returns 409", async () => {
  const handler = createHandler(
    dependencies({
      completeGitHubInstallation: async () => {
        throw Object.assign(new Error("Already linked."), {
          status: 409,
          code: "installation_already_linked",
        });
      },
    }),
  );
  const res = response();
  await handler(
    request("github/installations", {
      method: "POST",
      body: { installationId: 7 },
    }),
    res,
  );
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "installation_already_linked");
});

test("an installation GitHub no longer knows about returns 404", async () => {
  const handler = createHandler(
    dependencies({
      completeGitHubInstallation: async () => {
        throw Object.assign(new Error("GitHub installation was not found."), {
          status: 404,
          code: "installation_not_found",
        });
      },
    }),
  );
  const res = response();
  await handler(
    request("github/installations", {
      method: "POST",
      body: { installationId: 7 },
    }),
    res,
  );
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, "installation_not_found");
});

test("a GitHub API failure is reported as upstream, not as a database outage", async () => {
  const handler = createHandler(
    dependencies({
      completeGitHubInstallation: async () => {
        throw Object.assign(new Error("GitHub repository listing failed."), {
          status: 502,
          code: "github_api_error",
        });
      },
    }),
  );
  const res = response();
  await handler(
    request("github/installations", {
      method: "POST",
      body: { installationId: 7 },
    }),
    res,
  );
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, "github_api_error");
});

test("an unconfigured GitHub App says so instead of blaming Postgres", async () => {
  const handler = createHandler(
    dependencies({
      completeGitHubInstallation: async () => {
        throw Object.assign(
          new Error("GitHub App credentials are not configured."),
          { status: 503, code: "github_app_not_configured" },
        );
      },
    }),
  );
  const res = response();
  await handler(
    request("github/installations", {
      method: "POST",
      body: { installationId: 7 },
    }),
    res,
  );
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "github_app_not_configured");
  assert.match(res.body.error, /credentials are not configured/);
});

test("re-syncing an installation that is not connected returns 404", async () => {
  const handler = createHandler(
    dependencies({
      refreshGitHubInstallation: async () => {
        throw Object.assign(
          new Error("That installation is not connected to this workspace."),
          { status: 404, code: "installation_not_connected" },
        );
      },
    }),
  );
  const res = response();
  await handler(
    request("github/installations/5/refresh", { method: "POST" }),
    res,
  );
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, "installation_not_connected");
});

test("re-syncing a connected installation reaches the refresh path", async () => {
  const handler = createHandler(dependencies());
  const res = response();
  await handler(
    request("github/installations/5/refresh", { method: "POST" }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.installationId, 5);
});

test("disconnecting an installation reaches the GHIC claim removal path", async () => {
  const handler = createHandler(dependencies());
  const res = response();
  await handler(
    request("github/installations/5/disconnect", { method: "POST" }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.disconnected, true);
});

test("the GitHub connection routes reject methods they do not define", async () => {
  const handler = createHandler(dependencies());
  const res = response();
  await handler(request("github/connection", { method: "DELETE" }), res);
  assert.equal(res.statusCode, 405);
});

test("usage is read for the viewer's own workspace", async () => {
  const handler = createHandler(dependencies());
  const res = response();
  await handler(request("usage"), res);
  assert.equal(res.statusCode, 200);
  // Not a workspace named in the request. A usage panel is a bill, and
  // reading somebody else's would be a tenancy hole in a read path.
  assert.equal(res.body.workspaceId, "workspace-a");
  assert.equal(res.body.issues.used, 12);
});

test("usage is readable by every role, not only administrators", async () => {
  // A viewer who cannot see why analysis stopped will report it as a bug.
  const handler = createHandler(dependencies());
  const res = response();
  await handler(request("usage", { role: "viewer" }), res);
  assert.equal(res.statusCode, 200);
});

test("usage rejects writes", async () => {
  const handler = createHandler(dependencies());
  const res = response();
  await handler(request("usage", { method: "POST" }), res);
  // The browser never moves the meter. Both places that do are server-side.
  assert.equal(res.statusCode, 405);
});

test("an unauthenticated request never reaches usage", async () => {
  let read = false;
  const handler = createHandler(
    dependencies({
      verifyRequest: async () => {
        throw new AuthError("no", 401);
      },
      usageForWorkspace: async () => {
        read = true;
        return {};
      },
    }),
  );
  const res = response();
  await handler(request("usage"), res);
  assert.equal(res.statusCode, 401);
  assert.equal(read, false);
});
