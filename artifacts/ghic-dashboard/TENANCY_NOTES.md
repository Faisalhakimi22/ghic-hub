# Tenancy notes

Operational facts about the Phase 4 multi-workspace migration that are not
recoverable from the schema alone. Written 2026-08-22, immediately after
migrations v2/v3/v4 were applied to production.

## The 33 unattributed ledger rows

`ghic_ledger` holds 33 rows with `workspace_id IS NULL`. This is intentional.
They are not a backfill that failed.

**What they are.** Dev and verification traffic from 2026-08-05 to 2026-08-08,
across five repositories (`Faisalhakimi22/github-issue-classifier`,
`Faisalhakimi22/Famble`, `Faisalhakimi22/Market-Intelligence-Platform`,
`Faisalhakimi22/University-Timetable-System`, and `test/verification-only`),
every one with `installation_id: null`. No customer data.

**Why they were not attributed.** Migration v2 assigns `ghic_ledger.workspace_id`
only where the row joins to a connected repository or a known installation
(`migrations.mjs:144`). At migration time production held zero rows in both
`ghic_github_repositories` and `ghic_github_installations`, so there was
nothing to attribute them from. Unlike `ghic_repo_chunks` and
`ghic_repository_state`, the ledger has no default-workspace sweep, and
`workspace_id` is deliberately left nullable — the `SET NOT NULL` statements in
v3 cover every workspace-scoped table *except* this one.

**Why leaving them NULL is the safe choice.** NULL means "owned by nobody" and
is fail-closed under every read path in the product. Sweeping them into
`ghic-default-workspace` would fabricate ownership and surface three-day-old
test noise — including `test/verification-only` — in a real tenant's analytics.

**Why they cannot leak.** Verified 2026-08-22:

- All 11 `ghic_ledger` read sites in `api/_lib/product-data.mjs` filter
  `workspace_id = $n`. A NULL row matches no equality predicate, so it is
  invisible to every dashboard, analytics, search and history surface.
- No `workspace_id IS NULL` predicate exists anywhere outside `migrations.mjs`.
- The backend's `/stats` (`ghic/service/app.py:295`) is token-gated and returns
  process-level data only — latency percentiles, a 5xx count, `dry_run`,
  `scope`. It carries no ledger data at all.
- `PgLedger.replay()` (`ghic/service/pg_ledger.py:74`) *is* unfiltered, but it
  only warm-starts `PredictionTracker`'s in-memory counters. Nothing reads
  those counters outside `tracking.py` and nothing serialises them into a
  response.
- New ledger rows take `workspace_id` from the event being handled, never from
  mutable process state (`ghic/service/tracking.py:118`).

**Why they cannot become attributed by accident.** The only statement that ever
writes `ghic_ledger.workspace_id` is in migration v2, behind
`IF EXISTS (SELECT 1 FROM ghic_schema_migrations WHERE version = 2) THEN RETURN`.
That guard is now permanently satisfied, so the block cannot run again — not on
a Hub cold start, not on a re-run of `scripts/migrate.mjs`. Connecting
`Faisalhakimi22/github-issue-classifier` later will not retroactively claim
them.

**Before adding usage limits (Phase 5).** Per-workspace quotas must not be
computed from `PgLedger.replay()`. It reads every row regardless of workspace,
so counting off it would total usage across all tenants at once. Quota queries
belong on the `workspace_id = $n` path.

## The two NOT VALID foreign keys

`ghic_chunks_repository_workspace_fk` and `ghic_state_repository_workspace_fk`
reference `ghic_github_repositories (workspace_id, repo_full_name)` and are
deliberately `NOT VALID`.

GHIC indexes repositories out of band — the Vercel Python runtime has no git —
so `ghic_repo_chunks` and `ghic_repository_state` routinely hold rows for
repositories that were never registered in `ghic_github_repositories`.
Production carried 1891 such chunk rows and 1 state row, all for
`Faisalhakimi22/github-issue-classifier`. A validated constraint would have
aborted the migration.

`NOT VALID` means Postgres skipped the one-time scan of existing rows but
**still enforces the constraint on every INSERT and UPDATE**. New writes are
protected; only the pre-existing rows are unchecked.

Once that repository is connected through the GitHub App, the references
resolve and the constraints can be promoted without touching data:

```sql
ALTER TABLE ghic_repo_chunks VALIDATE CONSTRAINT ghic_chunks_repository_workspace_fk;
ALTER TABLE ghic_repository_state VALIDATE CONSTRAINT ghic_state_repository_workspace_fk;
```

`VALIDATE CONSTRAINT` takes only a `SHARE UPDATE EXCLUSIVE` lock, so it does not
block reads or writes. Do not force validation before the repository exists,
and do not delete chunk rows to make the constraints validate — the embeddings
they hold cost real money to regenerate.

Enforcement was verified against production on 2026-08-22 by attempting four
writes inside a transaction that was rolled back. All four were rejected with
SQLSTATE 23503, on both tables, for both a missing repository and a missing
workspace.

**Consequence: connect before you index.** The composite key requires
`(workspace_id, repo)` to already exist in `ghic_github_repositories`. That
table is currently empty, so no new chunk or state row can be written for any
repository until one is connected through the GitHub App. This is harmless
while automatic indexing stays disabled, but it fixes the order of operations:
connect the repository first, index second.

## Embedding integrity baseline

Post-migration, all 1891 embeddings fold to:

```
count = 1891
md5(string_agg(md5(id || ':' || embedding), '' ORDER BY ...)) = ebbc6c7baf57f07393522ab012464c91
```

The preflight records this as `vectors.full_column_checksum`. Compare it across
any future migration.

A true before/after diff was not available for *this* migration: the
pre-migration run predates the checksum and sampled only ten rows ordered by a
non-unique key, and `xmin` cannot distinguish the columns because v2
legitimately rewrote every tuple to set `workspace_id`. It is moot. An UPDATE
that never names `embedding` cannot change `embedding` — the value is copied
verbatim into the rewritten tuple — and `migrations.mjs` contains zero
references to that column. Corroborating measurements taken 2026-08-22: 1891
rows, all created 2026-08-08 10:00:06Z in one indexing batch, **zero rows
written at or after the migration commit**, zero NULL embeddings, zero rows
with dimensions other than 1536, and the ten sampled hashes identical as a set
before and after.

## Workspace ownership

Ownership was corrected on 2026-08-22. `db.mjs:218` grants `owner` to the first
account that signs in, which made the earliest-registered user the owner of the
production workspace by accident of signup order. The transfer used
`updateUserRole()` — the same function the `PATCH /api/organization/members/:uid`
route calls — so the "never zero owners" invariant held throughout. Only
`ghic_workspace_members.role` was written; `getUser()` overrides `role` with
`workspace_role`, making the members table authoritative and the legacy
`ghic_users.role` column shadowed wherever it is read.
