# Billing

Until this existed, the Pro plan's call to action was a `mailto:`. There was
no way for anyone to pay, so every paid plan was a manual arrangement and the
plan column in `ghic_workspaces` could only be moved by hand.

Stripe Checkout closes that. GitHub Marketplace billing was the alternative
and was not chosen: paid Marketplace listings need publisher verification and
listing approval before a single payment can be taken, and the Enterprise
tier's custom pricing cannot run through it at all.

## The rule everything else follows

**Only Stripe's signed webhook moves a plan.**

The success URL is a page in a browser. A customer can close the tab before
it loads, load it twice, or type it by hand — so it grants nothing and only
refreshes what the server already believes. This is the same discipline as
the usage gate, where the workspace charged is the one *authorization*
decided on rather than the one the payload claimed.

## How a payment becomes a plan

| Step | Where | What happens |
|---|---|---|
| 1 | `POST /api/billing/checkout` | Owner only. The workspace comes from the session, never the body. Returns a Stripe URL. |
| 2 | Stripe | Hosted checkout. GHIC never sees a card. |
| 3 | `POST /api/stripe-webhook` | Signature verified, event applied once. |
| 4 | `ghic_workspaces.plan` | Moves. Every limit reader picks it up with no further change. |

`ghic_workspaces.plan` stays the single thing limit readers consult.
`ghic_billing_subscriptions` records *why* it is what it is. A reader that
had to understand Stripe to answer "how many repositories may this workspace
connect" would be a second source of truth.

## What stops the failure modes that cost money

- **Replay.** `ghic_billing_events.event_id` is a primary key. Stripe retries
  any non-2xx for days; a slow response must not buy a second month. The
  guarantee is in the schema, not in application care.
- **Forgery.** The webhook is public — it has to be. An unsigned body, a body
  signed with the wrong secret, and a body altered after signing are all
  refused, and an unconfigured signing secret refuses everything rather than
  accepting unverified events.
- **Stale replay.** A genuine, correctly signed event captured and resent
  months later is refused on its timestamp.
- **Cross-workspace.** Unique indexes on `subscription_id` and `customer_id`
  mean one payment cannot upgrade two workspaces.
- **Lost upgrades.** A database failure answers 5xx so Stripe retries.
  Telling Stripe a paid upgrade succeeded when it did not is the one outcome
  with no way back — the money is taken and the event never returns.

## Deliberate choices worth knowing

- **`past_due` keeps the plan.** Stripe retries a failed card for days.
  Cutting service off on the first failed charge, rather than when Stripe
  concludes the subscription is over, punishes an expired card as if it were
  a refusal to pay.
- **`cancel_at_period_end` keeps the plan.** It is paid for until it ends.
- **A downgrade never revokes connected repositories.** `partitionRepositories`
  grandfathers what is already connected; a limit governs the next
  connection, not the last one.
- **No SDK.** Three API calls do not justify the cold-start weight on a
  serverless function. Signature verification is the only subtle part, and it
  is tested directly rather than trusted.

## Configuration

All on the **Hub** Vercel project.

| Variable | Required | What it is |
|---|---|---|
| `STRIPE_SECRET_KEY` | yes | `sk_live_…`. Without it checkout refuses rather than pretending. |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_…` from the webhook endpoint. Without it every event is refused. |
| `STRIPE_PRICE_PRO` | yes | The Stripe **price** id for Pro. |
| `STRIPE_PRICE_ENTERPRISE` | no | Only if Enterprise becomes self-serve. |
| `DASHBOARD_URL` | recommended | Origin for Stripe's return URLs. Falls back to request headers. |

**The price lives in Stripe, not here.** This service never learns what
anything costs, which is why changing a price does not need a deploy.

## Setting it up

1. Create a Product and a recurring Price in Stripe. Copy the **price** id
   (`price_…`, not the product id) into `STRIPE_PRICE_PRO`.
2. Add a webhook endpoint pointing at `https://<hub>/api/stripe-webhook`,
   subscribed to `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated` and
   `customer.subscription.deleted`.
3. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Redeploy. Vercel bakes environment variables in at build time, so a
   variable added after a deploy is not visible to it.
5. Test with Stripe's test mode and a `4242…` card before switching keys.

`vercel.json` carries a passthrough rewrite for `/api/stripe-webhook`. The
catch-all `/api/:path*` rule would otherwise hand the request to `index.mjs`,
which authenticates before it routes and would reject Stripe as anonymous.

## What is not built

- Proration and mid-cycle plan switches are whatever Stripe does by default.
- Invoices and dunning emails are Stripe's, through the billing portal.
- Enterprise remains a sales conversation; it has no fixed price to sell.
- Tax is not configured. Stripe Tax is a switch in the dashboard, not code,
  but it is a decision rather than an oversight.
