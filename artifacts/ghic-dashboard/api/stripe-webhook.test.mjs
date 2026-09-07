import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createWebhookHandler } from "./stripe-webhook.mjs";

const SECRET = "whsec_test_secret";

function signedRequest(event, { secret = SECRET, method = "POST", timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const payload = JSON.stringify(event);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return request(payload, { method, signature: `t=${timestamp},v1=${signature}` });
}

function request(payload, { method = "POST", signature = "" } = {}) {
  return {
    method,
    headers: { "stripe-signature": signature },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(payload, "utf8");
    },
  };
}

function response() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

/** A handler wired to a recording stub instead of the database. */
function handlerWith({ result = { applied: true, reason: "applied", toPlan: "pro" }, throws = null } = {}) {
  const calls = [];
  const handler = createWebhookHandler({
    env: { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_PRO: "price_123" },
    applyPlanChange: async (change) => {
      calls.push(change);
      if (throws) throw throws;
      return result;
    },
  });
  return { handler, calls };
}

const paidCheckout = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      payment_status: "paid",
      metadata: { workspace_id: "ws-1", plan: "pro" },
      customer: "cus_1",
      subscription: "sub_1",
    },
  },
};

test("a signed paid checkout applies the plan change", async () => {
  const { handler, calls } = handlerWith();
  const res = response();
  await handler(signedRequest(paidCheckout), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.applied, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workspaceId, "ws-1");
  assert.equal(calls[0].eventId, "evt_1");
});

test("an unsigned request never reaches the plan change", async () => {
  // This is the whole point of the endpoint being public: anyone can POST
  // to it, and only a signature decides whether it means anything.
  const { handler, calls } = handlerWith();
  const res = response();
  await handler(request(JSON.stringify(paidCheckout)), res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("a forged signature never reaches the plan change", async () => {
  const { handler, calls } = handlerWith();
  const res = response();
  await handler(signedRequest(paidCheckout, { secret: "whsec_attacker" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("a replayed old event never reaches the plan change", async () => {
  const { handler, calls } = handlerWith();
  const res = response();
  const stale = Math.floor(Date.now() / 1000) - 7200;
  await handler(signedRequest(paidCheckout, { timestamp: stale }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("anything other than POST is refused", async () => {
  const { handler, calls } = handlerWith();
  const res = response();
  await handler(signedRequest(paidCheckout, { method: "GET" }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(calls.length, 0);
});

test("an event that changes nothing is accepted and dropped", async () => {
  // A non-2xx would have Stripe redelivering an event nothing will act on.
  const { handler, calls } = handlerWith();
  const res = response();
  await handler(signedRequest({ id: "evt_2", type: "invoice.created", data: { object: {} } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ignored, true);
  assert.equal(calls.length, 0);
});

test("a duplicate delivery answers 2xx so Stripe stops retrying", async () => {
  const { handler } = handlerWith({
    result: { applied: false, reason: "duplicate_event", toPlan: "pro" },
  });
  const res = response();
  await handler(signedRequest(paidCheckout), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.applied, false);
  assert.equal(res.body.reason, "duplicate_event");
});

test("a failure to apply answers 5xx so Stripe retries", async () => {
  // Telling Stripe a paid upgrade succeeded when it did not is the one
  // outcome with no way back: the money is taken and the event never
  // arrives again.
  const { handler } = handlerWith({ throws: Object.assign(new Error("db down"), { code: "plan_change_failed" }) });
  const res = response();
  await handler(signedRequest(paidCheckout), res);
  assert.equal(res.statusCode, 500);
});

test("an already-parsed body is refused rather than re-serialized", async () => {
  // The signature covers bytes. Re-encoding a parsed object would produce a
  // different payload, so this is reported as the configuration fault it is
  // instead of failing verification for a misleading reason.
  const { handler, calls } = handlerWith();
  const res = response();
  await handler(
    { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: { id: "evt_1" } },
    res,
  );
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, "raw_body_unavailable");
  assert.equal(calls.length, 0);
});

test("an unconfigured signing secret refuses every event", async () => {
  const handler = createWebhookHandler({ env: {}, applyPlanChange: async () => ({ applied: true }) });
  const res = response();
  await handler(signedRequest(paidCheckout), res);
  assert.equal(res.statusCode, 503);
});

test("the workspace charged comes from the signed event, not a header", async () => {
  // Nothing the caller controls outside the signed payload can redirect a
  // plan change at another workspace.
  const { handler, calls } = handlerWith();
  const req = signedRequest(paidCheckout);
  req.headers["x-workspace-id"] = "ws-attacker";
  const res = response();
  await handler(req, res);
  assert.equal(calls[0].workspaceId, "ws-1");
});
