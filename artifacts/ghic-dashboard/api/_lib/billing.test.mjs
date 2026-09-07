import assert from "node:assert/strict";
import test from "node:test";

import { applyPlanChange, billingHistory, subscriptionForWorkspace } from "./billing.mjs";

/**
 * A database that enforces the constraints the real schema enforces.
 *
 * The point of this fake is the `events` map keyed by event id. That key is
 * a primary key in Postgres, and it is the only thing standing between a
 * Stripe redelivery and a customer being moved twice. A fake that accepted
 * every insert would let that bug through, so this one refuses the same
 * insert the schema refuses.
 *
 * The plan change is a single CTE statement, so the fake reads its bound
 * parameters positionally. That couples it to the statement's shape -- which
 * is deliberate: reordering the parameters silently would be a real bug, and
 * this is what notices.
 */
class FakeBillingDatabase {
  constructor({ workspaces = { "ws-1": "starter" }, plans = ["starter", "pro", "enterprise"] } = {}) {
    this.workspaces = new Map(Object.entries(workspaces));
    this.plans = new Set(plans);
    this.events = new Map();
    this.subscriptions = new Map();
    this.failWith = null;
  }

  query(sql, values) {
    if (this.failWith) throw this.failWith;
    const flat = sql.join("?");

    if (flat.includes("INSERT INTO ghic_billing_events")) {
      const [workspace, event, provider, type, , toPlan, summary] = values;
      const customerId = values[9];
      const subscriptionId = values[10];
      const status = values[12];
      const periodEnd = values[13];
      const cancelAtPeriodEnd = values[14];

      const found = this.workspaces.has(workspace);
      const fromPlan = found ? this.workspaces.get(workspace) : null;
      // No workspace -> the event insert selects from an empty CTE.
      if (!found) return [{ applied: 0, found: 0, from_plan: null }];
      // The primary key. This is the whole idempotency guarantee.
      if (this.events.has(event)) return [{ applied: 0, found: 1, from_plan: fromPlan }];
      if (!this.plans.has(toPlan)) throw new Error("foreign key violation: plan");

      this.events.set(event, { provider, type, workspace, fromPlan, toPlan, summary });
      this.subscriptions.set(workspace, {
        provider, customerId, subscriptionId, plan: toPlan,
        status, currentPeriodEnd: periodEnd, cancelAtPeriodEnd,
      });
      this.workspaces.set(workspace, toPlan);
      return [{ applied: 1, found: 1, from_plan: fromPlan }];
    }

    if (flat.includes("FROM ghic_workspaces w")) {
      const [id] = values;
      if (!this.workspaces.has(id)) return [];
      const sub = this.subscriptions.get(id);
      return [{
        workspace_plan: this.workspaces.get(id),
        provider: sub?.provider ?? null,
        customer_id: sub?.customerId ?? null,
        subscription_id: sub?.subscriptionId ?? null,
        subscription_plan: sub?.plan ?? null,
        status: sub?.status ?? null,
        current_period_end: sub?.currentPeriodEnd ?? null,
        cancel_at_period_end: sub?.cancelAtPeriodEnd ?? false,
      }];
    }

    if (flat.includes("FROM ghic_billing_events")) {
      const [id] = values;
      return [...this.events.entries()]
        .filter(([, e]) => e.workspace === id)
        .map(([eventId, e]) => ({
          event_id: eventId, type: e.type, from_plan: e.fromPlan,
          to_plan: e.toPlan, received_at: "2026-09-07T00:00:00Z",
        }));
    }

    throw new Error(`unexpected SQL: ${flat.slice(0, 80)}`);
  }

  deps() {
    const run = (sql, ...values) => Promise.resolve(this.query(sql, values));
    return { database: async () => run };
  }
}

const upgrade = (eventId = "evt_1", overrides = {}) => ({
  workspaceId: "ws-1",
  plan: "pro",
  eventId,
  type: "checkout.session.completed",
  customerId: "cus_1",
  subscriptionId: "sub_1",
  status: "active",
  ...overrides,
});

test("a paid upgrade moves the workspace plan", async () => {
  const db = new FakeBillingDatabase();
  const result = await applyPlanChange(upgrade(), db.deps());
  assert.equal(result.applied, true);
  assert.equal(result.fromPlan, "starter");
  assert.equal(result.toPlan, "pro");
  assert.equal(db.workspaces.get("ws-1"), "pro");
});

test("the same event delivered twice charges the workspace once", async () => {
  // Stripe retries any non-2xx for days. This is the guarantee that a slow
  // response cannot buy a second month.
  const db = new FakeBillingDatabase();
  const first = await applyPlanChange(upgrade("evt_dup"), db.deps());
  const second = await applyPlanChange(upgrade("evt_dup"), db.deps());
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(second.reason, "duplicate_event");
  assert.equal(db.events.size, 1);
});

test("a duplicate is reported as handled, not as a failure", async () => {
  // The caller answers 2xx to this. Treating it as an error would have
  // Stripe redelivering an event that has already been applied.
  const db = new FakeBillingDatabase();
  await applyPlanChange(upgrade("evt_1"), db.deps());
  const again = await applyPlanChange(upgrade("evt_1"), db.deps());
  assert.equal(again.applied, false);
  assert.equal(db.workspaces.get("ws-1"), "pro");
});

test("an event for an unknown workspace changes nothing", async () => {
  const db = new FakeBillingDatabase();
  const result = await applyPlanChange(
    upgrade("evt_1", { workspaceId: "ws-does-not-exist" }),
    db.deps(),
  );
  assert.equal(result.applied, false);
  assert.equal(result.reason, "unknown_workspace");
  assert.equal(db.events.size, 0);
  assert.equal(db.workspaces.get("ws-1"), "starter");
});

test("an unknown workspace is distinguished from a duplicate", async () => {
  // Both are "nothing happened", but only one of them means the event was
  // already applied. Collapsing them would hide a mis-routed webhook.
  const db = new FakeBillingDatabase();
  const unknown = await applyPlanChange(upgrade("e1", { workspaceId: "nope" }), db.deps());
  await applyPlanChange(upgrade("e2"), db.deps());
  const duplicate = await applyPlanChange(upgrade("e2"), db.deps());
  assert.notEqual(unknown.reason, duplicate.reason);
});

test("a cancellation returns the workspace to the free plan", async () => {
  const db = new FakeBillingDatabase();
  await applyPlanChange(upgrade("evt_up"), db.deps());
  const result = await applyPlanChange(
    upgrade("evt_down", { plan: "starter", type: "customer.subscription.deleted", status: "canceled" }),
    db.deps(),
  );
  assert.equal(result.applied, true);
  assert.equal(result.fromPlan, "pro");
  assert.equal(db.workspaces.get("ws-1"), "starter");
});

test("the audit row records where the workspace came from and went", async () => {
  // "Why was I charged" and "why did my limits change" have to be answerable
  // from the same table.
  const db = new FakeBillingDatabase();
  await applyPlanChange(upgrade("evt_1"), db.deps());
  const recorded = db.events.get("evt_1");
  assert.equal(recorded.fromPlan, "starter");
  assert.equal(recorded.toPlan, "pro");
  assert.equal(recorded.type, "checkout.session.completed");
});

test("a plan that is not in ghic_plans is refused, not silently applied", async () => {
  const db = new FakeBillingDatabase();
  await assert.rejects(
    applyPlanChange(upgrade("evt_1", { plan: "unicorn" }), db.deps()),
    (error) => error.code === "plan_change_failed",
  );
  assert.equal(db.workspaces.get("ws-1"), "starter");
});

test("missing identifiers are refused before any query runs", async () => {
  const db = new FakeBillingDatabase();
  await assert.rejects(applyPlanChange(upgrade("evt", { workspaceId: "" }), db.deps()), /workspace/i);
  await assert.rejects(applyPlanChange(upgrade("evt", { plan: "" }), db.deps()), /plan/i);
  await assert.rejects(applyPlanChange(upgrade("")), /event/i);
  assert.equal(db.events.size, 0);
});

test("a database failure surfaces rather than reporting success", async () => {
  // The caller turns this into a 5xx so Stripe retries. Reporting success
  // here would lose a paid upgrade with no way to recover it.
  const db = new FakeBillingDatabase();
  db.failWith = new Error("connection lost");
  await assert.rejects(applyPlanChange(upgrade(), db.deps()), (error) => error.status === 500);
});

// ---------------------------------------------------------------------------
// Reading billing state
// ---------------------------------------------------------------------------
test("a workspace that never subscribed reports its free plan", async () => {
  const db = new FakeBillingDatabase();
  const state = await subscriptionForWorkspace("ws-1", db.deps());
  assert.equal(state.plan, "starter");
  assert.equal(state.subscribed, false);
  assert.equal(state.customerId, null);
});

test("the enforced plan leads and the subscription explains it", async () => {
  const db = new FakeBillingDatabase();
  await applyPlanChange(upgrade(), db.deps());
  const state = await subscriptionForWorkspace("ws-1", db.deps());
  assert.equal(state.plan, "pro");
  assert.equal(state.subscribed, true);
  assert.equal(state.status, "active");
});

test("an unknown workspace is a 404 rather than an invented free plan", async () => {
  const db = new FakeBillingDatabase();
  await assert.rejects(
    subscriptionForWorkspace("nope", db.deps()),
    (error) => error.status === 404,
  );
});

test("history is scoped to the workspace that asked", async () => {
  const db = new FakeBillingDatabase({ workspaces: { "ws-1": "starter", "ws-2": "starter" } });
  await applyPlanChange(upgrade("evt_1"), db.deps());
  await applyPlanChange(upgrade("evt_2", { workspaceId: "ws-2" }), db.deps());
  const history = await billingHistory("ws-1", 20, db.deps());
  assert.equal(history.length, 1);
  assert.equal(history[0].eventId, "evt_1");
});
