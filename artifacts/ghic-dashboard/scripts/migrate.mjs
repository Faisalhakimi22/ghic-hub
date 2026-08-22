/**
 * Deliberate production migration entrypoint.
 *
 * The Hub normally applies tenancy migrations implicitly: db.mjs `ready()`
 * calls runTenancyMigrations on the first request after a cold start. That is
 * fine for steady state but wrong for a first production rollout, where the
 * migration must run at a moment somebody chose, with the before/after state
 * recorded either side of it.
 *
 * This runs the same official runner against the same driver -- it is not a
 * reimplementation. Importing migrations.mjs directly is the point: if the
 * runner changes, this changes with it.
 *
 * Usage:
 *   node scripts/migrate.mjs --env-file <path> [--confirm]
 *
 * Without --confirm it reports the applied versions and exits without
 * writing, so a dry inspection is the default and applying is the opt-in.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { runTenancyMigrations } from "../api/_lib/migrations.mjs";

function parseArgs(argv) {
  const args = { envFile: null, confirm: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--env-file") args.envFile = argv[++i];
    else if (argv[i] === "--confirm") args.confirm = true;
  }
  return args;
}

/** Read KEY=VALUE lines so the credential never appears in argv or output. */
function loadEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

async function appliedVersions(q) {
  const rows = await q`
    SELECT version, applied_at
    FROM ghic_schema_migrations
    ORDER BY version`.catch((error) => {
    // 42P01: the table does not exist yet, which is the pre-migration state.
    if (error?.code === "42P01") return null;
    throw error;
  });
  if (rows === null) return null;
  return rows.map((r) => ({
    version: Number(r.version),
    applied_at: new Date(r.applied_at).toISOString(),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fileEnv = args.envFile ? loadEnvFile(args.envFile) : {};
  const url =
    fileEnv.DATABASE_URL ||
    process.env.DATABASE_URL ||
    fileEnv.GHIC_DATABASE_URL ||
    process.env.GHIC_DATABASE_URL;

  if (!url) {
    console.error("No database URL configured.");
    process.exitCode = 2;
    return;
  }

  const q = neon(url);
  const host = new URL(url).hostname.replace(/^[^.]*/, "<endpoint>");

  const before = await appliedVersions(q);
  const report = { host, before: before ?? "ghic_schema_migrations does not exist" };

  if (!args.confirm) {
    console.log(JSON.stringify({ ...report, applied: false, reason: "--confirm not supplied" }, null, 2));
    return;
  }

  const startedAt = Date.now();
  await runTenancyMigrations(q);
  const elapsedMs = Date.now() - startedAt;

  const after = await appliedVersions(q);
  console.log(JSON.stringify({ ...report, applied: true, elapsed_ms: elapsedMs, after }, null, 2));
}

main().catch((error) => {
  // Surface the failure without echoing a message that may carry the DSN.
  console.error(JSON.stringify({
    applied: false,
    error_name: error?.name ?? "Error",
    error_code: error?.code ?? null,
    error_message: String(error?.message ?? "").replace(/postgres(ql)?:\/\/\S+/gi, "<redacted>"),
  }, null, 2));
  process.exitCode = 1;
});
