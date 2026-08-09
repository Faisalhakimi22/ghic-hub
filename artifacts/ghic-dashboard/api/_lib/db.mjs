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
import { neon } from "@neondatabase/serverless";

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
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at TIMESTAMPTZ
      )`;
    await q`
      CREATE INDEX IF NOT EXISTS ghic_github_installations_active_idx
      ON ghic_github_installations (revoked_at)
      WHERE revoked_at IS NULL`;
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
 * The first account bootstraps an empty workspace as owner. After that,
 * Firebase proves identity only: access requires an existing ghic_users row.
 * This prevents an unrelated Firebase user from joining the shared workspace.
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
  if (rows.length) return shapeUser(rows[0]);

  // Bootstrap only an empty installation. Once any member exists, unknown
  // identities fail closed instead of being silently admitted as members.
  const bootstrap = await q`
    INSERT INTO ghic_users (firebase_uid, github_id, name, email, avatar_url, role)
    SELECT ${claims.uid}, ${claims.githubId}, ${claims.name}, ${claims.email},
           ${claims.avatarUrl}, 'owner'
    WHERE NOT EXISTS (SELECT 1 FROM ghic_users)
    ON CONFLICT (firebase_uid) DO NOTHING
    RETURNING firebase_uid, github_id, name, email, avatar_url, role, settings,
              created_at, last_login`;
  if (bootstrap.length) return shapeUser(bootstrap[0]);

  const error = new Error(
    "This account is not a member of the GHIC workspace.",
  );
  error.status = 403;
  error.code = "workspace_access_denied";
  throw error;
}

/** A ready Neon query function for server-only product data access. */
export async function database() {
  await ready();
  return sql();
}

export async function getUser(uid) {
  await ready();
  const q = sql();
  const rows = await q`
    SELECT firebase_uid, github_id, name, email, avatar_url, role, settings,
           created_at, last_login
    FROM ghic_users WHERE firebase_uid = ${uid}`;
  return rows.length ? shapeUser(rows[0]) : null;
}

export async function listUsers() {
  await ready();
  const q = sql();
  const rows = await q`
    SELECT firebase_uid, github_id, name, email, avatar_url, role, settings,
           created_at, last_login
    FROM ghic_users ORDER BY created_at ASC`;
  return rows.map(shapeUser);
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
export async function updateUserRole(targetUid, role) {
  await ready();
  const q = sql();

  const [{ count }] = await q`
    SELECT count(*)::int AS count FROM ghic_users WHERE role = 'owner'`;
  const existing = await getUser(targetUid);
  if (!existing) {
    const e = new Error("User not found.");
    e.status = 404;
    throw e;
  }
  if (existing.role === "owner" && role !== "owner" && count <= 1) {
    const e = new Error(
      "Cannot demote the only owner; promote another owner first.",
    );
    e.status = 409;
    throw e;
  }

  const rows = await q`
    UPDATE ghic_users SET role = ${role} WHERE firebase_uid = ${targetUid}
    RETURNING firebase_uid, github_id, name, email, avatar_url, role, settings,
              created_at, last_login`;
  return shapeUser(rows[0]);
}

export async function getOrgSettings() {
  await ready();
  const q = sql();
  await q`INSERT INTO ghic_org_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  const rows = await q`
    SELECT workspace_name, settings, updated_at, updated_by
    FROM ghic_org_settings WHERE id = 1`;
  const row = rows[0] || {};
  return {
    workspaceName: row.workspace_name || "GHIC Workspace",
    ...DEFAULT_ORG_SETTINGS,
    ...(row.settings || {}),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

export async function updateOrgSettings(patch, actorUid) {
  await ready();
  const q = sql();
  const { workspaceName, ...rest } = patch || {};
  await q`INSERT INTO ghic_org_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  await q`
    UPDATE ghic_org_settings
    SET workspace_name = COALESCE(${workspaceName ?? null}, workspace_name),
        settings   = settings || ${JSON.stringify(rest)}::jsonb,
        updated_at = now(),
        updated_by = ${actorUid}
    WHERE id = 1`;
  return getOrgSettings();
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
