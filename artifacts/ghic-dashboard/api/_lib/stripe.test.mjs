import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  createCheckoutSession,
  createPortalSession,
  eventToPlanChange,
  planForPrice,
  verifyWebhookSignature,
} from "./stripe.mjs";

const SECRET = "whsec_test_secret";

/** A body signed the way Stripe signs one. */
function signed(body, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return { payload, header: `t=${timestamp},v1=${signature}` };
}

// ---------------------------------------------------------------------------
// Signature verification. This is the whole security boundary of the webhook:
// without it, anyone who can POST can hand themselves a paid plan.
// ---------------------------------------------------------------------------
test("a correctly signed body verifies and parses", () => {
  const { payload, header } = signed({ id: "evt_1", type: "ping" });
  const event = verifyWebhookSignature(payload, header, SECRET);
  assert.equal(event.id, "evt_1");
});

test("a body signed with a different secret is refused", () => {
  const { payload, header } = signed({ id: "evt_1" }, { secret: "whsec_attacker" });
  assert.throws(() => verifyWebhookSignature(payload, header, SECRET), /does not match/);
});

test("a tampered body is refused even with a valid-looking signature", () => {
  const { header } = signed({ id: "evt_1", amount: 1 });
  assert.throws(
    () => verifyWebhookSignature(JSON.stringify({ id: "evt_1", amount: 999 }), header, SECRET),
    /does not match/,
  );
});

test("an old signature is refused, so a real event cannot be replayed later", () => {
  // The event below is genuinely signed by us. Age is the only thing wrong
  // with it, and it has to be enough on its own.
  const stale = Math.floor(Date.now() / 1000) - 3600;
  const { payload, header } = signed({ id: "evt_1" }, { timestamp: stale });
  assert.throws(() => verifyWebhookSignature(payload, header, SECRET), /tolerance/);
});

test("a missing or malformed signature header is refused", () => {
  const { payload } = signed({ id: "evt_1" });
  assert.throws(() => verifyWebhookSignature(payload, "", SECRET), /Missing/);
  assert.throws(() => verifyWebhookSignature(payload, "garbage", SECRET), /Malformed/);
  assert.throws(() => verifyWebhookSignature(payload, "t=123", SECRET), /Malformed/);
});

test("no configured secret refuses rather than accepts", () => {
  // The dangerous default would be to skip verification when unconfigured.
  const { payload, header } = signed({ id: "evt_1" });
  assert.throws(() => verifyWebhookSignature(payload, header, ""), /not configured/);
});

test("one valid signature among several is accepted, for secret rotation", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const good = createHmac("sha256", SECRET).update(`${timestamp}.{}`).digest("hex");
  const header = `t=${timestamp},v1=deadbeef,v1=${good}`;
  assert.deepEqual(verifyWebhookSignature("{}", header, SECRET), {});
});

test("a signature of the wrong length cannot crash the comparison", () => {
  // timingSafeEqual throws on length mismatch; that must be a refusal, not
  // a 500 that Stripe then retries forever.
  const timestamp = Math.floor(Date.now() / 1000);
  assert.throws(
    () => verifyWebhookSignature("{}", `t=${timestamp},v1=ab`, SECRET),
    /does not match/,
  );
});

test("verification works on raw bytes, not a re-serialized object", () => {
  // Spacing is not preserved by parse+stringify, so the signature only
  // holds against the original bytes.
  const raw = '{ "a": 1,  "b": 2 }';
  const { header } = signed(raw);
  assert.deepEqual(verifyWebhookSignature(Buffer.from(raw, "utf8"), header, SECRET), {
    a: 1,
    b: 2,
  });
  assert.throws(
    () => verifyWebhookSignature(JSON.stringify(JSON.parse(raw)), header, SECRET),
    /does not match/,
  );
});

// ---------------------------------------------------------------------------
// Price mapping
// ---------------------------------------------------------------------------
test("a price maps to its plan, and an unknown price maps to nothing", () => {
  const env = { STRIPE_PRICE_PRO: "price_123" };
  assert.equal(planForPrice("price_123", env), "pro");
  assert.equal(planForPrice("price_other", env), null);
  assert.equal(planForPrice("", env), null);
});

// ---------------------------------------------------------------------------
// Event translation
// ---------------------------------------------------------------------------
test("a paid checkout grants the plan it was for", () => {
  const change = eventToPlanChange({
    type: "checkout.session.completed",
    data: {
      object: {
        payment_status: "paid",
        metadata: { workspace_id: "ws-1", plan: "pro" },
        customer: "cus_1",
        subscription: "sub_1",
      },
    },
  });
  assert.equal(change.workspaceId, "ws-1");
  assert.equal(change.plan, "pro");
  assert.equal(change.subscriptionId, "sub_1");
});

test("an unpaid checkout grants nothing", () => {
  // Delayed payment methods complete the session before the money arrives.
  const change = eventToPlanChange({
    type: "checkout.session.completed",
    data: {
      object: {
        payment_status: "unpaid",
        metadata: { workspace_id: "ws-1", plan: "pro" },
      },
    },
  });
  assert.equal(change, null);
});

test("a checkout with no workspace is ignored rather than guessed at", () => {
  const change = eventToPlanChange({
    type: "checkout.session.completed",
    data: { object: { payment_status: "paid", metadata: { plan: "pro" } } },
  });
  assert.equal(change, null);
});

test("an active subscription keeps the plan its price sells", () => {
  const change = eventToPlanChange(
    {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "active",
          metadata: { workspace_id: "ws-1" },
          items: { data: [{ price: { id: "price_123" } }] },
          current_period_end: 1800000000,
        },
      },
    },
    { env: { STRIPE_PRICE_PRO: "price_123" } },
  );
  assert.equal(change.plan, "pro");
  assert.equal(change.status, "active");
  assert.equal(change.currentPeriodEnd, new Date(1800000000 * 1000).toISOString());
});

test("a past-due subscription keeps its plan", () => {
  // Stripe retries a failed card for days. Cutting service off on the first
  // failure would punish an expired card as if it were a refusal to pay.
  const change = eventToPlanChange(
    {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "past_due",
          metadata: { workspace_id: "ws-1", plan: "pro" },
          items: { data: [{ price: { id: "price_123" } }] },
        },
      },
    },
    { env: { STRIPE_PRICE_PRO: "price_123" } },
  );
  assert.equal(change.plan, "pro");
});

test("a cancelled subscription drops to the free plan", () => {
  const change = eventToPlanChange({
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_1", metadata: { workspace_id: "ws-1", plan: "pro" } } },
  });
  assert.equal(change.plan, "starter");
  assert.equal(change.status, "canceled");
});

test("cancel-at-period-end keeps the plan the customer paid for", () => {
  const change = eventToPlanChange(
    {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "active",
          cancel_at_period_end: true,
          metadata: { workspace_id: "ws-1" },
          items: { data: [{ price: { id: "price_123" } }] },
        },
      },
    },
    { env: { STRIPE_PRICE_PRO: "price_123" } },
  );
  assert.equal(change.plan, "pro");
  assert.equal(change.cancelAtPeriodEnd, true);
});

test("an unrecognised event type is ignored", () => {
  assert.equal(eventToPlanChange({ type: "invoice.created", data: { object: {} } }), null);
  assert.equal(eventToPlanChange({}), null);
});

// ---------------------------------------------------------------------------
// Outbound calls
// ---------------------------------------------------------------------------
function fakeFetch(captured, body = { id: "cs_1", url: "https://checkout.stripe.test/x" }) {
  return async (url, init) => {
    captured.url = url;
    captured.init = init;
    captured.fields = Object.fromEntries(new URLSearchParams(init.body));
    return { ok: true, text: async () => JSON.stringify(body) };
  };
}

test("checkout carries the workspace on both the session and the subscription", async () => {
  const captured = {};
  await createCheckoutSession(
    { workspaceId: "ws-1", plan: "pro", successUrl: "https://d/s", cancelUrl: "https://d/c" },
    { env: { STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_PRO: "price_123" }, fetchImpl: fakeFetch(captured) },
  );
  // Renewal and cancellation arrive as subscription events, so without the
  // subscription metadata there would be no way to tell whose lapsed.
  assert.equal(captured.fields["subscription_data[metadata][workspace_id]"], "ws-1");
  assert.equal(captured.fields["metadata[workspace_id]"], "ws-1");
  assert.equal(captured.fields.client_reference_id, "ws-1");
  assert.equal(captured.fields["line_items[0][price]"], "price_123");
  assert.equal(captured.fields.mode, "subscription");
  assert.ok(captured.init.headers["idempotency-key"]);
});

test("checkout refuses a plan with no configured price", async () => {
  await assert.rejects(
    createCheckoutSession(
      { workspaceId: "ws-1", plan: "pro", successUrl: "s", cancelUrl: "c" },
      { env: { STRIPE_SECRET_KEY: "sk_test" }, fetchImpl: fakeFetch({}) },
    ),
    /No Stripe price is configured/,
  );
});

test("an unconfigured Stripe refuses rather than pretending to charge", async () => {
  await assert.rejects(
    createCheckoutSession(
      { workspaceId: "ws-1", plan: "pro", successUrl: "s", cancelUrl: "c" },
      { env: { STRIPE_PRICE_PRO: "price_123" }, fetchImpl: fakeFetch({}) },
    ),
    /not configured/,
  );
});

test("the portal refuses a workspace that has never paid", async () => {
  await assert.rejects(
    createPortalSession(
      { customerId: null, returnUrl: "https://d/b" },
      { env: { STRIPE_SECRET_KEY: "sk_test" }, fetchImpl: fakeFetch({}) },
    ),
    /No billing customer/,
  );
});

test("a Stripe error does not leak Stripe's message verbatim to the caller", async () => {
  const failing = async () => ({
    ok: false,
    text: async () => JSON.stringify({ error: { message: "No such price: price_secret" } }),
  });
  await assert.rejects(
    createCheckoutSession(
      { workspaceId: "ws-1", plan: "pro", successUrl: "s", cancelUrl: "c" },
      { env: { STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_PRO: "price_123" }, fetchImpl: failing },
      ),
    (error) => error.code === "stripe_rejected",
  );
});
