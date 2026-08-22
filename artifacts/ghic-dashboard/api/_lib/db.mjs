/**
 * Postgres access for user and organisation records.
 *
 * Uses @neondatabase/serverless, which talks to Neon over HTTP rather than
 * holding a TCP connection. That matters here: serverless functions scale
 * horizontally and a pooled TCP driver exhausts a Postgres connection
 * limit quickly under load. Same database as GHIC's ledger — one
 * DATABASE_URL, no new infrastructure.
 *
 * Tables are created on demand (CREATE TABLE IF NOT EXISTS) rather than
 * through a migration tool. For two tables owned entirely by this service
 * that is proportionate; if the schema grows or another service starts
 * writing to it, this should become real migrations before it becomes a
 * source of drift.
 */
import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { runTenancyMigrations } from "./migrations.mjs";

/**
 * Every account owns a private workspace created at signup.
 *
 * The id is random, never derived from the account: an id built from an
 * email or uid leaks who the workspace belongs to and lets anyone who knows
 * an address guess the identifier that appears in ownership rows.
 *
 * The name is a constant for the same reason -- it is displayed, and the
 * owner can rename it through the organization settings route. Nothing
 * user-supplied reaches either value.
 */
const WORKSPACE_ID_BYTES = 16;
export const DEFAULT_PERSONAL_WORKSPACE_NAME = "Personal Workspace";

export function newWorkspaceId() {
  return `ws_${randomBytes(WORKSPACE_ID_BYTES).toString("hex")}`;
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.GHIC_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "";

export const dbConfigured = Boolean(DATABASE_URL);

let _sql = null;
let _ready = null;

function sql() {
  if (!dbConfigured) {
    const e = new Error(
      "No database configured. Set DATABASE_URL to enable user accounts and settings.",
    );
    e.status = 503;
    throw e;
  }
  if (!_sql) _sql = neon(DATABASE_URL);
  return _sql;
}

/**
 * Create the schema once per cold start.
 *
 * `_ready` memoises the promise, not the result, so concurrent requests on
 * a fresh instance wait on one execution instead of racing several
 * CREATE TABLE statements.
 */
function ready() {
  if (_ready) return _ready;
  const q = sql();
  _ready = (async () => {
    await q`
      CREATE TABLE IF NOT EXISTS ghic_users (
        firebase_uid TEXT PRIMARY KEY,
        github_id    TEXT,
        name         TEXT,
        email        TEXT,
        avatar_url   TEXT,
        role         TEXT NOT NULL DEFAULT 'member',
        settings     JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await q`CREATE INDEX IF NOT EXISTS ghic_users_email_idx ON ghic_users (email)`;
    await q`
      CREATE TABLE IF NOT EXISTS ghic_org_settings (
        id           INTEGER PRIMARY KEY DEFAULT 1,
        workspace_name TEXT NOT NULL DEFAULT 'GHIC Workspace',
        settings     JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by   TEXT,
        CONSTRAINT ghic_org_settings_single_row CHECK (id = 1)
      )`;
    await q`
      CREATE TABLE IF NOT EXISTS ghic_github_installations (
        installation_id BIGINT PRIMARY KEY,
        account_login   TEXT NOT NULL,
        account_type    TEXT NOT NULL,
        account_github_id BIGINT,
        repository_selection TEXT,
        connected_by_firebase_uid TEXT NOT NULL,
        connected_by_github_id TEXT,
        connection_status TEXT NOT NULL DEFAULT 'connected',
        status_reason TEXT,
        status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at TIMESTAMPTZ
      )`;
    await q`
      CREATE INDEX IF NOT EXISTS ghic_github_installations_active_idx
      ON ghic_github_installations (revoked_at)
      WHERE revoked_at IS NULL`;
    // Additive lifecycle fields for deployments created before Phase 2.
    await q`
      ALTER TABLE ghic_github_installations
      ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'connected'`;
    await q`
      ALTER TABLE ghic_github_installations
      ADD COLUMN IF NOT EXISTS status_reason TEXT`;
    await q`
      ALTER TABLE ghic_github_installations
      ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
    await q`
      UPDATE ghic_github_installations
      SET connection_status = CASE
        WHEN revoked_at IS NOT NULL THEN 'revoked'
        ELSE COALESCE(NULLIF(connection_status, ''), 'connected')
      END
      WHERE revoked_at IS NOT NULL
         OR connection_status IS NULL
         OR connection_status = ''`;
    await q`
      CREATE TABLE IF NOT EXISTS ghic_github_repositories (
        repo_full_name TEXT PRIMARY KEY,
        installation_id BIGINT NOT NULL REFERENCES ghic_github_installations(installation_id),
        github_repo_id BIGINT,
        private BOOLEAN NOT NULL DEFAULT false,
        default_branch TEXT,
        html_url TEXT,
        active BOOLEAN NOT NULL DEFAULT true,
        connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        removed_at TIMESTAMPTZ
      )`;
    await q`
      CREATE INDEX IF NOT EXISTS ghic_github_repositories_installation_idx
      ON ghic_github_repositories (installation_id)`;
    await q`
      CREATE TABLE IF NOT EXISTS ghic_github_installation_intents (
        state_hash   TEXT PRIMARY KEY,
        firebase_uid TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at   TIMESTAMPTZ NOT NULL,
        consumed_at  TIMESTAMPTZ,
        status       TEXT NOT NULL DEFAULT 'pending'
      )`;
    await q`
      CREATE INDEX IF NOT EXISTS ghic_github_installation_intents_expiry_idx
      ON ghic_github_installation_intents (expires_at)
      WHERE consumed_at IS NULL`;
    await runTenancyMigrations(q);
  })();
  return _ready;
}

/** Defaults for a user's own preferences. */
export const DEFAULT_USER_SETTINGS = {
  displayName: null,
  avatarUrl: null,
  theme: "system",
  timezone: "UTC",
  emailPreferences: { productUpdates: false, weeklyDigest: false },
  notificationPreferences: {
    criticalAlerts: true,
    regressions: true,
    duplicates: false,
  },
};

/** Defaults for the workspace. */
export const DEFAULT_ORG_SETTINGS = {
  repositoryPreferences: { autoIndex: false, defaultThreshold: 0.5 },
  aiPreferences: { analysisEnabled: true, repositoryEvidence: false },
  defaultCommentBehaviour: "comment_only",
};

/**
 * Authenticate a verified identity against workspace membership.
 *
 * A known account is resolved to the workspace it already belongs to. An
 * unknown one is given a private workspace of its own and made its owner.
 *
 * This used to admit only the very first account and refuse every other
 * identity, because there was one shared workspace and letting a stranger
 * into it would have handed them somebody else's repositories. Per-account
 * workspaces remove that risk at the source: a new identity lands in an
 * empty workspace containing nothing, so there is nothing to protect it
 * from. What has not changed is that membership remains the only thing that
 * grants access to a workspace -- a valid Firebase token still proves
 * identity and nothing else.
 */
export async function authenticateUser(claims) {
  await ready();
  const q = sql();

  // Existing membership is authoritative. A valid Firebase token proves
  // identity; it does not grant access to this workspace.
  const rows = await q`
    UPDATE ghic_users SET
      github_id  = COALESCE(${claims.githubId}, github_id),
      name       = COALESCE(${claims.name}, name),
      email      = COALESCE(${claims.email}, email),
      avatar_url = COALESCE(${claims.avatarUrl}, avatar_url),
      last_login = now()
    WHERE firebase_uid = ${claims.uid}
    RETURNING firebase_uid, github_id, name, email, avatar_url, role, settings,
              created_at, last_login`;
  if (rows.length) return withWorkspace(q, shapeUser(rows[0]));

  // An identity with no row yet gets its own workspace rather than being
  // refused. It can still only ever see that workspace.
  const bootstrap = await bootstrapUserWorkspace(q, claims);
  if (bootstrap.length) {
    return withWorkspace(q, shapeUser(bootstrap[0]));
  }

  const error = new Error(
    "This account could not be given a workspace.",
  );
  error.status = 403;
  error.code = "workspace_access_denied";
  throw error;
}

/**
 * Create an account and the private workspace it owns, atomically.
 *
 * One transaction writes the user, the workspace, its settings and an owner
 * membership. Partial success is the failure mode that matters: a user row
 * with no membership is an account that can authenticate and then be refused
 * by every route, which looks like corruption and cannot be repaired through
 * the product. The final SELECT joins the user CTE to the membership CTE, so
 * this returns a row only when both exist.
 *
 * The advisory lock is per-account, not global. Two concurrent first
 * requests for the same new identity would otherwise each find no membership
 * and each mint a workspace, leaving one account owning two. Keying the lock
 * on the uid serialises that race while letting unrelated signups proceed in
 * parallel -- a global lock would put every signup in the product behind one
 * queue.
 */
export async function bootstrapUserWorkspace(q, claims, workspaceId = newWorkspaceId()) {
  const [, bootstrap] = await q.transaction([
    q`SELECT pg_advisory_xact_lock(hashtextextended('ghic.user-bootstrap:' || ${claims.uid}, 0))`,
    q`
      WITH inserted_user AS (
        INSERT INTO ghic_users
          (firebase_uid, github_id, name, email, avatar_url, role)
        VALUES (${claims.uid}, ${claims.githubId}, ${claims.name}, ${claims.email},
                ${claims.avatarUrl}, 'owner')
        ON CONFLICT (firebase_uid) DO NOTHING
        RETURNING firebase_uid, github_id, name, email, avatar_url, role,
                  settings, created_at, last_login
      ), inserted_workspace AS (
        INSERT INTO ghic_workspaces (id, name)
        SELECT ${workspaceId}, ${DEFAULT_PERSONAL_WORKSPACE_NAME}
        FROM inserted_user
        WHERE NOT EXISTS (
          SELECT 1 FROM ghic_workspace_members WHERE firebase_uid = ${claims.uid}
        )
        RETURNING id
      ), inserted_settings AS (
        INSERT INTO ghic_workspace_settings (workspace_id, workspace_name)
        SELECT id, ${DEFAULT_PERSONAL_WORKSPACE_NAME} FROM inserted_workspace
        ON CONFLICT (workspace_id) DO NOTHING
        RETURNING workspace_id
      ), inserted_membership AS (
        INSERT INTO ghic_workspace_members (workspace_id, firebase_uid, role)
        SELECT w.id, u.firebase_uid, 'owner'
        FROM inserted_workspace w, inserted_user u
        ON CONFLICT (workspace_id, firebase_uid) DO NOTHING
        RETURNING firebase_uid
      )
      SELECT u.firebase_uid, u.github_id, u.name, u.email, u.avatar_url,
             u.role, u.settings, u.created_at, u.last_login
      FROM inserted_user u
      JOIN inserted_membership m USING (firebase_uid)`,
  ]);
  return bootstrap || [];
}

export async function resolveWorkspace(uid, { requireRole = null } = {}) {
  const q = await database();
  const rows = await q`
    SELECT w.id, w.name, m.role
    FROM ghic_workspace_members m
    JOIN ghic_workspaces w ON w.id = m.workspace_id
    WHERE m.firebase_uid = ${uid}
    ORDER BY m.created_at ASC`;
  const membership = rows.find((row) => !requireRole || roleAtLeast(row.role, requireRole));
  if (!membership) {
    const error = new Error("This account is not a member of an authorized GHIC workspace.");
    error.status = 403;
    error.code = "workspace_access_denied";
    throw error;
  }
  return { id: membership.id, name: membership.name, role: membership.role };
}

async function withWorkspace(q, user) {
  const rows = await q`
    SELECT w.id, w.name, m.role
    FROM ghic_workspace_members m
    JOIN ghic_workspaces w ON w.id = m.workspace_id
    WHERE m.firebase_uid = ${user.id}
    ORDER BY m.created_at ASC LIMIT 1`;
  if (!rows.length) {
    const error = new Error("This account is not a member of an authorized GHIC workspace.");
    error.status = 403;
    error.code = "workspace_access_denied";
    throw error;
  }
  return { ...user, workspaceId: rows[0].id, workspaceName: rows[0].name, workspaceRole: rows[0].role };
}

function roleAtLeast(actual, required) {
  const order = { viewer: 0, member: 1, admin: 2, owner: 3 };
  return (order[actual] ?? -1) >= (order[required] ?? 99);
}

/**
 * Reject an absent workspace, including one that is only whitespace.
 *
 * Exported because the same check was open-coded as `if (!workspaceId)` in
 * the installation and product-data modules, where a string of spaces is
 * truthy and slipped through into a query. Nothing can currently produce
 * such a value -- ids come from the database -- but a guard that depends on
 * that staying true is not a guard.
 */
export function requireWorkspaceContext(workspaceId) {
  const value = String(workspaceId || "").trim();
  if (!value) {
    const error = new Error("Workspace context is required.");
    error.status = 403;
    error.code = "workspace_access_denied";
    throw error;
  }
  return value;
}

/** A ready Neon query function for server-only product data access. */
export async function database() {
  await ready();
  return sql();
}

/** Execute related writes in one Neon/Postgres transaction. */
export async function transaction(queries) {
  await ready();
  return sql().transaction(queries);
}

export async function getUser(uid, workspaceId) {
  workspaceId = requireWorkspaceContext(workspaceId);
  await ready();
  const q = sql();
  const rows = await q`
    SELECT u.firebase_uid, u.github_id, u.name, u.email, u.avatar_url,
           u.role, m.role AS workspace_role, u.settings,
           u.created_at, u.last_login
    FROM ghic_users u
    JOIN ghic_workspace_members m ON m.firebase_uid = u.firebase_uid
    WHERE u.firebase_uid = ${uid} AND m.workspace_id = ${workspaceId}`;
  return rows.length
    ? { ...shapeUser(rows[0]), role: rows[0].workspace_role, workspaceRole: rows[0].workspace_role, workspaceId }
    : null;
}

export async function listUsers(workspaceId) {
  workspaceId = requireWorkspaceContext(workspaceId);
  await ready();
  const q = sql();
  const rows = await q`
    SELECT u.firebase_uid, u.github_id, u.name, u.email, u.avatar_url,
           u.role, m.role AS workspace_role, u.settings,
           u.created_at, u.last_login
    FROM ghic_users u
    JOIN ghic_workspace_members m ON m.firebase_uid = u.firebase_uid
    WHERE m.workspace_id = ${workspaceId}
    ORDER BY u.created_at ASC`;
  return rows.map((row) => ({
    ...shapeUser(row),
    role: row.workspace_role,
    workspaceRole: row.workspace_role,
    workspaceId,
  }));
}

export async function updateUserSettings(uid, patch) {
  await ready();
  const q = sql();
  const rows = await q`
    UPDATE ghic_users
    SET settings = settings || ${JSON.stringify(patch)}::jsonb
    WHERE firebase_uid = ${uid}
    RETURNING firebase_uid, github_id, name, email, avatar_url, role, settings,
              created_at, last_login`;
  if (!rows.length) {
    const e = new Error("User not found.");
    e.status = 404;
    throw e;
  }
  return shapeUser(rows[0]);
}

/**
 * Change another user's role.
 *
 * Refuses to remove the last owner. Without that guard a workspace can be
 * left with nobody able to administer it, recoverable only by editing the
 * database by hand.
 */
export async function updateUserRole(
  targetUid,
  role,
  workspaceId,
  deps = null,
) {
  workspaceId = requireWorkspaceContext(workspaceId);
  if (deps) {
    const q = await deps.database();
    const [workspaceRows, targetRows, ownerRows, updatedRows] =
      await deps.transaction([
        // Serialize all owner changes for this workspace. The lock must be
        // acquired before counting owners, otherwise concurrent demotions
        // can both observe the same owner count and remove the last owners.
        q`
          SELECT id FROM ghic_workspaces
          WHERE id = ${workspaceId}
          FOR UPDATE`,
        q`
          SELECT firebase_uid, role
          FROM ghic_workspace_members
          WHERE firebase_uid = ${targetUid} AND workspace_id = ${workspaceId}
          FOR UPDATE`,
        q`
          SELECT count(*)::int AS count
          FROM ghic_workspace_members
          WHERE workspace_id = ${workspaceId} AND role = 'owner'`,
        q`
          UPDATE ghic_workspace_members
          SET role = ${role}, updated_at = now()
          WHERE firebase_uid = ${targetUid} AND workspace_id = ${workspaceId}
            AND (
              (role = 'owner' AND ${role} = 'owner')
              OR role <> 'owner'
              OR (
                SELECT count(*) FROM ghic_workspace_members
                WHERE workspace_id = ${workspaceId} AND role = 'owner'
              ) > 1
            )
          RETURNING firebase_uid, role`,
      ]);

    if (!workspaceRows.length || !targetRows.length) {
      const e = new Error("User not found.");
      e.status = 404;
      throw e;
    }
    if (targetRows[0].role === "owner" && role !== "owner" &&
        Number(ownerRows[0]?.count || 0) <= 1) {
      const e = new Error(
        "Cannot demote the only owner; promote another owner first.",
      );
      e.status = 409;
      throw e;
    }
    if (!updatedRows.length) {
      const e = new Error("The role could not be changed.");
      e.status = 409;
      throw e;
    }
    return deps.getUser(targetUid, workspaceId);
  }

  await ready();
  const q = sql();
  const [workspaceRows, targetRows, ownerRows, updatedRows] =
    await transaction([
      // Lock the workspace row for the complete owner count/update sequence.
      q`
        SELECT id FROM ghic_workspaces
        WHERE id = ${workspaceId}
        FOR UPDATE`,
      q`
        SELECT firebase_uid, role
        FROM ghic_workspace_members
        WHERE firebase_uid = ${targetUid} AND workspace_id = ${workspaceId}
        FOR UPDATE`,
      q`
        SELECT count(*)::int AS count
        FROM ghic_workspace_members
        WHERE workspace_id = ${workspaceId} AND role = 'owner'`,
      q`
        UPDATE ghic_workspace_members
        SET role = ${role}, updated_at = now()
        WHERE firebase_uid = ${targetUid} AND workspace_id = ${workspaceId}
          AND (
            (role = 'owner' AND ${role} = 'owner')
            OR role <> 'owner'
            OR (
              SELECT count(*) FROM ghic_workspace_members
              WHERE workspace_id = ${workspaceId} AND role = 'owner'
            ) > 1
          )
        RETURNING firebase_uid, role`,
    ]);
  if (!workspaceRows.length || !targetRows.length) {
    const e = new Error("User not found.");
    e.status = 404;
    throw e;
  }
  if (targetRows[0].role === "owner" && role !== "owner" &&
      Number(ownerRows[0]?.count || 0) <= 1) {
    const e = new Error(
      "Cannot demote the only owner; promote another owner first.",
    );
    e.status = 409;
    throw e;
  }
  if (!updatedRows.length) {
    const e = new Error("The role could not be changed.");
    e.status = 409;
    throw e;
  }
  return getUser(targetUid, workspaceId);
}

export async function getOrgSettings(workspaceId) {
  workspaceId = requireWorkspaceContext(workspaceId);
  await ready();
  const q = sql();
  await q`INSERT INTO ghic_workspace_settings (workspace_id) VALUES (${workspaceId}) ON CONFLICT (workspace_id) DO NOTHING`;
  const rows = await q`
    SELECT workspace_name, settings, updated_at, updated_by
    FROM ghic_workspace_settings WHERE workspace_id = ${workspaceId}`;
  const row = rows[0] || {};
  return {
    workspaceName: row.workspace_name || "GHIC Workspace",
    ...DEFAULT_ORG_SETTINGS,
    ...(row.settings || {}),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

export async function updateOrgSettings(patch, actorUid, workspaceId) {
  workspaceId = requireWorkspaceContext(workspaceId);
  await ready();
  const q = sql();
  const { workspaceName, ...rest } = patch || {};
  await q`INSERT INTO ghic_workspace_settings (workspace_id) VALUES (${workspaceId}) ON CONFLICT (workspace_id) DO NOTHING`;
  await q`
    UPDATE ghic_workspace_settings
    SET workspace_name = COALESCE(${workspaceName ?? null}, workspace_name),
        settings   = settings || ${JSON.stringify(rest)}::jsonb,
        updated_at = now(),
        updated_by = ${actorUid}
    WHERE workspace_id = ${workspaceId}`;
  return getOrgSettings(workspaceId);
}

function shapeUser(row) {
  const storedSettings = row.settings || {};
  return {
    id: row.firebase_uid,
    firebaseUid: row.firebase_uid,
    githubId: row.github_id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    role: row.role,
    settings: {
      ...DEFAULT_USER_SETTINGS,
      ...storedSettings,
      emailPreferences: {
        ...DEFAULT_USER_SETTINGS.emailPreferences,
        ...(storedSettings.emailPreferences || {}),
      },
      notificationPreferences: {
        ...DEFAULT_USER_SETTINGS.notificationPreferences,
        ...(storedSettings.notificationPreferences || {}),
      },
    },
    createdAt: row.created_at,
    lastLogin: row.last_login,
  };
}
