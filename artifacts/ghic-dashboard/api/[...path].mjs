/**
 * Single catch-all API route for the dashboard.
 *
 * Everything the generated client calls lives under /api/*, and this one
 * function serves all of it. Deliberately not one file per endpoint:
 * Vercel's Hobby plan caps a project at 12 serverless functions and the
 * client calls 42 paths, so per-route files would fail to deploy well
 * before the feature was finished.
 *
 * Two jobs:
 *
 *   1. Proxy the endpoints GHIC can actually answer, adapting its response
 *      shape to what the OpenAPI client expects. The GHIC token stays here,
 *      server-side; it is never shipped to the browser.
 *
 *   2. Answer the rest with `available: false` rather than invented data.
 *      GHIC has no notifications system, no multi-tenant organisation
 *      model, no audit log, and stores predictions rather than issue,
 *      commit, or release records. Those pages render a "not available"
 *      state instead of numbers that would look real and mean nothing.
 */

const GHIC_BASE =
  process.env.GHIC_API_URL || 'https://github-issue-classifier-dun.vercel.app';
const GHIC_TOKEN = process.env.GHIC_API_TOKEN || '';

/** Endpoints GHIC genuinely backs. Everything else -> unavailable(). */
const UNAVAILABLE = {
  notifications: 'GHIC does not have a notifications system.',
  organization: 'GHIC has no multi-tenant organisation model.',
  'audit-logs': 'GHIC does not keep an audit log.',
  'api-keys': 'GHIC authenticates with a single shared token, not per-user API keys.',
  integrations: 'No third-party integrations are configured.',
  issues:
    'GHIC stores predictions, not issue records. Recent scored issues appear on the dashboard.',
  commits:
    'Commit data lives inside the repository index and is not exposed as a list endpoint.',
  'pull-requests': 'Pull request data is not exposed as a list endpoint.',
  releases: 'Release data is not exposed as a list endpoint.',
  settings: 'GHIC is configured with environment variables, not through the dashboard.',
  search: 'Cross-repository search is not exposed yet.',
};

async function ghic(path, { token = true } = {}) {
  const headers = { accept: 'application/json' };
  if (token && GHIC_TOKEN) headers['X-GHIC-Token'] = GHIC_TOKEN;
  const res = await fetch(`${GHIC_BASE}${path}`, { headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const error = new Error(`GHIC ${path} -> ${res.status}`);
    error.status = res.status;
    error.detail = detail.slice(0, 200);
    throw error;
  }
  return res.json();
}

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Epoch/ISO -> true when the timestamp falls on today (UTC). */
function isToday(value) {
  if (!value) return false;
  const t = typeof value === 'number' ? value * 1000 : Date.parse(value);
  if (!Number.isFinite(t)) return false;
  const now = new Date();
  const d = new Date(t);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

/**
 * Metrics GHIC does not track are returned as null, not 0.
 *
 * A zero reads as "we measured this and it was none"; null lets the UI
 * distinguish "no data" from "no occurrences". Inventing a plausible
 * number here is exactly the failure this dashboard is being wired up to
 * avoid.
 */
async function dashboardStats() {
  const [health, stats, repos] = await Promise.allSettled([
    ghic('/healthz', { token: false }),
    ghic('/stats'),
    ghic('/repositories'),
  ]);

  const h = health.status === 'fulfilled' ? health.value : {};
  const s = stats.status === 'fulfilled' ? stats.value : {};
  const r = repos.status === 'fulfilled' ? repos.value : {};

  // Whether the token-gated calls actually succeeded. Without this a
  // missing or wrong GHIC_API_TOKEN renders as a dashboard full of zeros
  // — indistinguishable from a quiet day, and the more damaging reading of
  // the two. Failed fetches yield null, which the UI shows as "—".
  const haveStats = stats.status === 'fulfilled';
  const haveRepos = repos.status === 'fulfilled';

  const recent = Array.isArray(s.recent) ? s.recent : [];
  const scoredToday = haveStats ? recent.filter((x) => isToday(x.at)).length : null;
  const totals = s.totals || {};
  const latency = (s.latency && (s.latency['/webhook'] || s.latency['POST /webhook'])) || {};
  const ri = h.repository_intelligence || {};

  return {
    repositoriesConnected: haveRepos && Array.isArray(r.repositories)
      ? r.repositories.length
      : null,
    openIssues: haveStats ? num(totals.scored) : null,
    issuesToday: scoredToday,
    resolvedToday: null,
    aiAnalysesToday: scoredToday,
    highPriorityIssues: haveStats ? num(totals.positive) : null,
    regressions: null,
    duplicateCandidates: null,
    repositoryHealthScore: null,
    engineeringRiskScore: null,
    averageAiProcessingTime: num(latency.p50, null),
    githubApiUsage: null,
    llmUsage: null,
    embeddingUsage: null,
    queueStatus: ri.queue_durable ? 'healthy' : 'not configured',
    webhookStatus: h.status === 'ok' ? 'healthy' : 'degraded',
  };
}

async function recentActivity() {
  const s = await ghic('/stats');
  const recent = Array.isArray(s.recent) ? s.recent : [];
  return recent
    .slice()
    .reverse()
    .slice(0, 25)
    .map((x, i) => ({
      id: `${x.repo}#${x.issue}-${i}`,
      type: 'issue_scored',
      repository: x.repo,
      issueNumber: x.issue,
      title: `Issue #${x.issue} scored ${Math.round((x.proba ?? 0) * 100)}%`,
      description: `Classified as ${x.predicted}`,
      timestamp: x.at,
    }));
}

/**
 * Alerts are derived from health, not stored.
 *
 * GHIC has no alerting subsystem, but "the webhook is down" and "no
 * repository is indexed" are real, checkable conditions worth surfacing —
 * so they are computed from /healthz rather than faked or omitted.
 */
async function alerts() {
  const out = [];
  try {
    const h = await ghic('/healthz', { token: false });
    const ri = h.repository_intelligence;
    if (h.status !== 'ok') {
      out.push({
        id: 'service-degraded',
        severity: 'critical',
        title: 'GHIC service degraded',
        description: `Health endpoint reported "${h.status}".`,
        timestamp: new Date().toISOString(),
      });
    }
    if (ri && ri.enabled && ri.can_index === false) {
      out.push({
        id: 'cannot-index',
        severity: 'warning',
        title: 'Automatic indexing unavailable',
        description:
          ri.indexing_note || 'git is not available in this runtime; index out of band.',
        timestamp: new Date().toISOString(),
      });
    }
    // A missing token is an operator mistake that otherwise looks like an
    // idle system, so it is surfaced as an alert rather than left to be
    // inferred from empty panels.
    if (!GHIC_TOKEN) {
      out.push({
        id: 'token-missing',
        severity: 'critical',
        title: 'GHIC API token not configured',
        description:
          'GHIC_API_TOKEN is not set on this deployment, so authenticated metrics ' +
          '(stats, repositories, analytics) cannot be read. Set it in the project ' +
          'environment — it is the same value as GHIC_WEBHOOK_SECRET.',
        timestamp: new Date().toISOString(),
      });
    } else {
      try {
        await ghic('/stats');
      } catch (tokenError) {
        if (tokenError.status === 401) {
          out.push({
            id: 'token-invalid',
            severity: 'critical',
            title: 'GHIC API token rejected',
            description:
              'GHIC returned 401 for authenticated endpoints. The configured ' +
              'GHIC_API_TOKEN does not match GHIC_WEBHOOK_SECRET.',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
    if (ri && ri.enabled && ri.state_durable === false) {
      out.push({
        id: 'state-not-durable',
        severity: 'warning',
        title: 'Repository state is not durable',
        description: 'Index state will not survive a restart on this deployment.',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (e) {
    out.push({
      id: 'unreachable',
      severity: 'critical',
      title: 'Cannot reach GHIC',
      description: String(e.message || e),
      timestamp: new Date().toISOString(),
    });
  }
  return out;
}

async function systemHealth() {
  const h = await ghic('/healthz', { token: false });
  const ri = h.repository_intelligence || {};
  return {
    status: h.status === 'ok' ? 'healthy' : 'degraded',
    version: h.version || 'unknown',
    model: h.model || 'unknown',
    dryRun: Boolean(h.dry_run),
    components: [
      { name: 'Webhook', status: h.status === 'ok' ? 'healthy' : 'degraded' },
      { name: 'Model', status: h.model ? 'healthy' : 'degraded', detail: h.model },
      {
        name: 'Repository intelligence',
        status: ri.enabled ? (ri.can_index ? 'healthy' : 'degraded') : 'disabled',
        detail: ri.enabled ? `${ri.vector_provider} vectors` : 'not enabled',
      },
      {
        name: 'Index queue',
        status: ri.queue_durable ? 'healthy' : 'disabled',
        detail: ri.queue || 'none',
      },
    ],
  };
}

async function repositories() {
  const r = await ghic('/repositories');
  if (!r.enabled) return { repositories: [], available: false };
  return {
    repositories: (r.repositories || []).map((x) => ({
      id: x.repo,
      name: x.name || x.repo,
      owner: x.owner || '',
      fullName: x.repo,
      status: x.state,
      primaryLanguage: x.primary_language || null,
      frameworks: x.frameworks || [],
      chunkCount: num(x.chunk_count),
      fileCount: num(x.file_count),
      healthScore: x.metadata?.health_index ?? null,
      lastIndexedAt: x.indexed_at ? new Date(x.indexed_at * 1000).toISOString() : null,
      retrievalCount: num(x.retrieval_count),
      hitRate: x.hit_rate ?? null,
      lastError: x.last_error || null,
    })),
  };
}

async function repositoryAnalytics(repo) {
  const a = await ghic(`/automation/repository-analytics?repo=${encodeURIComponent(repo)}`);
  return a;
}

function unavailable(feature, reason) {
  return {
    available: false,
    feature,
    reason,
    // Empty collections so a page that maps over results renders its own
    // empty state rather than throwing on undefined.
    items: [],
    data: [],
  };
}

export default async function handler(req, res) {
  // The dashboard and this function are the same deployment and same
  // origin, so no CORS is needed. Kept read-only: every mutating route the
  // client defines (approve, reject, toggle, reindex, patch) has no GHIC
  // equivalent, and inventing one would let the UI claim it did something
  // it did not.
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'This dashboard API is read-only.' });
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const [head, ...rest] = path.split('/');

  try {
    let body;
    switch (true) {
      case path === 'dashboard/stats':
        body = await dashboardStats();
        break;
      case path === 'dashboard/recent-activity':
        body = await recentActivity();
        break;
      case path === 'dashboard/alerts':
        body = await alerts();
        break;
      case path === 'system-health' || path === 'healthz':
        body = await systemHealth();
        break;
      case path === 'repositories':
        body = await repositories();
        break;
      case head === 'repositories' && rest[1] === 'analytics':
        body = await repositoryAnalytics(decodeURIComponent(rest[0]));
        break;
      case path === 'components': {
        const repo = url.searchParams.get('repo');
        body = repo
          ? (await repositoryAnalytics(repo)).components || []
          : unavailable('components', 'Select a repository to see component health.');
        break;
      }
      case path === 'duplicates': {
        const repo = url.searchParams.get('repo');
        body = repo
          ? (await repositoryAnalytics(repo)).clusters || []
          : unavailable('duplicates', 'Select a repository to see duplicate clusters.');
        break;
      }
      case path === 'analytics/overview': {
        const s = await ghic('/stats');
        body = {
          totals: s.totals || {},
          onlineEvaluation: s.online_evaluation || null,
          latency: s.latency || {},
          errors: num(s.errors_5xx),
          analytics: s.analytics || null,
        };
        break;
      }
      case head in UNAVAILABLE:
        body = unavailable(head, UNAVAILABLE[head]);
        break;
      default:
        res.status(404).json({ error: `Unknown endpoint: /${path}` });
        return;
    }

    // Short cache: the dashboard polls, and GHIC's own endpoints are not
    // free. Stale-while-revalidate keeps it feeling live without hammering.
    res.setHeader('cache-control', 's-maxage=15, stale-while-revalidate=60');
    res.status(200).json(body);
  } catch (e) {
    // A GHIC failure is reported as such rather than as dashboard data.
    res.status(e.status === 401 ? 401 : 502).json({
      error: 'Could not reach GHIC',
      detail: e.detail || String(e.message || e),
      hint:
        e.status === 401
          ? 'GHIC_API_TOKEN is missing or wrong in this project\'s environment.'
          : undefined,
    });
  }
}
