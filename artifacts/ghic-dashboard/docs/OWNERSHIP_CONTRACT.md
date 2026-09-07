# Ownership contract migration v7

## Purpose and scope

The 2026-09-05 user-identified production read-only baseline reported migration
versions 2, 3, 4 and 5, two unvalidated repository foreign keys, and no ledger
workspace foreign key. It also reported zero repository states and zero chunks.
This is not evidence that the previously reported 1,891 vectors still exist.
Investigate that discrepancy separately; this migration does not recover or
re-index anything.

Migration v3 remains unchanged. Its NOT VALID composite foreign keys enforced
new writes while retaining historical out-of-band index rows. Version 7 is the
explicit contract step: it now requires all existing state/chunk rows to have
the correct registered repository and workspace. An orphan aborts the migration;
it is never removed, assigned to another tenant, or repaired automatically.

## Exact pending changes

The existing migration runner runs all statements in one transaction and takes
its PostgreSQL advisory transaction lock before checking migration versions.
For a database with versions 2 through 5 already recorded:

1. Existing catalog-guarded bootstrap statements still execute. This is not a
   read-only operation and is not a separate migration-only command interface.
2. Pending v6 changes Starter to one repository and 50 analyzed issues per UTC
   day. No other existing plan is updated by v6.
3. V7 rejects unknown non-NULL ledger workspace references and disagreements
   between ledger attribution, canonical repository ownership, and installation
   ownership. It does not overwrite ledger data. Unmappable NULL events remain
   NULL and stay excluded from tenant views.
4. Add and validate `ghic_ledger_workspace_fk`, retaining nullable workspace_id.
5. Validate `ghic_state_repository_workspace_fk` and
   `ghic_chunks_repository_workspace_fk`. Check the actual parent relation and
   ordered column keys, not just each constraint's name.
6. Record v7 only after all checks succeed. If anything fails, v6/v7 changes and
   their version records roll back together.

There is no vector UPDATE, DELETE, TRUNCATE, embedding call, repository clone,
or indexing invocation in v7. Existing vector values, embedding metadata and
state JSON (including indexed SHA) are not rewritten. Existing PKs, ownership
triggers, and lifecycle behavior are retained.

## Reruns and late-created tables

The Python-owned state, chunk and ledger tables may not exist in a fresh Hub
database. Catalog-guarded checks run again on subsequent bootstraps so such
tables receive validated constraints after they are created, even if v7 is
already recorded. A newly discovered ledger also receives attribution validation.
Already validated constraints are not repeatedly scanned. Version records do
not duplicate and no historical attribution is guessed.

The ledger FK proves that a workspace exists, not that every future JSON event
is correctly attributed. Explicit request/event-scoped ledger attribution and
workspace-scoped reads remain required application security boundaries.

## Verification and limits

`node --test api/_lib/ownership-contract.test.mjs` executes the actual migration
runner and PostgreSQL constraint validation inside disposable PGlite databases
with pgvector. Tests use a synthetic numeric vector fixture, never an embedding
provider or production data. They cover conflicts, orphans, transaction rollback,
retry, rerun, late-created tables, immutable ownership, invalid writes, vector
hashes/type, and indexed SHA preservation.

PGlite is PostgreSQL 18.3; the observed production database is PostgreSQL 17.11.
This does not prove live driver behavior, multi-session advisory lock contention,
production lock duration, or live application behavior. It is not a backup.

## Production gate

No production migration or deployment is authorized by these tests. Do not
deploy the Hub first: `db.mjs` runs pending migrations on cold start. Before
execution, obtain explicit approval of the v6/v7 changes, confirm the intended
database against the authenticated deployment, establish a recovery point, and
refresh the sanitized read-only baseline. Confirm zero ownership conflicts and
orphans, and resolve the unexpected absence of the repository index.

After approved execution through the existing runner, inspect live constraint
definitions/validation and nullability; compare row counts, vector hashes and
state JSON/SHAs before and after; rerun for idempotency; then perform authenticated
workspace-isolation and application smoke tests without GitHub writes or indexing.
Stop on a mismatch or error. Do not retry blindly or repair production rows.
