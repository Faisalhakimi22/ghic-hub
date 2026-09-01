# Plan limits

Advertised on the marketing site, enforced here.

| Plan | Repositories | Issues | Period |
|---|---|---|---|
| starter | 1 | 500 | calendar month, UTC |
| pro | 10 | 10,000 | calendar month, UTC |
| enterprise | unlimited | unlimited | — |

## Where the numbers live

`ghic_plans`, in the database. Not in either service.

Two services enforce them: this one refuses a repository connection, and the
Python backend refuses an issue analysis. The same limits written twice in two
languages drift, and the direction they drift in is a customer charged for one
thing and served another.

`NULL` means unlimited, not zero. `Number(null)` is `0`, and that single
coercion would turn the most expensive plan into the most restrictive one, so
the distinction has to survive into every reader. There is a test for it.

## Where the repository limit is enforced

**`completeGitHubInstallation`.** That is the only path that writes a
repository row for a connection.

**`syncInstallationRepositories` is dead code and must not be treated as an
enforcement path.** Nothing calls it. A limit placed there compiles, reviews
cleanly, and never runs — which is what happened on the first attempt at this
feature. Before adding any rule to it, run
`git grep syncInstallationRepositories` and confirm it has acquired a caller.

The Python backend performs the equivalent reconciliation for
`installation_repositories` webhooks in `ghic/service/github_connection.py`.
Any repository rule has to exist in both places or it is not enforced.

## Grandfathering

The question asked of each incoming repository is "is this already connected?"
before "would this exceed the limit?". A limit introduced after the fact
governs the next connection, not the last one — it must not silently switch
off work somebody already did.

So a workspace sitting above its limit keeps everything it has and cannot add
more. Refusals are per-repository and returned, not thrown: GitHub has already
granted access by that point, and failing the whole connection would leave
GHIC's record disagreeing with GitHub's, which is the state the connection
flow exists to prevent.

## Where the issue limit is enforced

**`_process_issue_job`, in the Python backend.** Above the enrichment calls,
above the model, above retrieval, above the LLM. A gate placed after any of
those is a gate that still pays the bill it exists to stop.

The quota is spent *before* the work, not after. Checking first and
recording afterwards leaves a window in which two concurrent deliveries both
see 499 of 500 used and both proceed, and leaves a crash between the work
and the record as a free analysis. So an analysis reserves its slot and
hands it back if the work fails — `usage.release()`, which mirrors the
idempotency store's `release()` for the same reason: something was marked
done before it was done.

The reservation is serialized by `pg_advisory_xact_lock` on
`(workspace, period)`. Without it, READ COMMITTED lets two transactions each
read a count that does not yet include the other's uncommitted row, and a
plan with one slot left sells it twice.

Two things are deliberately *not* charged:

- **A re-score after an issue edit.** The customer paid for that issue when
  it was opened. A month boundary falling between the open and the edit must
  not bill it twice. An exhausted workspace still skips the re-score — free
  model runs are not the alternative.
- **A refused or failed analysis.** `limited` and `failed` are audit rows.

When a workspace runs out, GHIC comments on the issue **once per period**,
not on every issue. A workspace that exhausts its plan on the first of the
month would otherwise get a bot comment on every issue for the rest of it,
which is the behaviour that gets an App uninstalled.

## How usage is counted

`ghic_usage_events`, one row per analysis attempt, with `outcome` in
`counted` / `failed` / `skipped` / `limited`. Keeping the four apart is what
makes "why was I charged" and "why was I not analysed" answerable from the
same table.

Only `counted` consumes quota. An analysis that errored is not something to
bill for.

Double-billing is prevented by the schema rather than by application care:

```sql
CREATE UNIQUE INDEX ghic_usage_counted_once_idx
  ON ghic_usage_events (workspace_id, period, repo, issue_number)
  WHERE outcome = 'counted'
```

A redelivered webhook or a re-analysis after an issue edit cannot bill twice
however the caller behaves. Non-counted attempts are audit rows and are
deliberately unconstrained.

## Failure behaviour

`planForWorkspace` fails **open** when the plan tables are absent, returning
unlimited. A quota is a commercial limit, not a security boundary: refusing
every connection because a migration has not run turns billing into an outage,
and the fault would be ours rather than the customer's.

The checks that *are* security — workspace membership, installation ownership,
the authorization gate — keep failing closed, and none of them run through
here.

## What the browser is told

`GET /api/usage` reports the workspace's own plan, period, and counts. It is
a report, not a gate: nothing in the browser decides whether a limit was
reached, and both enforcement points are server-side. The route reads the
viewer's workspace from their verified session and never from the request,
because a usage panel is a bill.

## Applied to production

Migration v5, applied deliberately through `scripts/migrate.mjs` on
2026-08-23 rather than via the implicit `ready()` cold-start path, with a
read-only snapshot either side. Verified: every pre-existing table's row count
and content fingerprint unchanged, two tables added, no table or trigger
removed, constraints 30 → 35, and a second run recording no change.
