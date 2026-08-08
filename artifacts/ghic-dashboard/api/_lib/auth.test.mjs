import assert from "node:assert/strict";
import test from "node:test";

import { AuthError, hasRole, requireRole, requireRoleChange } from "./auth.mjs";

test("role ordering is viewer, member, admin, owner", () => {
  assert.equal(hasRole("viewer", "viewer"), true);
  assert.equal(hasRole("viewer", "member"), false);
  assert.equal(hasRole("member", "admin"), false);
  assert.equal(hasRole("admin", "member"), true);
  assert.equal(hasRole("owner", "admin"), true);
  assert.throws(() => requireRole({ role: "viewer" }, "admin"), AuthError);
});

test("owner can manage every role while admin is limited to member and viewer", () => {
  assert.doesNotThrow(() =>
    requireRoleChange({ role: "owner" }, { role: "admin" }, "owner"),
  );
  assert.doesNotThrow(() =>
    requireRoleChange({ role: "admin" }, { role: "member" }, "viewer"),
  );
  assert.throws(
    () => requireRoleChange({ role: "admin" }, { role: "admin" }, "member"),
    (error) => error.status === 403,
  );
  assert.throws(
    () => requireRoleChange({ role: "member" }, { role: "viewer" }, "member"),
    (error) => error.status === 403,
  );
  assert.throws(
    () => requireRoleChange({ role: "owner" }, { role: "viewer" }, "superuser"),
    (error) => error.status === 400,
  );
});
