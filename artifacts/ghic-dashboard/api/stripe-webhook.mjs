/**
 * Stripe's webhook endpoint.
 *
 * A separate function rather than another path in `index.mjs`, because that
 * handler authenticates before it routes and Stripe has no session to
 * present. Everything the Hub serves is behind a viewer; this is the one
 * thing that is not, so it is the one thing that verifies a signature.
 *
 * `vercel.json` excludes this path from the catch-all `/api/:path*` rewrite.
 * That rule would otherwise hand Stripe's anonymous POST to `index.mjs`,
 * which answers 401 before it routes. A self-referential passthrough rewrite
 * does not work: it is a no-op, so evaluation falls through to the catch-all
 * anyway. The exclusion has to be on the catch-all itself.
 *
 * What makes this endpoint safe is not that it is hard to find. It is that
 * an unsigned body is refused, a stale one is refused, and a replayed one
 * changes nothing.
 */
import { applyPlanChange, DEFAULT_PLAN } from "./_lib/billing.mjs";
import { eventToPlanChange, verifyWebhookSignature } from "./_lib/stripe.mjs";

/**
 * The exact bytes Stripe signed.
 *
 * The signature covers the raw body, so anything that has been parsed and
 * re-serialized will not verify -- key order and whitespace are not
 * preserved. If a platform has already replaced the body with a parsed
 * object, that is a configuration problem, and it is reported as one rather
 * than papered over by re-encoding something that cannot match.
 */
async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === "string") return Buffer.from(req.rawBody, "utf8");
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  if (req.body && typeof req.body === "object") {
    throw Object.assign(
      new Error("The request body was parsed before it could be verified."),
      { status: 500, code: "raw_body_unavailable" },
    );
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createWebhookHandler(overrides = {}) {
  const deps = {
    verifyWebhookSignature,
    eventToPlanChange,
    applyPlanChange,
    env: process.env,
    ...overrides,
  };

  return async function handler(req, res) {
    res.setHeader("cache-control", "no-store");

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    let event;
    try {
      const raw = await readRawBody(req);
      event = deps.verifyWebhookSignature(
        raw,
        req.headers["stripe-signature"],
        deps.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      // 4xx for anything that will never become valid -- a wrong signature
      // is not a transient failure and there is nothing for Stripe to
      // usefully retry. 5xx stays 5xx so Stripe does retry: an unconfigured
      // signing secret is our fault and answers 503, the same way the
      // retention endpoint reports a missing CRON_SECRET.
      const status = Number(error?.status) >= 400 ? Number(error.status) : 500;
      res.status(status).json({ error: error?.code || "invalid_event" });
      return;
    }

    let change;
    try {
      change = deps.eventToPlanChange(event, { defaultPlan: DEFAULT_PLAN, env: deps.env });
    } catch {
      change = null;
    }

    // Most Stripe events do not change what a workspace may do. Accepting
    // and dropping them is correct: a non-2xx here would have Stripe
    // redelivering an event nothing will ever act on.
    if (!change) {
      res.status(200).json({ received: true, ignored: true, type: event?.type || null });
      return;
    }

    try {
      const result = await deps.applyPlanChange({
        ...change,
        eventId: event.id,
        provider: "stripe",
      });
      res.status(200).json({
        received: true,
        applied: result.applied,
        reason: result.reason,
        plan: result.toPlan,
      });
    } catch (error) {
      // Deliberately a 500 so Stripe retries. Losing a paid upgrade because
      // the database blinked, and telling Stripe it went fine, is the one
      // outcome with no way back -- the customer has been charged and the
      // event will never be sent again.
      res.status(500).json({ error: error?.code || "plan_change_failed" });
    }
  };
}

export default createWebhookHandler();
