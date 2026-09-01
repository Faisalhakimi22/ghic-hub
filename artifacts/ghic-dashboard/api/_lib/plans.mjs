/**
 * Plan limits, read from the database rather than declared here.
 *
 * Two services enforce these numbers: this one refuses a repository
 * connection, and the Python backend refuses an issue analysis. Writing the
 * limits twice in two languages is how they drift, and the drift shows up as
 * a customer charged for one thing and served another. ghic_plans is the one
 * place they live; both services read it.
 */
import { database } from "./db.mjs";

/**
 * What a deployment does when the plan tables are not there yet.
 *
 * Fail open, deliberately. A quota is a commercial limit, not a security
 * boundary: refusing every connection because a migration has not run turns a
 * billing feature into an outage, and the failure is on our side rather than
 * the customer's. The authorization checks that *are* security -- workspace
 * membership, installation ownership -- keep failing closed as they always
 * have, and none of them run through here.
 */
const UNLIMITED = Object.freeze({
  plan: "unknown",
  maxRepositories: null,
  maxIssuesPerPeriod: null,
  period: "month",
  enforced: false,
});

function shape(row) {
  return {
    plan: row.plan,
    // NULL means unlimited, not zero. Number(null) is 0, which would block
    // everything on the most expensive plan, so the null has to survive the
    // conversion rather than be coerced through it.
    maxRepositories:
      row.max_repositories == null ? null : Number(row.max_repositories),
    maxIssuesPerPeriod:
      row.max_issues_per_period == null ? null : Number(row.max_issues_per_period),
    period: row.period || "month",
    enforced: true,
  };
}

/** The plan a workspace is on, with its limits. */
export async function planForWorkspace(workspaceId, deps = null) {
  const id = String(workspaceId || "").trim();
  if (!id) return UNLIMITED;
  const q = deps?.database ? await deps.database() : await database();
  try {
    const rows = await q`
      SELECT p.plan, p.max_repositories, p.max_issues_per_period, p.period
      FROM ghic_workspaces w
      JOIN ghic_plans p ON p.plan = w.plan
      WHERE w.id = ${id}`;
    if (!rows.length) return UNLIMITED;
    return shape(rows[0]);
  } catch (error) {
    // 42P01: the plan tables do not exist yet.
    if (error?.code === "42P01") return UNLIMITED;
    throw error;
  }
}

/**
 * The billing period an instant falls in, as a sortable string.
 *
 * UTC, always, and computed the same way as the Python backend's
 * `usage.period_key`. A calendar month that starts at the customer's local
 * midnight is a month whose boundary moves with a timezone database, and
 * both services would have to agree on which one.
 */
export function periodKey(period = "month", now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  if (period === "day") {
    return `${year}-${month}-${String(now.getUTCDate()).padStart(2, "0")}`;
  }
  return `${year}-${month}`;
}

/**
 * What a workspace has used this period, for the dashboard.
 *
 * Read-only and best-effort. This feeds a panel; a panel that cannot render
 * is not a reason to fail the request that would have rendered it.
 *
 * The counts come from `ghic_usage_events`, which the Python backend writes.
 * This service never writes a `counted` row -- that happens under the
 * backend's per-workspace advisory lock, and a second writer outside it
 * would be a second place that can sell the same slot.
 */
export async function usageForWorkspace(workspaceId, deps = null, now = new Date()) {
  const id = String(workspaceId || "").trim();
  const plan = await planForWorkspace(id, deps);
  const period = periodKey(plan.period, now);
  const empty = {
    plan: plan.plan,
    period,
    enforced: plan.enforced,
    issues: { used: 0, limit: plan.maxIssuesPerPeriod, remaining: null },
    repositories: { used: 0, limit: plan.maxRepositories, remaining: null },
    outcomes: {},
  };
  if (!id) return empty;

  const q = deps?.database ? await deps.database() : await database();
  try {
    const [usageRows, repoRows] = await Promise.all([
      q`SELECT outcome, count(*)::int AS n FROM ghic_usage_events
         WHERE workspace_id = ${id} AND period = ${period}
         GROUP BY outcome`,
      q`SELECT count(*)::int AS n FROM ghic_github_repositories
         WHERE workspace_id = ${id} AND active = true`,
    ]);
    const outcomes = {};
    for (const row of usageRows) outcomes[String(row.outcome)] = Number(row.n);
    const issuesUsed = outcomes.counted || 0;
    const reposUsed = Number(repoRows[0]?.n || 0);
    return {
      plan: plan.plan,
      period,
      enforced: plan.enforced,
      issues: {
        used: issuesUsed,
        limit: plan.maxIssuesPerPeriod,
        // null stays null: unlimited has no remainder to report, and a 0
        // here would read as "none left" on exactly the plan that has most.
        remaining:
          plan.maxIssuesPerPeriod == null
            ? null
            : Math.max(0, plan.maxIssuesPerPeriod - issuesUsed),
      },
      repositories: {
        used: reposUsed,
        limit: plan.maxRepositories,
        remaining:
          plan.maxRepositories == null
            ? null
            : Math.max(0, plan.maxRepositories - reposUsed),
      },
      outcomes,
    };
  } catch (error) {
    if (error?.code === "42P01") return empty;
    throw error;
  }
}

/**
 * Decide which repositories a workspace may have connected.
 *
 * Already-connected repositories are always allowed, whatever the limit says.
 * A limit introduced after the fact must not silently switch off work someone
 * already did -- it governs the next connection, not the last one. So the
 * question asked of each incoming repository is "is this new?" before "would
 * this exceed?".
 *
 * Over-limit new repositories are refused individually rather than failing the
 * whole sync. GitHub has already granted access by this point; rejecting
 * everything would leave GHIC's record disagreeing with GitHub's, which is the
 * state the sync exists to prevent.
 */
export function partitionRepositories(incomingNames, connectedNames, maxRepositories) {
  const connected = new Set(connectedNames);
  const incoming = [...new Set(incomingNames.filter(Boolean))];

  if (maxRepositories == null) {
    return { allowed: incoming, refused: [], limit: null };
  }

  const grandfathered = incoming.filter((name) => connected.has(name));
  // Deterministic order, so the same selection always yields the same
  // decision rather than depending on however GitHub happened to list them.
  const fresh = incoming.filter((name) => !connected.has(name)).sort();

  const capacity = Math.max(0, maxRepositories - connected.size);
  return {
    allowed: [...grandfathered, ...fresh.slice(0, capacity)],
    refused: fresh.slice(capacity),
    limit: maxRepositories,
  };
}
