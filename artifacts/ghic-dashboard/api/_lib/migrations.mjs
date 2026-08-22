const DEFAULT_WORKSPACE_ID = "ghic-default-workspace";
const VERSION = 2;
const OWNERSHIP_VERSION = 3;
const LEDGER_VALIDATION_VERSION = 4;

// This migration is additive and deliberately leaves the legacy singleton
// columns/constraints in place for the expand-and-contract rollout.
export async function runTenancyMigrations(q) {
  const statements = [
    // This is the first statement in the transaction. The lock is released
    // automatically on commit/rollback, so concurrent serverless instances
    // wait without relying on process-local state.
    q`SELECT pg_advisory_xact_lock(hashtextextended('ghic.tenancy.migrations', 0))`,
    q`CREATE TABLE IF NOT EXISTS ghic_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    q`CREATE TABLE IF NOT EXISTS ghic_workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    q`CREATE TABLE IF NOT EXISTS ghic_workspace_members (
      workspace_id TEXT NOT NULL REFERENCES ghic_workspaces(id),
      firebase_uid TEXT NOT NULL REFERENCES ghic_users(firebase_uid),
      role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, firebase_uid)
    )`,
    q`CREATE INDEX IF NOT EXISTS ghic_workspace_members_user_idx
       ON ghic_workspace_members (firebase_uid)`,
    q`CREATE TABLE IF NOT EXISTS ghic_workspace_settings (
      workspace_id TEXT PRIMARY KEY REFERENCES ghic_workspaces(id),
      workspace_name TEXT NOT NULL DEFAULT 'GHIC Workspace',
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by TEXT
    )`,
    // Guarded like every other backfill in this migration. Without the
    // guard this ran on each cold start, and MAX() over an empty
    // ghic_org_settings still returns one row -- so once the original
    // single-tenant data was cleared, every deploy recreated the default
    // workspace as an ownerless row that nothing could reach.
    // No FROM on the outer select, deliberately. An aggregate with no GROUP BY
    // emits exactly one row however many inputs survive its WHERE, so
    // `SELECT MAX(...) FROM ghic_org_settings WHERE <guard>` still inserts once
    // that table is empty -- which is how this statement kept recreating the
    // default workspace after the single-tenant data was cleared, and how the
    // first attempt at guarding it failed too. With no FROM, WHERE decides
    // whether a row exists at all, and MAX moves into a scalar subquery.
    q`INSERT INTO ghic_workspaces (id, name)
       SELECT ${DEFAULT_WORKSPACE_ID},
              COALESCE((SELECT MAX(workspace_name) FROM ghic_org_settings), 'GHIC Workspace')
       WHERE NOT EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = ${VERSION})
       ON CONFLICT (id) DO NOTHING`,
    q`ALTER TABLE ghic_org_settings ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    q`ALTER TABLE ghic_github_installations ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    q`ALTER TABLE ghic_github_repositories ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    q`ALTER TABLE ghic_github_installation_intents ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    q`DO $$ BEGIN
         IF to_regclass('public.ghic_repository_state') IS NOT NULL THEN
           ALTER TABLE ghic_repository_state ADD COLUMN IF NOT EXISTS workspace_id TEXT;
         END IF;
       IF to_regclass('public.ghic_repo_chunks') IS NOT NULL THEN
           ALTER TABLE ghic_repo_chunks ADD COLUMN IF NOT EXISTS workspace_id TEXT;
         END IF;
         IF to_regclass('public.ghic_ledger') IS NOT NULL THEN
           ALTER TABLE ghic_ledger ADD COLUMN IF NOT EXISTS workspace_id TEXT;
         END IF;
       END $$`,
    q`UPDATE ghic_org_settings
       SET workspace_id = ${DEFAULT_WORKSPACE_ID}
       WHERE workspace_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = ${VERSION})`,
    q`INSERT INTO ghic_workspace_settings (workspace_id, workspace_name, settings, updated_at, updated_by)
       SELECT ${DEFAULT_WORKSPACE_ID}, workspace_name, settings, updated_at, updated_by
       FROM ghic_org_settings
       WHERE id = 1
         AND NOT EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = ${VERSION})
       ON CONFLICT (workspace_id) DO NOTHING`,
    q`UPDATE ghic_github_installations
       SET workspace_id = ${DEFAULT_WORKSPACE_ID}
       WHERE workspace_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = ${VERSION})`,
    q`UPDATE ghic_github_repositories
       SET workspace_id = ${DEFAULT_WORKSPACE_ID}
       WHERE workspace_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = ${VERSION})`,
    q`UPDATE ghic_github_installation_intents
       SET workspace_id = ${DEFAULT_WORKSPACE_ID}
       WHERE workspace_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = ${VERSION})`,
    q`DO $$ BEGIN
         IF EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = 2) THEN
           RETURN;
         END IF;
         -- Two-step backfill. The join assigns precise ownership wherever a
         -- connected repository says who owns it; the sweep that follows
         -- claims whatever is left for the single pre-existing workspace.
         --
         -- The sweep is not a convenience. GHIC indexes repositories out of
         -- band (the Vercel Python runtime has no git, see /healthz
         -- can_index), so ghic_repository_state and ghic_repo_chunks
         -- routinely hold rows for repositories that were never registered
         -- in ghic_github_repositories. Without the sweep those rows keep a
         -- NULL workspace_id and the SET NOT NULL in migration 3 fails --
         -- which is exactly the state production is in: 0 repositories,
         -- 1 state row, 1891 chunks.
         --
         -- Ordering is the safety property: the join runs first, so a row
         -- with determinable ownership is never claimed by the default.
         -- And the whole block is behind the version-2 guard above, so this
         -- runs once, during the single-tenant expand, when exactly one
         -- workspace exists. It can never reassign rows in a database that
         -- has since grown a second workspace.
         IF to_regclass('public.ghic_repository_state') IS NOT NULL THEN
           UPDATE ghic_repository_state s
           SET workspace_id = r.workspace_id
           FROM ghic_github_repositories r
           WHERE s.workspace_id IS NULL AND s.repo = r.repo_full_name;
           UPDATE ghic_repository_state
           SET workspace_id = 'ghic-default-workspace'
           WHERE workspace_id IS NULL;
           CREATE INDEX IF NOT EXISTS ghic_repository_state_workspace_repo_idx ON ghic_repository_state (workspace_id, repo);
         END IF;
         IF to_regclass('public.ghic_repo_chunks') IS NOT NULL THEN
           UPDATE ghic_repo_chunks c
           SET workspace_id = r.workspace_id
           FROM ghic_github_repositories r
           WHERE c.workspace_id IS NULL AND c.repo = r.repo_full_name;
           UPDATE ghic_repo_chunks
           SET workspace_id = 'ghic-default-workspace'
           WHERE workspace_id IS NULL;
           CREATE INDEX IF NOT EXISTS ghic_repo_chunks_workspace_repo_idx ON ghic_repo_chunks (workspace_id, repo);
           CREATE INDEX IF NOT EXISTS ghic_repo_chunks_workspace_repo_path_idx ON ghic_repo_chunks (workspace_id, repo, path);
         END IF;
         IF to_regclass('public.ghic_ledger') IS NOT NULL AND EXISTS (
           SELECT 1
           FROM ghic_ledger l
           LEFT JOIN ghic_github_repositories r
             ON l.data->>'repo' = r.repo_full_name
           LEFT JOIN ghic_github_installations i
             ON l.data->>'installation_id' = i.installation_id::text
           WHERE (r.workspace_id IS NOT NULL AND i.workspace_id IS NOT NULL
                  AND r.workspace_id IS DISTINCT FROM i.workspace_id)
              OR (l.workspace_id IS NOT NULL
                  AND COALESCE(r.workspace_id, i.workspace_id) IS NOT NULL
                  AND l.workspace_id IS DISTINCT FROM COALESCE(r.workspace_id, i.workspace_id))
              OR (l.workspace_id IS NOT NULL
                  AND r.workspace_id IS NULL AND i.workspace_id IS NULL)
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: conflicting ledger workspace attribution';
         END IF;
         IF to_regclass('public.ghic_ledger') IS NOT NULL THEN
           UPDATE ghic_ledger l
           SET workspace_id = COALESCE(
             (SELECT r.workspace_id
              FROM ghic_github_repositories r
              WHERE l.data->>'repo' = r.repo_full_name),
             (SELECT i.workspace_id
              FROM ghic_github_installations i
              WHERE l.data->>'installation_id' = i.installation_id::text)
           )
           WHERE l.workspace_id IS NULL
             AND (EXISTS (
               SELECT 1 FROM ghic_github_repositories r
               WHERE l.data->>'repo' = r.repo_full_name
             ) OR EXISTS (
               SELECT 1 FROM ghic_github_installations i
               WHERE l.data->>'installation_id' = i.installation_id::text
             ));
           CREATE INDEX IF NOT EXISTS ghic_ledger_workspace_created_idx ON ghic_ledger (workspace_id, created_at);
         END IF;
       END $$`,
    q`INSERT INTO ghic_workspace_members (workspace_id, firebase_uid, role)
       SELECT ${DEFAULT_WORKSPACE_ID}, firebase_uid,
              CASE WHEN role IN ('owner','admin','member','viewer') THEN role ELSE 'member' END
       FROM ghic_users
       WHERE NOT EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = ${VERSION})
       ON CONFLICT (workspace_id, firebase_uid) DO NOTHING`,
    q`CREATE INDEX IF NOT EXISTS ghic_installations_workspace_idx
       ON ghic_github_installations (workspace_id, installation_id)`,
    q`CREATE INDEX IF NOT EXISTS ghic_repositories_workspace_idx
       ON ghic_github_repositories (workspace_id, repo_full_name)`,
    q`CREATE INDEX IF NOT EXISTS ghic_intents_workspace_idx
       ON ghic_github_installation_intents (workspace_id, firebase_uid)`,
    q`DO $$
       BEGIN
         IF EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = 2) THEN
           RETURN;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM ghic_workspaces WHERE id = 'ghic-default-workspace') THEN
           RAISE EXCEPTION 'tenancy migration validation failed: default workspace is missing';
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_workspace_members m
           LEFT JOIN ghic_workspaces w ON w.id = m.workspace_id
           LEFT JOIN ghic_users u ON u.firebase_uid = m.firebase_uid
           WHERE w.id IS NULL OR u.firebase_uid IS NULL
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: invalid workspace member';
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_github_installations i
           LEFT JOIN ghic_workspaces w ON w.id = i.workspace_id
           WHERE i.workspace_id IS NULL OR w.id IS NULL
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: invalid installation workspace';
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_github_repositories r
           LEFT JOIN ghic_workspaces w ON w.id = r.workspace_id
           LEFT JOIN ghic_github_installations i ON i.installation_id = r.installation_id
           WHERE r.workspace_id IS NULL
              OR w.id IS NULL
              OR i.installation_id IS NULL
              OR i.workspace_id IS DISTINCT FROM r.workspace_id
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: repository ownership mismatch';
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_github_installation_intents x
           LEFT JOIN ghic_workspaces w ON w.id = x.workspace_id
           WHERE x.workspace_id IS NULL OR w.id IS NULL
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: invalid installation intent workspace';
         END IF;
         -- An indexed repository need not be a connected repository.
         -- GHIC indexes out of band (the serverless Python runtime has no
         -- git), so ghic_repository_state legitimately holds rows with no
         -- ghic_github_repositories entry. Rejecting those was what aborted
         -- the first production run: 1 state row, 0 connected repositories.
         --
         -- The mismatch arm is guarded rather than left bare. With a LEFT
         -- JOIN, an unmatched row gives r.workspace_id = NULL, and
         -- NULL IS DISTINCT FROM 'ghic-default-workspace' is TRUE -- so
         -- simply dropping the "r.repo_full_name IS NULL" clause would
         -- re-raise the identical error through the next condition.
         --
         -- What still fails, and should: an unattributed row, or a row
         -- whose workspace disagrees with the repository that owns it.
         IF to_regclass('public.ghic_repository_state') IS NOT NULL AND EXISTS (
           SELECT 1
           FROM ghic_repository_state s
           LEFT JOIN ghic_github_repositories r ON r.repo_full_name = s.repo
           WHERE s.workspace_id IS NULL
              OR (r.repo_full_name IS NOT NULL
                  AND r.workspace_id IS DISTINCT FROM s.workspace_id)
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: repository state mismatch';
         END IF;
         -- Same reasoning as the state check above, and the same guarded
         -- mismatch arm. Production holds 1891 chunk rows for a repository
         -- that is not connected.
         IF to_regclass('public.ghic_repo_chunks') IS NOT NULL AND EXISTS (
           SELECT 1
           FROM ghic_repo_chunks c
           LEFT JOIN ghic_github_repositories r ON r.repo_full_name = c.repo
           WHERE c.workspace_id IS NULL
              OR (r.repo_full_name IS NOT NULL
                  AND r.workspace_id IS DISTINCT FROM c.workspace_id)
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: repository chunk mismatch';
         END IF;
         IF to_regclass('public.ghic_ledger') IS NOT NULL AND EXISTS (
           SELECT 1
           FROM ghic_ledger l
           LEFT JOIN ghic_github_repositories r
             ON l.data->>'repo' = r.repo_full_name
           WHERE l.workspace_id IS NOT NULL
             AND r.repo_full_name IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM ghic_github_installations i
               WHERE l.data->>'installation_id' = i.installation_id::text
             )
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: ledger workspace cannot be established';
         END IF;
         IF to_regclass('public.ghic_ledger') IS NOT NULL AND EXISTS (
           SELECT 1
           FROM ghic_ledger l
           JOIN ghic_github_repositories r
             ON l.data->>'repo' = r.repo_full_name
           WHERE l.workspace_id IS NOT NULL
             AND l.workspace_id IS DISTINCT FROM r.workspace_id
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: ledger repository workspace mismatch';
         END IF;
         IF to_regclass('public.ghic_ledger') IS NOT NULL AND EXISTS (
           SELECT 1
           FROM ghic_ledger l
           JOIN ghic_github_installations i
             ON l.data->>'installation_id' = i.installation_id::text
           WHERE l.workspace_id IS NOT NULL
             AND l.workspace_id IS DISTINCT FROM i.workspace_id
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: ledger installation workspace mismatch';
         END IF;
         IF to_regclass('public.ghic_ledger') IS NOT NULL AND EXISTS (
           SELECT 1
           FROM ghic_ledger l
           JOIN ghic_github_repositories r
             ON l.data->>'repo' = r.repo_full_name
             OR l.data->>'installation_id' = r.installation_id::text
           WHERE l.workspace_id IS NULL
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: mappable ledger event is unassigned';
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_org_settings o
           LEFT JOIN ghic_workspaces w ON w.id = o.workspace_id
           WHERE o.workspace_id IS NULL OR w.id IS NULL
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: invalid organization settings workspace';
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_workspace_settings s
           LEFT JOIN ghic_workspaces w ON w.id = s.workspace_id
           WHERE w.id IS NULL
         ) THEN
           RAISE EXCEPTION 'tenancy migration validation failed: invalid workspace settings';
         END IF;
       END
     $$`,
    q`INSERT INTO ghic_schema_migrations (version)
       SELECT ${VERSION}
       WHERE NOT EXISTS (
         SELECT 1 FROM ghic_schema_migrations WHERE version = ${VERSION}
       )`,
    q`DO $$
       BEGIN
         IF EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = 3) THEN
           RETURN;
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_github_installations i
           LEFT JOIN ghic_workspaces w ON w.id = i.workspace_id
           WHERE i.workspace_id IS NULL OR w.id IS NULL
         ) THEN
           RAISE EXCEPTION 'ownership migration validation failed: installation workspace';
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_github_repositories r
           LEFT JOIN ghic_workspaces w ON w.id = r.workspace_id
           LEFT JOIN ghic_github_installations i ON i.installation_id = r.installation_id
           WHERE r.workspace_id IS NULL
              OR w.id IS NULL
              OR i.installation_id IS NULL
              OR i.workspace_id IS DISTINCT FROM r.workspace_id
         ) THEN
           RAISE EXCEPTION 'ownership migration validation failed: repository workspace';
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_github_installation_intents x
           LEFT JOIN ghic_workspaces w ON w.id = x.workspace_id
           WHERE x.workspace_id IS NULL OR w.id IS NULL
         ) THEN
           RAISE EXCEPTION 'ownership migration validation failed: installation intent workspace';
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_github_installations
           GROUP BY workspace_id, installation_id
           HAVING count(*) > 1
         ) THEN
           RAISE EXCEPTION 'ownership migration validation failed: duplicate installation ownership';
         END IF;
         IF EXISTS (
           SELECT 1
           FROM ghic_github_repositories
           GROUP BY workspace_id, repo_full_name
           HAVING count(*) > 1
         ) THEN
           RAISE EXCEPTION 'ownership migration validation failed: duplicate repository ownership';
         END IF;
         -- Same correction as the matching v2 checks, for the same reason:
         -- an indexed repository need not be a connected repository, and an
         -- unmatched LEFT JOIN row must not trip the mismatch arm via
         -- NULL IS DISTINCT FROM. Measured against production, the shipped
         -- form rejected 1 state row and 1891 chunk rows.
         IF to_regclass('public.ghic_repository_state') IS NOT NULL AND EXISTS (
           SELECT 1
           FROM ghic_repository_state s
           LEFT JOIN ghic_github_repositories r ON r.repo_full_name = s.repo
           WHERE s.workspace_id IS NULL
              OR (r.repo_full_name IS NOT NULL
                  AND r.workspace_id IS DISTINCT FROM s.workspace_id)
         ) THEN
           RAISE EXCEPTION 'ownership migration validation failed: repository state workspace';
         END IF;
         IF to_regclass('public.ghic_repo_chunks') IS NOT NULL AND EXISTS (
           SELECT 1
           FROM ghic_repo_chunks c
           LEFT JOIN ghic_github_repositories r ON r.repo_full_name = c.repo
           WHERE c.workspace_id IS NULL
              OR (r.repo_full_name IS NOT NULL
                  AND r.workspace_id IS DISTINCT FROM c.workspace_id)
         ) THEN
           RAISE EXCEPTION 'ownership migration validation failed: repository chunk workspace';
         END IF;
       END
     $$`,
    q`DO $$
       BEGIN
         IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_org_settings_workspace_fk') THEN
           NULL;
         ELSE
           ALTER TABLE ghic_org_settings
             ADD CONSTRAINT ghic_org_settings_workspace_fk
             FOREIGN KEY (workspace_id) REFERENCES ghic_workspaces(id);
         END IF;
         IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_installations_workspace_fk') THEN
           NULL;
         ELSE
           ALTER TABLE ghic_github_installations
             ADD CONSTRAINT ghic_installations_workspace_fk
             FOREIGN KEY (workspace_id) REFERENCES ghic_workspaces(id);
         END IF;
         IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_repositories_workspace_fk') THEN
           NULL;
         ELSE
           ALTER TABLE ghic_github_repositories
             ADD CONSTRAINT ghic_repositories_workspace_fk
             FOREIGN KEY (workspace_id) REFERENCES ghic_workspaces(id);
         END IF;
         IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_intents_workspace_fk') THEN
           NULL;
         ELSE
           ALTER TABLE ghic_github_installation_intents
             ADD CONSTRAINT ghic_intents_workspace_fk
             FOREIGN KEY (workspace_id) REFERENCES ghic_workspaces(id);
         END IF;
       END
     $$`,
    q`DO $$
       BEGIN
         IF to_regclass('public.ghic_repository_state') IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_state_workspace_fk') THEN
           ALTER TABLE ghic_repository_state
             ADD CONSTRAINT ghic_state_workspace_fk
             FOREIGN KEY (workspace_id) REFERENCES ghic_workspaces(id);
         END IF;
         IF to_regclass('public.ghic_repo_chunks') IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_chunks_workspace_fk') THEN
           ALTER TABLE ghic_repo_chunks
             ADD CONSTRAINT ghic_chunks_workspace_fk
             FOREIGN KEY (workspace_id) REFERENCES ghic_workspaces(id);
         END IF;
       END
     $$`,
    q`DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_installations_workspace_installation_key') THEN
           ALTER TABLE ghic_github_installations
             ADD CONSTRAINT ghic_installations_workspace_installation_key
             UNIQUE (workspace_id, installation_id);
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_repositories_workspace_repo_key') THEN
           ALTER TABLE ghic_github_repositories
             ADD CONSTRAINT ghic_repositories_workspace_repo_key
             UNIQUE (workspace_id, repo_full_name);
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_repositories_installation_workspace_fk') THEN
           ALTER TABLE ghic_github_repositories
             ADD CONSTRAINT ghic_repositories_installation_workspace_fk
             FOREIGN KEY (workspace_id, installation_id)
             REFERENCES ghic_github_installations (workspace_id, installation_id);
         END IF;
       END
     $$`,
    q`CREATE OR REPLACE FUNCTION ghic_prevent_installation_transfer()
       RETURNS trigger
       LANGUAGE plpgsql
       AS $$
       BEGIN
         IF OLD.installation_id IS DISTINCT FROM NEW.installation_id
            OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
           RAISE EXCEPTION 'installation ownership is immutable';
         END IF;
         RETURN NEW;
       END
       $$`,
    q`CREATE OR REPLACE FUNCTION ghic_prevent_repository_transfer()
       RETURNS trigger
       LANGUAGE plpgsql
       AS $$
       BEGIN
         IF OLD.repo_full_name IS DISTINCT FROM NEW.repo_full_name
            OR OLD.installation_id IS DISTINCT FROM NEW.installation_id
            OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
           RAISE EXCEPTION 'repository ownership is immutable';
         END IF;
         RETURN NEW;
       END
       $$`,
    q`DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_trigger
           WHERE tgname = 'ghic_installations_ownership_immutable'
             AND tgrelid = 'ghic_github_installations'::regclass
         ) THEN
           CREATE TRIGGER ghic_installations_ownership_immutable
           BEFORE UPDATE OF installation_id, workspace_id
           ON ghic_github_installations
           FOR EACH ROW EXECUTE FUNCTION ghic_prevent_installation_transfer();
         END IF;
         IF NOT EXISTS (
           SELECT 1 FROM pg_trigger
           WHERE tgname = 'ghic_repositories_ownership_immutable'
             AND tgrelid = 'ghic_github_repositories'::regclass
         ) THEN
           CREATE TRIGGER ghic_repositories_ownership_immutable
           BEFORE UPDATE OF repo_full_name, installation_id, workspace_id
           ON ghic_github_repositories
           FOR EACH ROW EXECUTE FUNCTION ghic_prevent_repository_transfer();
         END IF;
       END
     $$`,
    q`DO $$
       BEGIN
         -- NOT VALID is load-bearing, not a shortcut.
         --
         -- This constraint says "an indexed repository must be a connected
         -- repository in the same workspace." That holds for everything
         -- GHIC writes from now on, and enforcing it going forward is the
         -- tenancy rule worth having. But it is not true of rows already on
         -- disk: out-of-band indexing (python -m ghic.repo_index) creates
         -- state and chunks without any ghic_github_repositories row, and
         -- production currently holds 1891 such chunk rows against 0
         -- connected repositories. A validating constraint scans those rows
         -- and aborts the migration.
         --
         -- NOT VALID enforces the rule on every future INSERT and UPDATE
         -- while grandfathering existing rows. The alternatives were worse:
         -- fabricating ghic_github_repositories rows would make unconnected
         -- repositories report as connected and would need a fake
         -- installation to satisfy the installation FK, and deleting the
         -- orphan rows would destroy 1891 indexed chunks.
         --
         -- To promote these later, once the legacy rows are connected or
         -- retired: ALTER TABLE ... VALIDATE CONSTRAINT <name>. That takes
         -- only a SHARE UPDATE EXCLUSIVE lock and is safe online.
         IF to_regclass('public.ghic_repository_state') IS NOT NULL THEN
           IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_state_repository_workspace_fk') THEN
             ALTER TABLE ghic_repository_state
               ADD CONSTRAINT ghic_state_repository_workspace_fk
               FOREIGN KEY (workspace_id, repo)
               REFERENCES ghic_github_repositories (workspace_id, repo_full_name)
               NOT VALID;
           END IF;
         END IF;
         IF to_regclass('public.ghic_repo_chunks') IS NOT NULL THEN
           IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_chunks_repository_workspace_fk') THEN
             ALTER TABLE ghic_repo_chunks
               ADD CONSTRAINT ghic_chunks_repository_workspace_fk
               FOREIGN KEY (workspace_id, repo)
               REFERENCES ghic_github_repositories (workspace_id, repo_full_name)
               NOT VALID;
           END IF;
         END IF;
       END
     $$`,
    q`DO $$
       BEGIN
         ALTER TABLE ghic_org_settings ALTER COLUMN workspace_id SET NOT NULL;
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_installations_workspace_not_null') THEN
           ALTER TABLE ghic_github_installations ALTER COLUMN workspace_id SET NOT NULL;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_repositories_workspace_not_null') THEN
           ALTER TABLE ghic_github_repositories ALTER COLUMN workspace_id SET NOT NULL;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghic_intents_workspace_not_null') THEN
           ALTER TABLE ghic_github_installation_intents ALTER COLUMN workspace_id SET NOT NULL;
         END IF;
         IF to_regclass('public.ghic_repository_state') IS NOT NULL THEN
           ALTER TABLE ghic_repository_state ALTER COLUMN workspace_id SET NOT NULL;
         END IF;
         IF to_regclass('public.ghic_repo_chunks') IS NOT NULL THEN
           ALTER TABLE ghic_repo_chunks ALTER COLUMN workspace_id SET NOT NULL;
         END IF;
       END
     $$`,
    q`INSERT INTO ghic_schema_migrations (version)
       SELECT ${OWNERSHIP_VERSION}
       WHERE NOT EXISTS (
         SELECT 1 FROM ghic_schema_migrations WHERE version = ${OWNERSHIP_VERSION}
       )`,
    q`DO $$
       BEGIN
         -- A literal, not an interpolated constant. A tagged-template
         -- interpolation here becomes a bind parameter, but the dollar
         -- quoted body is a string literal to the parser, so the resulting
         -- placeholder inside it is inert text. The statement then declares
         -- zero parameters while the driver supplies one, and Postgres
         -- rejects the bind. Every other block here already hardcodes its
         -- version for the same reason; this one did not.
         -- A test asserts these literals stay in step with the constants.
         IF EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = 4) THEN
           RETURN;
         END IF;
         IF to_regclass('public.ghic_ledger') IS NOT NULL AND EXISTS (
           SELECT 1
           FROM ghic_ledger l
           LEFT JOIN ghic_github_repositories r
             ON l.data->>'repo' = r.repo_full_name
           LEFT JOIN ghic_github_installations i
             ON l.data->>'installation_id' = i.installation_id::text
           WHERE (r.workspace_id IS NOT NULL AND i.workspace_id IS NOT NULL
                  AND r.workspace_id IS DISTINCT FROM i.workspace_id)
              OR (l.workspace_id IS NOT NULL
                  AND COALESCE(r.workspace_id, i.workspace_id) IS NOT NULL
                  AND l.workspace_id IS DISTINCT FROM COALESCE(r.workspace_id, i.workspace_id))
              OR (l.workspace_id IS NOT NULL
                  AND r.workspace_id IS NULL AND i.workspace_id IS NULL)
              OR (l.workspace_id IS NULL
                  AND (r.workspace_id IS NOT NULL OR i.workspace_id IS NOT NULL))
         ) THEN
           RAISE EXCEPTION 'ledger ownership validation failed: workspace attribution is conflicting or incomplete';
         END IF;
       END
     $$`,
    q`INSERT INTO ghic_schema_migrations (version)
       SELECT ${LEDGER_VALIDATION_VERSION}
       WHERE NOT EXISTS (
         SELECT 1 FROM ghic_schema_migrations WHERE version = ${LEDGER_VALIDATION_VERSION}
       )`,
  ];
  await q.transaction(statements);
}

export { DEFAULT_WORKSPACE_ID };
