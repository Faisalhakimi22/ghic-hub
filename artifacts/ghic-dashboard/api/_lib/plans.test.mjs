import assert from "node:assert/strict";
import test from "node:test";

import { partitionRepositories, planForWorkspace } from "./plans.mjs";

/** A workspace with N repositories already connected. */
const connected = (n) => Array.from({ length: n }, (_, i) => `acme/repo-${i}`);

test("an unlimited plan takes everything", () => {
  const result = partitionRepositories(
    ["a/one", "a/two", "a/three"], [], null,
  );
  assert.deepEqual(result.allowed, ["a/one", "a/two", "a/three"]);
  assert.deepEqual(result.refused, []);
  assert.equal(result.limit, null);
});

test("null is unlimited and zero is not", () => {
  // Number(null) is 0. If that coercion ever happens the most expensive plan
  // silently becomes the most restrictive one, so the two must stay distinct.
  const unlimited = partitionRepositories(["a/one"], [], null);
  const none = partitionRepositories(["a/one"], [], 0);
  assert.deepEqual(unlimited.allowed, ["a/one"]);
  assert.deepEqual(none.allowed, []);
  assert.deepEqual(none.refused, ["a/one"]);
});

test("a fresh workspace on the free plan takes one repository", () => {
  const result = partitionRepositories(
    ["a/three", "a/one", "a/two"], [], 1,
  );
  assert.equal(result.allowed.length, 1);
  assert.equal(result.refused.length, 2);
  // Deterministic: the same selection always yields the same decision rather
  // than depending on however GitHub happened to order the list.
  assert.deepEqual(result.allowed, ["a/one"]);
  assert.deepEqual(result.refused, ["a/three", "a/two"]);
});

test("repositories already connected are never dropped by a new limit", () => {
  // A limit introduced after the fact governs the next connection, not the
  // last one. Thirty-six repositories connected before the free plan existed
  // keep working; the thirty-seventh does not.
  const existing = connected(36);
  const result = partitionRepositories(existing, existing, 1);
  assert.equal(result.allowed.length, 36);
  assert.deepEqual(result.refused, []);
});

test("an over-limit workspace still cannot add more", () => {
  const existing = connected(36);
  const result = partitionRepositories([...existing, "acme/new-one"], existing, 1);
  assert.equal(result.allowed.length, 36);
  assert.deepEqual(result.refused, ["acme/new-one"]);
});

test("capacity counts what is already connected, not just this request", () => {
  // Two calls of one repository each must not slip past a limit of two by
  // being under it individually.
  const result = partitionRepositories(["a/three"], ["a/one", "a/two"], 2);
  assert.deepEqual(result.allowed, []);
  assert.deepEqual(result.refused, ["a/three"]);
});

test("re-syncing the same selection is stable", () => {
  // The gate must not refuse on a second identical sync, which would make a
  // routine reconciliation look like hitting the limit.
  const first = partitionRepositories(["a/one", "a/two"], [], 1);
  const second = partitionRepositories(["a/one", "a/two"], first.allowed, 1);
  assert.deepEqual(second.allowed, first.allowed);
  assert.deepEqual(second.refused, ["a/two"]);
});

test("duplicate names in one selection consume one slot", () => {
  const result = partitionRepositories(["a/one", "a/one"], [], 1);
  assert.deepEqual(result.allowed, ["a/one"]);
  assert.deepEqual(result.refused, []);
});

test("the plan reader falls open when the tables are absent", async () => {
  // A quota is a commercial limit, not a security boundary. Refusing every
  // connection because a migration has not run turns billing into an outage,
  // and the fault would be ours rather than the customer's.
  const missing = () => {
    const error = new Error('relation "ghic_plans" does not exist');
    error.code = "42P01";
    throw error;
  };
  const plan = await planForWorkspace("ws-1", { database: async () => missing });
  assert.equal(plan.maxRepositories, null);
  assert.equal(plan.enforced, false);
});

test("the plan reader fails open for an unknown workspace", async () => {
  const q = () => Promise.resolve([]);
  const plan = await planForWorkspace("ws-missing", { database: async () => q });
  assert.equal(plan.maxRepositories, null);
  assert.equal(plan.enforced, false);
});

test("a real plan row is read as written", async () => {
  const q = () => Promise.resolve([{
    plan: "starter", max_repositories: 1, max_issues_per_period: 500, period: "month",
  }]);
  const plan = await planForWorkspace("ws-1", { database: async () => q });
  assert.equal(plan.plan, "starter");
  assert.equal(plan.maxRepositories, 1);
  assert.equal(plan.maxIssuesPerPeriod, 500);
  assert.equal(plan.enforced, true);
});

test("an enterprise row keeps its nulls", async () => {
  const q = () => Promise.resolve([{
    plan: "enterprise", max_repositories: null, max_issues_per_period: null, period: "month",
  }]);
  const plan = await planForWorkspace("ws-1", { database: async () => q });
  assert.equal(plan.maxRepositories, null);
  assert.equal(plan.maxIssuesPerPeriod, null);
  assert.equal(plan.enforced, true);
});

test("a blank workspace id is not a licence for unlimited enforcement", async () => {
  for (const id of ["", "   ", null, undefined]) {
    const plan = await planForWorkspace(id);
    assert.equal(plan.enforced, false);
  }
});

// ---------------------------------------------------------------------------
// Usage, as the dashboard reads it
// ---------------------------------------------------------------------------
import { periodKey, usageForWorkspace } from "./plans.mjs";

/** A `q` tagged template that answers by matching the SQL it is given. */
function stubDatabase(answers) {
  return async () => (strings) => {
    const sql = strings.join(" ");
    for (const [needle, rows] of answers) {
      if (sql.includes(needle)) return rows;
    }
    throw new Error(`unexpected SQL: ${sql}`);
  };
}

const starter = ["FROM ghic_workspaces w", [{
  plan: "starter", max_repositories: 1, max_issues_per_period: 500, period: "month",
}]];

test("the period is the UTC calendar month", () => {
  assert.equal(periodKey("month", new Date("2026-08-27T12:00:00Z")), "2026-08");
  // The same instant expressed in a late timezone is still August. Both
  // services have to name the same period or the dashboard reports usage
  // from a month the backend is not billing.
  assert.equal(periodKey("month", new Date("2026-08-31T23:30:00Z")), "2026-08");
  assert.equal(periodKey("month", new Date("2026-09-01T00:30:00Z")), "2026-09");
});

test("the period matches the Python backend's format exactly", () => {
  // usage.period_key uses strftime("%Y-%m"). Zero padding included: a
  // "2026-8" here would silently read an empty month forever.
  assert.match(periodKey("month", new Date("2026-01-05T00:00:00Z")), /^\d{4}-\d{2}$/);
  assert.equal(periodKey("month", new Date("2026-01-05T00:00:00Z")), "2026-01");
});

test("usage separates the four outcomes and counts only the billed one", async () => {
  const deps = {
    database: stubDatabase([
      starter,
      ["FROM ghic_usage_events", [
        { outcome: "counted", n: 12 },
        { outcome: "failed", n: 3 },
        { outcome: "limited", n: 1 },
      ]],
      ["FROM ghic_github_repositories", [{ n: 1 }]],
    ]),
  };
  const usage = await usageForWorkspace("ws-1", deps, new Date("2026-08-27T00:00:00Z"));
  // A failed analysis is not something to bill for, so it does not move the
  // number the customer is shown as their usage.
  assert.equal(usage.issues.used, 12);
  assert.equal(usage.issues.remaining, 488);
  assert.equal(usage.outcomes.failed, 3);
});

test("an exhausted workspace reports zero remaining, never a negative", async () => {
  const deps = {
    database: stubDatabase([
      starter,
      ["FROM ghic_usage_events", [{ outcome: "counted", n: 640 }]],
      ["FROM ghic_github_repositories", [{ n: 1 }]],
    ]),
  };
  const usage = await usageForWorkspace("ws-1", deps);
  assert.equal(usage.issues.remaining, 0);
});

test("unlimited reports no remainder rather than zero", async () => {
  const deps = {
    database: stubDatabase([
      ["FROM ghic_workspaces w", [{
        plan: "enterprise", max_repositories: null,
        max_issues_per_period: null, period: "month",
      }]],
      ["FROM ghic_usage_events", [{ outcome: "counted", n: 90000 }]],
      ["FROM ghic_github_repositories", [{ n: 40 }]],
    ]),
  };
  const usage = await usageForWorkspace("ws-1", deps);
  // A 0 here would read as "none left" on exactly the plan that has most.
  assert.equal(usage.issues.limit, null);
  assert.equal(usage.issues.remaining, null);
  assert.equal(usage.repositories.remaining, null);
});

test("usage falls open when the tables are absent", async () => {
  const deps = {
    database: async () => () => {
      const error = new Error('relation "ghic_usage_events" does not exist');
      error.code = "42P01";
      throw error;
    },
  };
  const usage = await usageForWorkspace("ws-1", deps);
  assert.equal(usage.enforced, false);
  assert.equal(usage.issues.used, 0);
});

test("usage counts only active repositories", async () => {
  const deps = {
    database: stubDatabase([
      starter,
      ["FROM ghic_usage_events", []],
      // The SQL has to carry `active = true`; a disconnected repository
      // still holds its row and would otherwise occupy a plan slot forever.
      ["active = true", [{ n: 1 }]],
    ]),
  };
  const usage = await usageForWorkspace("ws-1", deps);
  assert.equal(usage.repositories.used, 1);
  assert.equal(usage.repositories.remaining, 0);
});
