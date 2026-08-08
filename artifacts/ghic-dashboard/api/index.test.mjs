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
