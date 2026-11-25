import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildEvent,
  parseDsn,
  parseStack,
  redactMessage,
  reportError,
  routeTemplate,
} from "./monitoring.mjs";
import { createHandler } from "../index.mjs";
import { createWebhookHandler } from "../stripe-webhook.mjs";

const DSN = "https://abc123@o42.ingest.us.sentry.io/4507";

function fakeFetch(ok = true) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok };
  };
  return { calls, impl };
}

test("parseDsn builds the envelope endpoint and rejects malformed DSNs", () => {
  assert.deepEqual(parseDsn(DSN), {
    publicKey: "abc123",
    endpoint: "https://o42.ingest.us.sentry.io/api/4507/envelope/",
  });
  assert.equal(parseDsn(""), null);
  assert.equal(parseDsn("not a url"), null);
  assert.equal(parseDsn("https://o42.ingest.sentry.io/4507"), null); // no key
});

test("routes are reported as templates, never with repository or issue ids", () => {
  assert.equal(routeTemplate("issues/acme~app~12/feedback"), "issues/:id/feedback");
  assert.equal(routeTemplate("github/connection"), "github/connection");
  assert.equal(routeTemplate("repositories/acme~private-repo"), "repositories/:id");
});

test("messages lose emails, Postgres key details and tokens", () => {
  const out = redactMessage(
    'duplicate key value violates unique constraint "u" Key (email)=(ceo@acme.com) already exists; '
      + "token ghp_abcdefghijklmnopqrstuvwxyz0123456789 dsn postgres://user:pw@host/db",
  );
  assert.ok(!out.includes("ceo@acme.com"));
  assert.ok(out.includes("(email)=([redacted])"));
  assert.ok(!out.includes("ghp_abcdef"));
  assert.ok(!out.includes("user:pw"));
  assert.ok(redactMessage("x".repeat(1000)).length <= 300);
});

test("stack frames are parsed oldest-first with in_app set", () => {
  const frames = parseStack([
    "Error: boom",
    "    at inner (/var/task/api/_lib/db.mjs:10:5)",
    "    at async outer (/var/task/node_modules/pkg/index.js:3:1)",
    "    at /var/task/api/index.mjs:20:7",
  ].join("\n"));
  assert.equal(frames.length, 3);
  assert.equal(frames[0].filename, "/var/task/api/index.mjs");
  assert.equal(frames[2].function, "inner");
  assert.equal(frames[2].lineno, 10);
  assert.equal(frames[1].in_app, false);
});

test("the event carries no request, user or workspace data", () => {
  const error = Object.assign(new Error("boom for ceo@acme.com"), { code: "E1" });
  const event = buildEvent(error, {
    route: "issues/acme~app~3", status: 503, env: { VERCEL_ENV: "production" }, eventId: "e",
  });
  assert.equal(event.transaction, "/api/issues/:id");
  assert.equal(event.tags.status, "503");
  assert.equal(event.exception.values[0].value, "boom for [email]");
  for (const key of ["request", "user", "extra", "breadcrumbs", "contexts"]) {
    assert.equal(event[key], undefined, key);
  }
});

test("reportError is a no-op without a DSN", async () => {
  const fetch = fakeFetch();
  assert.equal(await reportError(new Error("x"), {}, { env: {}, fetchImpl: fetch.impl }), false);
  assert.equal(fetch.calls.length, 0);
});

test("reportError posts one envelope with auth, and never throws", async () => {
  const fetch = fakeFetch();
  const sent = await reportError(new Error("x"), { route: "summary", status: 500 }, {
    env: { SENTRY_DSN: DSN }, fetchImpl: fetch.impl,
  });
  assert.equal(sent, true);
  const [{ url, init }] = fetch.calls;
  assert.equal(url, "https://o42.ingest.us.sentry.io/api/4507/envelope/");
  assert.match(init.headers["x-sentry-auth"], /sentry_key=abc123/);
  const lines = init.body.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines.length, 3);
  assert.equal(lines[1].type, "event");
  assert.equal(lines[0].event_id, lines[2].event_id);

  const throwing = async () => { throw new Error("network down"); };
  assert.equal(
    await reportError(new Error("x"), {}, { env: { SENTRY_DSN: DSN }, fetchImpl: throwing }),
    false,
  );
});

function fakeRes() {
  return {
    statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("the API reports 5xx failures and not 4xx ones", async () => {
  const reported = [];
  const base = {
    verifyRequest: async () => ({ uid: "u" }),
    authenticateUser: async () => ({ id: "u", workspaceId: "w", role: "owner" }),
    reportError: async (error, context) => { reported.push({ error, context }); return true; },
    allowUnconfiguredDatabase: true,
  };

  const failing = createHandler({
    ...base,
    getOverviewSummary: async () => { throw new Error("db exploded"); },
    readSummary: async () => { throw new Error("db exploded"); },
  });
  const res = fakeRes();
  await failing({ method: "GET", url: "/api/index?path=nope-unknown-endpoint", query: { path: "nope-unknown-endpoint" }, headers: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(reported.length, 0, "a 404 is not reported");

  const authDown = createHandler({
    ...base,
    authenticateUser: async () => { throw new Error("pool exhausted"); },
  });
  const res2 = fakeRes();
  await authDown({ method: "GET", url: "/api/index?path=summary", query: { path: "summary" }, headers: {} }, res2);
  assert.ok(res2.statusCode >= 500);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].context.status, res2.statusCode);
});

test("a Stripe plan change that fails is reported, because it is a lost payment", async () => {
  const reported = [];
  const handler = createWebhookHandler({
    verifyWebhookSignature: () => ({ id: "evt_1", type: "checkout.session.completed" }),
    eventToPlanChange: () => ({ workspaceId: "w", plan: "pro" }),
    applyPlanChange: async () => { throw new Error("db down"); },
    reportError: async (error, context) => { reported.push(context); return true; },
    env: {},
  });
  const req = {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=x" },
    async *[Symbol.asyncIterator]() { yield Buffer.from("{}"); },
  };
  const res = fakeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(reported, [{ route: "stripe-webhook", status: 500 }]);
});

test("the browser scrubber keeps a route template and drops identity", async () => {
  const require = createRequire(import.meta.url);
  const { build } = createRequire(require.resolve("vite"))("esbuild");
  const file = fileURLToPath(new URL("../../src/lib/monitoring-scrub.ts", import.meta.url));
  const out = await build({
    entryPoints: [file], bundle: true, write: false, platform: "node", format: "esm",
    logLevel: "silent",
  });
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`
  );
  const event = mod.scrubBrowserEvent({
    user: { id: "u", email: "a@b.co", ip_address: "{{auto}}" },
    extra: { anything: 1 },
    breadcrumbs: [{ category: "fetch", data: { url: "/api/issues/acme~app~3" } }],
    request: {
      url: "https://ghic-hub.vercel.app/issues/acme~secret-repo~12?origin=x",
      headers: { "User-Agent": "x", Referer: "y" },
      cookies: "c",
    },
    exception: { values: [{ type: "TypeError", value: "failed for a@b.co" }] },
  });
  assert.deepEqual(event.request, { url: "https://ghic-hub.vercel.app/issues/:id" });
  assert.equal(event.user, undefined);
  assert.equal(event.extra, undefined);
  assert.equal(event.breadcrumbs, undefined);
  assert.equal(event.exception.values[0].value, "failed for [email]");
  assert.equal(event.exception.values[0].type, "TypeError");
});
