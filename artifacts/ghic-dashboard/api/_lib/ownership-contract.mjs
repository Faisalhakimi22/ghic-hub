export const OWNERSHIP_CONTRACT_VERSION = 7;

/** Metadata-only contract step, executed inside the migration runner's lock/transaction. */
export function ownershipContractStatements(q) {
  return [
    q`DO $$ BEGIN
         IF EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = 7)
            AND (to_regclass('public.ghic_ledger') IS NULL OR EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'ghic_ledger_workspace_fk'
                AND conrelid = to_regclass('public.ghic_ledger')
                AND contype = 'f' AND convalidated
            )) THEN
           RETURN;
         END IF;
         IF to_regclass('public.ghic_ledger') IS NOT NULL THEN
           IF EXISTS (
             SELECT 1 FROM public.ghic_ledger l
             LEFT JOIN public.ghic_workspaces w ON w.id = l.workspace_id
             WHERE l.workspace_id IS NOT NULL AND w.id IS NULL
           ) THEN
             RAISE EXCEPTION 'ownership contract failed: invalid ledger workspace';
           END IF;
           IF EXISTS (
             SELECT 1 FROM public.ghic_ledger l
             LEFT JOIN public.ghic_github_repositories r
               ON l.data->>'repo' = r.repo_full_name
             LEFT JOIN public.ghic_github_installations i
               ON l.data->>'installation_id' = i.installation_id::text
             WHERE (r.workspace_id IS NOT NULL AND i.workspace_id IS NOT NULL
                    AND r.workspace_id IS DISTINCT FROM i.workspace_id)
                OR (l.workspace_id IS NOT NULL AND r.workspace_id IS NOT NULL
                    AND l.workspace_id IS DISTINCT FROM r.workspace_id)
                OR (l.workspace_id IS NOT NULL AND i.workspace_id IS NOT NULL
                    AND l.workspace_id IS DISTINCT FROM i.workspace_id)
           ) THEN
             RAISE EXCEPTION 'ownership contract failed: conflicting ledger attribution';
           END IF;
         END IF;
       END $$`,
    // The Python-owned tables are optional on a fresh Hub database. These
    // catalog-guarded steps also cover a table created after v7 was recorded.
    // VALIDATE scans existing rows; it never repairs, reassigns, or deletes them.
    q`DO $$ BEGIN
         IF to_regclass('public.ghic_ledger') IS NOT NULL THEN
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint
             WHERE conname = 'ghic_ledger_workspace_fk'
               AND conrelid = 'public.ghic_ledger'::regclass
           ) THEN
             ALTER TABLE public.ghic_ledger
               ADD CONSTRAINT ghic_ledger_workspace_fk
               FOREIGN KEY (workspace_id) REFERENCES public.ghic_workspaces(id)
               NOT VALID;
           END IF;
           IF EXISTS (
             SELECT 1 FROM pg_constraint
             WHERE conname = 'ghic_ledger_workspace_fk'
               AND conrelid = 'public.ghic_ledger'::regclass AND NOT convalidated
           ) THEN
             ALTER TABLE public.ghic_ledger VALIDATE CONSTRAINT ghic_ledger_workspace_fk;
           END IF;
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint
             WHERE conname = 'ghic_ledger_workspace_fk'
               AND conrelid = 'public.ghic_ledger'::regclass
               AND confrelid = 'public.ghic_workspaces'::regclass
               AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                 WHERE attrelid = 'public.ghic_ledger'::regclass AND attname = 'workspace_id')]
               AND confkey = ARRAY[(SELECT attnum FROM pg_attribute
                 WHERE attrelid = 'public.ghic_workspaces'::regclass AND attname = 'id')]
               AND contype = 'f' AND convalidated
           ) THEN
             RAISE EXCEPTION 'ownership contract failed: ledger constraint missing or invalid';
           END IF;
         END IF;
         IF to_regclass('public.ghic_repository_state') IS NOT NULL THEN
           IF EXISTS (
             SELECT 1 FROM pg_constraint
             WHERE conname = 'ghic_state_repository_workspace_fk'
               AND conrelid = 'public.ghic_repository_state'::regclass AND NOT convalidated
           ) THEN
             ALTER TABLE public.ghic_repository_state
               VALIDATE CONSTRAINT ghic_state_repository_workspace_fk;
           END IF;
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint
             WHERE conname = 'ghic_state_repository_workspace_fk'
               AND conrelid = 'public.ghic_repository_state'::regclass
               AND confrelid = 'public.ghic_github_repositories'::regclass
               AND conkey = ARRAY[
                 (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.ghic_repository_state'::regclass AND attname = 'workspace_id'),
                 (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.ghic_repository_state'::regclass AND attname = 'repo')]
               AND confkey = ARRAY[
                 (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.ghic_github_repositories'::regclass AND attname = 'workspace_id'),
                 (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.ghic_github_repositories'::regclass AND attname = 'repo_full_name')]
               AND contype = 'f' AND convalidated
           ) THEN
             RAISE EXCEPTION 'ownership contract failed: state constraint missing or invalid';
           END IF;
         END IF;
         IF to_regclass('public.ghic_repo_chunks') IS NOT NULL THEN
           IF EXISTS (
             SELECT 1 FROM pg_constraint
             WHERE conname = 'ghic_chunks_repository_workspace_fk'
               AND conrelid = 'public.ghic_repo_chunks'::regclass AND NOT convalidated
           ) THEN
             ALTER TABLE public.ghic_repo_chunks
               VALIDATE CONSTRAINT ghic_chunks_repository_workspace_fk;
           END IF;
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint
             WHERE conname = 'ghic_chunks_repository_workspace_fk'
               AND conrelid = 'public.ghic_repo_chunks'::regclass
               AND confrelid = 'public.ghic_github_repositories'::regclass
               AND conkey = ARRAY[
                 (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.ghic_repo_chunks'::regclass AND attname = 'workspace_id'),
                 (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.ghic_repo_chunks'::regclass AND attname = 'repo')]
               AND confkey = ARRAY[
                 (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.ghic_github_repositories'::regclass AND attname = 'workspace_id'),
                 (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.ghic_github_repositories'::regclass AND attname = 'repo_full_name')]
               AND contype = 'f' AND convalidated
           ) THEN
             RAISE EXCEPTION 'ownership contract failed: chunk constraint missing or invalid';
           END IF;
         END IF;
       END $$`,
    q`INSERT INTO ghic_schema_migrations (version)
       SELECT ${OWNERSHIP_CONTRACT_VERSION}
       WHERE NOT EXISTS (
         SELECT 1 FROM ghic_schema_migrations WHERE version = ${OWNERSHIP_CONTRACT_VERSION}
       )`,
  ];
}
