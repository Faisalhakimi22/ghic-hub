/**
 * Applying a paid plan to a workspace.
 *
 * Deliberately knows nothing about Stripe. A payment provider decides that
 * money changed hands; this module decides what that means for a workspace,
 * and those are different questions. `stripe.mjs` translates one into the
 * other, and a second provider would add a second translator rather than a
 * second copy of the rules below.
 *
 * The rules:
 *
 * 1. A provider event is applied at most once. `ghic_billing_events.event_id`
 *    is a primary key, so a redelivery is a no-op in the schema rather than a
 *    matter of application care. Stripe retries any non-2xx for days; without
 *    this, a slow response would buy a customer a second month.
 *
 * 2. `ghic_workspaces.plan` stays the one thing limit readers consult. This
 *    module moves that column and records why; nothing downstream has to
 *    learn what a subscription is.
 *
 * 3. A downgrade never takes away what a workspace already has. Repository
 *    grandfathering lives in `partitionRepositories`, and the same reasoning
 *    applies here: a limit introduced after the fact governs the next
 *    connection, not the last one.
 */
import { database } from "./db.mjs";

/** Where a workspace lands when a subscription ends. */
export const DEFAULT_PLAN = "starter";

function billingError(message, status = 500, code = "billing_error", cause = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

async function connect(deps) {
  return deps?.database ? await deps.database() : await database();
}

/**
 * Move a workspace onto a plan, once, and record why.
 *
 * Returns `{ applied, reason, fromPlan, toPlan }`. `applied: false` is a
 * normal outcome, not a failure -- it is what a duplicate delivery looks
 * like, and the caller answers 2xx to it so the provider stops retrying.
 *
 * The whole change is a single statement. The Neon HTTP driver sends each
 * query as its own round trip, so a read-then-write pair would leave a
 * window in which two concurrent deliveries both see the old plan. Expressed
 * as one statement, the event insert is the gate: whichever delivery wins
 * the primary key is the one that moves the plan, and the loser changes
 * nothing.
 */
export async function applyPlanChange(
  {
    workspaceId,
    plan,
    eventId,
    type,
    provider = "stripe",
    customerId = null,
    subscriptionId = null,
    status = "active",
    currentPeriodEnd = null,
    cancelAtPeriodEnd = false,
    summary = null,
  },
  deps = null,
) {
  const workspace = String(workspaceId || "").trim();
  const target = String(plan || "").trim();
  const event = String(eventId || "").trim();
  if (!workspace) throw billingError("A workspace is required.", 400, "workspace_required");
  if (!target) throw billingError("A plan is required.", 400, "plan_required");
  if (!event) throw billingError("A provider event id is required.", 400, "event_required");

  const q = await connect(deps);
  let rows;
  try {
    rows = await q`
      WITH cur AS (
        SELECT plan FROM ghic_workspaces WHERE id = ${workspace}
      ),
      ev AS (
        INSERT INTO ghic_billing_events
          (event_id, provider, type, workspace_id, from_plan, to_plan, payload_summary)
        SELECT ${event}, ${provider}, ${String(type || "unknown")}, ${workspace},
               cur.plan, ${target}, ${summary}
        FROM cur
        ON CONFLICT (event_id) DO NOTHING
        RETURNING 1 AS ok
      ),
      sub AS (
        INSERT INTO ghic_billing_subscriptions
          (workspace_id, provider, customer_id, subscription_id, plan, status,
           current_period_end, cancel_at_period_end)
        SELECT ${workspace}, ${provider}, ${customerId}, ${subscriptionId}, ${target},
               ${status}, ${currentPeriodEnd}, ${Boolean(cancelAtPeriodEnd)}
        FROM ev
        ON CONFLICT (workspace_id) DO UPDATE SET
          provider = EXCLUDED.provider,
          customer_id = COALESCE(EXCLUDED.customer_id, ghic_billing_subscriptions.customer_id),
          subscription_id = COALESCE(EXCLUDED.subscription_id, ghic_billing_subscriptions.subscription_id),
          plan = EXCLUDED.plan,
          status = EXCLUDED.status,
          current_period_end = EXCLUDED.current_period_end,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          updated_at = now()
        RETURNING 1
      ),
      moved AS (
        UPDATE ghic_workspaces
        SET plan = ${target}, updated_at = now()
        WHERE id = ${workspace} AND EXISTS (SELECT 1 FROM ev)
        RETURNING 1
      )
      SELECT (SELECT count(*) FROM ev)::int AS applied,
             (SELECT count(*) FROM cur)::int AS found,
             (SELECT plan FROM cur) AS from_plan`;
  } catch (error) {
    // A plan that is not in ghic_plans trips the foreign key. That is a
    // configuration mistake -- a price mapped to a plan that was never
    // seeded -- and it must not silently leave the workspace where it was
    // while the provider is told everything is fine.
    throw billingError(
      "The plan change could not be applied.",
      500,
      "plan_change_failed",
      error,
    );
  }

  const row = rows?.[0] || {};
  if (!Number(row.found)) {
    return { applied: false, reason: "unknown_workspace", fromPlan: null, toPlan: target };
  }
  if (!Number(row.applied)) {
    return { applied: false, reason: "duplicate_event", fromPlan: row.from_plan ?? null, toPlan: target };
  }
  return { applied: true, reason: "applied", fromPlan: row.from_plan ?? null, toPlan: target };
}

/**
 * What a workspace is currently paying for.
 *
 * A workspace with no row has never subscribed, which is not an error --
 * every workspace starts on the free plan and most stay there.
 */
export async function subscriptionForWorkspace(workspaceId, deps = null) {
  const id = String(workspaceId || "").trim();
  if (!id) throw billingError("A workspace is required.", 400, "workspace_required");
  const q = await connect(deps);
  let rows;
  try {
    rows = await q`
      SELECT w.plan AS workspace_plan,
             s.provider, s.customer_id, s.subscription_id, s.plan AS subscription_plan,
             s.status, s.current_period_end, s.cancel_at_period_end
      FROM ghic_workspaces w
      LEFT JOIN ghic_billing_subscriptions s ON s.workspace_id = w.id
      WHERE w.id = ${id}`;
  } catch (error) {
    throw billingError("Billing state could not be read.", 503, "billing_unavailable", error);
  }
  const row = rows?.[0];
  if (!row) throw billingError("Workspace not found.", 404, "workspace_not_found");

  return {
    // The workspace plan is what is actually enforced. It leads, and the
    // subscription explains it -- never the other way round, so a stale
    // subscription row can never imply an entitlement nothing grants.
    plan: row.workspace_plan,
    subscribed: Boolean(row.subscription_id),
    provider: row.provider || null,
    status: row.status || null,
    currentPeriodEnd: row.current_period_end || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    customerId: row.customer_id || null,
  };
}

/** Recent plan changes for a workspace, newest first. */
export async function billingHistory(workspaceId, limit = 20, deps = null) {
  const id = String(workspaceId || "").trim();
  if (!id) throw billingError("A workspace is required.", 400, "workspace_required");
  const size = Math.min(100, Math.max(1, Number(limit) || 20));
  const q = await connect(deps);
  try {
    const rows = await q`
      SELECT event_id, type, from_plan, to_plan, received_at
      FROM ghic_billing_events
      WHERE workspace_id = ${id}
      ORDER BY received_at DESC
      LIMIT ${size}`;
    return rows.map((row) => ({
      eventId: row.event_id,
      type: row.type,
      fromPlan: row.from_plan,
      toPlan: row.to_plan,
      receivedAt: row.received_at,
    }));
  } catch (error) {
    throw billingError("Billing history could not be read.", 503, "billing_unavailable", error);
  }
}
