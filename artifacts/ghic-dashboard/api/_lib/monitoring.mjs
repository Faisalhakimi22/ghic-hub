/**
 * Server error reporting for the Hub API. Inert unless SENTRY_DSN is set.
 *
 * Deliberately not @sentry/node: that SDK brings OpenTelemetry, which a
 * serverless function pays for on every cold start, and the Hub needs one
 * thing from it -- "this request failed with a 5xx, here is the stack".
 * This posts one event to Sentry's documented envelope endpoint instead.
 *
 * Nothing that identifies a customer leaves: no request body, headers,
 * cookies, query string, user or workspace id. The route is reported as a
 * template (`issues/:id/feedback`), and the error message is cut short with
 * emails, key/value details from Postgres errors, and token-like strings
 * redacted.
 *
 * Never throws, and waits at most `timeoutMs`: a serverless function is
 * frozen once it responds, so the report has to finish first, and an
 * unreachable Sentry must not turn into a slow error page.
 */

const DEFAULT_TIMEOUT_MS = 1500;
const MAX_MESSAGE = 300;
const MAX_FRAMES = 40;

export function parseDsn(dsn) {
  try {
    const url = new URL(String(dsn || "").trim());
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "").split("/").pop();
    if (!url.username || !projectId || !/^\d+$/.test(projectId)) return null;
    return {
      publicKey: decodeURIComponent(url.username),
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

/** `issues/acme~app~12/feedback` -> `issues/:id/feedback`. */
export function routeTemplate(path) {
  return String(path || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => (/^[a-z][a-z-]*$/.test(segment) ? segment : ":id"))
    .join("/");
}

export function redactMessage(message) {
  return String(message || "")
    // Postgres detail: Key (email)=(someone@example.com) already exists.
    .replace(/\(([^()]*)\)=\(([^()]*)\)/g, "($1)=([redacted])")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@[^\s]+/gi, "[url-with-credentials]")
    .replace(/\b(?:gh[pousr]_|github_pat_|sk_(?:live|test)_|rk_(?:live|test)_|whsec_|npg_)[A-Za-z0-9_]+/g, "[token]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
    .slice(0, MAX_MESSAGE);
}

/** V8 stack -> Sentry frames, oldest call first (Sentry's order). */
export function parseStack(stack) {
  const frames = [];
  for (const line of String(stack || "").split("\n").slice(1)) {
    const match =
      line.match(/^\s*at (.+?) \((.+):(\d+):(\d+)\)\s*$/) ||
      line.match(/^\s*at ()(.+):(\d+):(\d+)\s*$/);
    if (!match) continue;
    const [, fn, file, lineno, colno] = match;
    frames.push({
      function: fn || "?",
      filename: file,
      lineno: Number(lineno),
      colno: Number(colno),
      in_app: !file.includes("node_modules") && !file.startsWith("node:"),
    });
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames.reverse();
}

export function buildEvent(error, { route = "", status = 500, env = process.env, now = Date.now(), eventId } = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    event_id: eventId || crypto.randomUUID().replace(/-/g, ""),
    timestamp: now / 1000,
    platform: "node",
    level: "error",
    logger: "ghic-hub-api",
    environment: env.VERCEL_ENV || env.NODE_ENV || "production",
    release: env.VERCEL_GIT_COMMIT_SHA || undefined,
    transaction: route ? `/api/${routeTemplate(route)}` : undefined,
    tags: { status: String(status), ...(err.code ? { code: String(err.code).slice(0, 64) } : {}) },
    exception: {
      values: [{
        type: err.name || "Error",
        value: redactMessage(err.message),
        stacktrace: { frames: parseStack(err.stack) },
      }],
    },
  };
}

export async function reportError(error, context = {}, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const dsn = parseDsn(env.SENTRY_DSN);
  if (!dsn || typeof fetchImpl !== "function") return false;
  try {
    const event = buildEvent(error, { ...context, env });
    const body = [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n") + "\n";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(dsn.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-sentry-envelope",
          "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=ghic-hub/1.0`,
        },
        body,
        signal: controller.signal,
      });
      return Boolean(response?.ok);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}
