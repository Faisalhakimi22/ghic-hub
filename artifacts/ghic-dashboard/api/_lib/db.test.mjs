import assert from "node:assert/strict";
import test from "node:test";

import {
  getOrgSettings,
  getUser,
  listUsers,
  updateOrgSettings,
  updateUserRole,
} from "./db.mjs";

function roleStore(initialRoles) {
  const roles = new Map(Object.entries(initialRoles));
  let lock = Promise.resolve();

  const q = (strings, ...values) => ({
    text: strings.join("?").replace(/\s+/g, " ").trim(),
    values,
  });

  async function transaction(queries) {
    const run = lock.then(async () => {
      const workspace = queries.find((query) => query.text.startsWith("SELECT id FROM ghic_workspaces"));
      const target = queries.find((query) => query.text.startsWith("SELECT firebase_uid, role"));
      const count = queries.find((query) => query.text.startsWith("SELECT count(*)"));
      const update = queries.find((query) => query.text.startsWith("UPDATE ghic_workspace_members"));
      const targetUid = target.values[0];
      const nextRole = update.values[0];
      const ownerCount = [...roles.values()].filter((role) => role === "owner").length;
      const targetRole = roles.get(targetUid);
      const allowed = targetRole !== "owner" || nextRole === "owner" || ownerCount > 1;

      if (!workspace || !targetRole) return [[], [], [{ count: ownerCount }], []];
      if (allowed) roles.set(targetUid, nextRole);
      return [
        [{ id: "workspace-a" }],
        [{ firebase_uid: targetUid, role: targetRole }],
        [{ count: ownerCount }],
        allowed ? [{ firebase_uid: targetUid, role: nextRole }] : [],
      ];
    });
    lock = run.catch(() => {});
    return run;
  }

  return {
    value: {
      database: async () => q,
      transaction,
      getUser: async (uid, workspaceId) => ({
        id: uid,
        workspaceId,
        workspaceRole: roles.get(uid),
        role: roles.get(uid),
      }),
    },
    roles,
  };
}

test("concurrent owner demotions leave one owner", async () => {
  const store = roleStore({ ownerA: "owner", ownerB: "owner" });
  const results = await Promise.allSettled([
    updateUserRole("ownerA", "member", "workspace-a", store.value),
    updateUserRole("ownerB", "member", "workspace-a", store.value),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal([...store.roles.values()].filter((role) => role === "owner").length, 1);
});

test("the final owner cannot be demoted while another owner remains eligible", async () => {
  const store = roleStore({ ownerA: "owner", ownerB: "member" });
  await assert.rejects(
    updateUserRole("ownerA", "viewer", "workspace-a", store.value),
    (error) => error.status === 409 && /only owner/.test(error.message),
  );
  assert.equal(store.roles.get("ownerA"), "owner");
});

test("demoting one of multiple owners succeeds", async () => {
  const store = roleStore({ ownerA: "owner", ownerB: "owner" });
  const result = await updateUserRole("ownerA", "admin", "workspace-a", store.value);
  assert.equal(result.workspaceRole, "admin");
  assert.equal(store.roles.get("ownerB"), "owner");
});

test("workspace-owned database helpers fail closed without tenant context", async () => {
  for (const operation of [
    () => getUser("user-a"),
    () => listUsers(),
    () => updateUserRole("user-a", "member"),
    () => getOrgSettings(),
    () => updateOrgSettings({}, "user-a"),
  ]) {
    await assert.rejects(
      operation(),
      (error) => error.status === 403 && error.code === "workspace_access_denied",
    );
  }
});
