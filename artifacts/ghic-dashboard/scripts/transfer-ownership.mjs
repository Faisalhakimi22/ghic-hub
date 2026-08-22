/**
 * Transfer workspace ownership using the application's own role path.
 *
 * This deliberately calls updateUserRole() from api/_lib/db.mjs rather than
 * issuing UPDATE statements. That function serialises on the workspace row
 * (SELECT ... FOR UPDATE) before counting owners and refuses to demote the
 * last one, so ordering promote-then-demote is not a convention here -- it is
 * the only sequence the invariant permits.
 *
 * Only ghic_workspace_members.role is written. getUser() overrides `role`
 * with `workspace_role`, so the members table is authoritative and the legacy
 * ghic_users.role column is shadowed everywhere it is read. Writing it too
 * would change nothing and drift a column no code consults.
 *
 * What this does NOT go through is the HTTP layer's requireRoleChange guard,
 * which would reject the actor here: the incoming owner is currently a member
 * and cannot promote himself. That guard protects the multi-user API surface,
 * not an operator working directly against their own database.
 *
 * Usage:
 *   node scripts/transfer-ownership.mjs --env-file <path> \
 *     --to <uid> [--demote <uid>] [--demote-to admin] [--confirm]
 */
import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = { envFile: null, to: null, demote: null, demoteTo: "admin", confirm: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--env-file") args.envFile = argv[++i];
    else if (argv[i] === "--to") args.to = argv[++i];
    else if (argv[i] === "--demote") args.demote = argv[++i];
    else if (argv[i] === "--demote-to") args.demoteTo = argv[++i];
    else if (argv[i] === "--confirm") args.confirm = true;
  }
  return args;
}

function loadEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq !== -1) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

const args = parseArgs(process.argv.slice(2));
if (!args.to) {
  console.error("--to <uid> is required");
  process.exit(2);
}

// db.mjs reads DATABASE_URL at module scope, so the environment must be
// populated before it is imported.
if (args.envFile) {
  const fileEnv = loadEnvFile(args.envFile);
  for (const [k, v] of Object.entries(fileEnv)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

const { listUsers, updateUserRole } = await import("../api/_lib/db.mjs");
// db.mjs consumes this but does not re-export it; migrations.mjs is the owner
// of the constant. Passing undefined trips requireWorkspaceContext, correctly.
const { DEFAULT_WORKSPACE_ID } = await import("../api/_lib/migrations.mjs");

const summarise = (users) =>
  users.map((u) => ({ uid: u.id, email: u.email, role: u.workspaceRole }));

const before = await listUsers(DEFAULT_WORKSPACE_ID);
console.log("before:", JSON.stringify(summarise(before), null, 2));

if (!args.confirm) {
  console.log(JSON.stringify({ changed: false, reason: "--confirm not supplied" }, null, 2));
  process.exit(0);
}

// Promote first. The reverse order would attempt to remove the only owner and
// updateUserRole would reject it with a 409, which is the guard working.
await updateUserRole(args.to, "owner", DEFAULT_WORKSPACE_ID);
console.log(`promoted ${args.to} -> owner`);

if (args.demote) {
  await updateUserRole(args.demote, args.demoteTo, DEFAULT_WORKSPACE_ID);
  console.log(`demoted ${args.demote} -> ${args.demoteTo}`);
}

const after = await listUsers(DEFAULT_WORKSPACE_ID);
console.log("after:", JSON.stringify(summarise(after), null, 2));

const owners = after.filter((u) => u.workspaceRole === "owner");
console.log(JSON.stringify({
  changed: true,
  owner_count: owners.length,
  owners: owners.map((u) => u.email),
}, null, 2));
