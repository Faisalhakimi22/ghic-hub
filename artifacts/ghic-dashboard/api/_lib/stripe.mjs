/**
 * The Stripe half of billing: turning payment events into plan changes.
 *
 * Talks to Stripe over `fetch` rather than the SDK. Three calls are needed --
 * create a checkout session, create a portal session, verify a signature --
 * and on a serverless function the SDK's cold-start cost is paid on every
 * request that follows a scale-up. The signature scheme is the only subtle
 * part, and it is short, specified, and tested here rather than trusted.
 *
 * Nothing in this file decides what a plan means. It answers "which
 * workspace, which plan, is this event real" and hands that to
 * `billing.mjs`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

/** How far out of date a signed payload may be, in seconds. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

function stripeError(message, status = 502, code = "stripe_error", cause = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

/**
 * Which plan a Stripe price sells.
 *
 * Read from the environment at call time, not at import. The price id is the
 * only place a dollar amount is configured, and it lives in Stripe -- this
 * service never learns what anything costs, which is why changing a price
 * does not need a deploy.
 */
export function priceToPlan(env = process.env) {
  const map = new Map();
  for (const [key, plan] of [
    ["STRIPE_PRICE_PRO", "pro"],
    ["STRIPE_PRICE_ENTERPRISE", "enterprise"],
  ]) {
    const price = String(env[key] || "").trim();
    if (price) map.set(price, plan);
  }
  return map;
}

export function planForPrice(priceId, env = process.env) {
  return priceToPlan(env).get(String(priceId || "").trim()) || null;
}

function priceForPlan(plan, env = process.env) {
  for (const [price, name] of priceToPlan(env)) {
    if (name === plan) return price;
  }
  return null;
}

/**
 * Verify that a webhook body really came from Stripe, and parse it.
 *
 * Two failures matter and both are rejections, not warnings: a signature
 * that does not match the raw bytes, and a timestamp outside the tolerance.
 * The second is what stops a genuine, correctly-signed upgrade event from
 * being captured and replayed months later.
 *
 * `rawBody` must be the exact bytes Stripe sent. Anything that has been
 * through JSON.parse and re-serialized will not verify, which is the point:
 * the signature covers the bytes, not the meaning.
 */
export function verifyWebhookSignature(
  rawBody,
  signatureHeader,
  secret,
  { toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS, now = Date.now() } = {},
) {
  const key = String(secret || "").trim();
  if (!key) {
    // Refuse rather than accept unverified events. An endpoint that applies
    // plan changes without checking who sent them is a way to hand out paid
    // plans to anyone who can POST.
    throw stripeError("Webhook signing secret is not configured.", 503, "webhook_not_configured");
  }
  const header = String(signatureHeader || "");
  if (!header) throw stripeError("Missing Stripe signature.", 400, "signature_missing");

  let timestamp = null;
  const provided = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") timestamp = v;
    else if (k === "v1" && v) provided.push(v);
  }
  if (!timestamp || !provided.length) {
    throw stripeError("Malformed Stripe signature.", 400, "signature_malformed");
  }

  const age = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    throw stripeError("Stripe signature timestamp is outside the tolerance.", 400, "signature_stale");
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  const expected = createHmac("sha256", key)
    .update(`${timestamp}.`)
    .update(body)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");

  // Every v1 is checked, and with a constant-time compare. Stripe sends more
  // than one while a signing secret is being rotated, and a plain === here
  // would leak the expected digest a byte at a time.
  const matched = provided.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, "utf8");
    if (candidateBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(candidateBuffer, expectedBuffer);
  });
  if (!matched) throw stripeError("Stripe signature does not match.", 400, "signature_invalid");

  try {
    return JSON.parse(body.toString("utf8"));
  } catch (error) {
    throw stripeError("Stripe event body is not valid JSON.", 400, "event_malformed", error);
  }
}

function encodeForm(fields) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    params.append(key, String(value));
  }
  return params;
}

async function stripeRequest(path, fields, { env = process.env, fetchImpl = fetch, idempotencyKey = null } = {}) {
  const secret = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!secret) throw stripeError("Stripe is not configured.", 503, "stripe_not_configured");

  const headers = {
    authorization: `Bearer ${secret}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  // Stripe deduplicates on this, so a retry after a timeout cannot create a
  // second checkout session -- or, worse, a second subscription.
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

  let response;
  try {
    response = await fetchImpl(`${STRIPE_API}${path}`, {
      method: "POST",
      headers,
      body: encodeForm(fields).toString(),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    throw stripeError("Stripe could not be reached.", 502, "stripe_unreachable", error);
  }

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    body = {};
  }
  if (!response.ok) {
    // Stripe's own message is not shown to the browser: it can name prices,
    // accounts and internal state the customer has no business seeing.
    throw stripeError(
      body?.error?.message || "Stripe rejected the request.",
      502,
      "stripe_rejected",
    );
  }
  return body;
}

/**
 * A hosted checkout page for one workspace and one plan.
 *
 * The workspace travels in metadata on both the session and the subscription
 * it creates. Every later event -- renewal, cancellation, payment failure --
 * arrives as a subscription event, so without `subscription_data.metadata`
 * there would be no way to tell whose subscription just lapsed.
 */
export async function createCheckoutSession(
  { workspaceId, plan, successUrl, cancelUrl, customerEmail = null, customerId = null },
  { env = process.env, fetchImpl = fetch } = {},
) {
  const workspace = String(workspaceId || "").trim();
  if (!workspace) throw stripeError("A workspace is required.", 400, "workspace_required");

  const price = priceForPlan(plan, env);
  if (!price) {
    throw stripeError(`No Stripe price is configured for the ${plan} plan.`, 503, "price_not_configured");
  }

  const fields = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": 1,
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Recoverable from the session itself, belt and braces with metadata.
    client_reference_id: workspace,
    "metadata[workspace_id]": workspace,
    "metadata[plan]": plan,
    "subscription_data[metadata][workspace_id]": workspace,
    "subscription_data[metadata][plan]": plan,
    allow_promotion_codes: "true",
  };
  if (customerId) fields.customer = customerId;
  else if (customerEmail) fields.customer_email = customerEmail;

  const session = await stripeRequest("/checkout/sessions", fields, {
    env,
    fetchImpl,
    // One in-flight checkout per workspace and plan. A double-clicked
    // upgrade button returns the same session rather than two.
    idempotencyKey: `ghic-checkout-${workspace}-${plan}`,
  });
  return { id: session.id, url: session.url };
}

/**
 * The Stripe-hosted billing portal, where a customer can change card details
 * or cancel without emailing anybody.
 */
export async function createPortalSession(
  { customerId, returnUrl },
  { env = process.env, fetchImpl = fetch } = {},
) {
  const customer = String(customerId || "").trim();
  if (!customer) throw stripeError("No billing customer for this workspace.", 409, "no_customer");
  const session = await stripeRequest(
    "/billing_portal/sessions",
    { customer, return_url: returnUrl },
    { env, fetchImpl },
  );
  return { url: session.url };
}

function isoFromUnix(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

/**
 * Statuses that mean the customer is entitled to what they bought.
 *
 * `past_due` is deliberately included. Stripe retries a failed card for days
 * before giving up, and cutting service off on the first failed charge --
 * rather than when Stripe concludes the subscription is over -- would punish
 * an expired card as if it were a refusal to pay.
 */
const ENTITLED = new Set(["active", "trialing", "past_due"]);

/**
 * Translate a Stripe event into a plan change, or null to ignore it.
 *
 * Ignoring is the common case: Stripe sends many event types and only a few
 * change what a workspace may do. An unrecognised event is answered 2xx and
 * dropped, because retrying it forever would achieve nothing.
 */
export function eventToPlanChange(event, { defaultPlan = "starter", env = process.env } = {}) {
  const type = String(event?.type || "");
  const object = event?.data?.object || {};

  if (type === "checkout.session.completed") {
    // Only a paid session grants anything. Stripe emits this for sessions
    // that were completed but not yet paid (delayed payment methods), and
    // treating those as paid would give away the plan.
    if (object.payment_status && object.payment_status !== "paid") return null;
    const workspaceId = object.metadata?.workspace_id || object.client_reference_id || null;
    const plan = object.metadata?.plan || null;
    if (!workspaceId || !plan) return null;
    return {
      workspaceId,
      plan,
      type,
      customerId: object.customer || null,
      subscriptionId: object.subscription || null,
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      summary: `checkout completed for ${plan}`,
    };
  }

  if (type === "customer.subscription.updated" || type === "customer.subscription.created") {
    const workspaceId = object.metadata?.workspace_id || null;
    if (!workspaceId) return null;
    const priceId = object.items?.data?.[0]?.price?.id || null;
    const plan = planForPrice(priceId, env) || object.metadata?.plan || null;
    if (!plan) return null;
    const entitled = ENTITLED.has(String(object.status || ""));
    return {
      workspaceId,
      // A subscription that has lapsed drops the workspace to the free plan.
      // `cancel_at_period_end` is not a lapse -- it is a subscription that
      // is still paid for until it ends, so the plan is kept.
      plan: entitled ? plan : defaultPlan,
      type,
      customerId: object.customer || null,
      subscriptionId: object.id || null,
      status: String(object.status || "unknown"),
      currentPeriodEnd: isoFromUnix(object.current_period_end),
      cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
      summary: `subscription ${object.status}`,
    };
  }

  if (type === "customer.subscription.deleted") {
    const workspaceId = object.metadata?.workspace_id || null;
    if (!workspaceId) return null;
    return {
      workspaceId,
      plan: defaultPlan,
      type,
      customerId: object.customer || null,
      subscriptionId: object.id || null,
      status: "canceled",
      currentPeriodEnd: isoFromUnix(object.current_period_end),
      cancelAtPeriodEnd: false,
      summary: "subscription ended",
    };
  }

  return null;
}
