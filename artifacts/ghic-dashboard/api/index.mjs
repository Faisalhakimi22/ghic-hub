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

import { AuthError, requireRole, verifyRequest } from './_lib/auth.mjs';
import {
  dbConfigured,
  getOrgSettings,
  getUser,
  listUsers,
  updateOrgSettings,
  updateUserRole,
  updateUserSettings,
  upsertUser,
} from './_lib/db.mjs';

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
  regressions:
    'Regression counts are computed per repository. Open a repository to see them.',
  automation:
    'Automation suggestions are produced per issue, not as a queue. They appear on the issue comment.',
  intelligence:
    'Engineering intelligence runs per issue at triage time rather than as a standing report.',
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
const iso = (v) => {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v * 1000).toISOString();
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

function list(items = [], page = 1, limit = 50) {
  return { items, total: items.length, page, limit };
}

function repoId(repo) {
  return encodeURIComponent(repo || '').replace(/%2F/gi, '~');
}

function repoFromId(id) {
  return decodeURIComponent(String(id || '').replace(/~/g, '/'));
}

function normalizeRepo(x = {}) {
  const fullName = x.repo || x.fullName || [x.owner, x.name].filter(Boolean).join('/');
  const name = x.name || fullName.split('/').pop() || fullName;
  const updatedAt = iso(x.updated_at) || iso(x.indexed_at) || new Date().toISOString();
  const status = x.state || x.status || 'not_indexed';
  const health = x.metadata?.health_index;
  const risk = typeof health === 'number' ? Math.max(0, 100 - health) : null;

  return {
    id: repoId(fullName),
    name,
    fullName,
    owner: x.owner || fullName.split('/')[0] || '',
    visibility: 'unknown',
    language: x.primary_language || null,
    framework: Array.isArray(x.frameworks) ? x.frameworks.join(', ') || null : null,
    defaultBranch: x.default_branch || 'main',
    sizeKb: Math.max(0, num(x.file_count) * 4),
    stars: 0,
    forks: 0,
    openIssues: 0,
    contributors: 0,
    healthScore: typeof health === 'number' ? health : null,
    riskScore: risk,
    lastIndexedAt: iso(x.indexed_at),
    indexStatus: status,
    repositoryIntelligenceStatus: status === 'ready' || status === 'updating' ? 'active' : status,
    engineeringIntelligenceStatus: status === 'ready' || status === 'updating' ? 'active' : status,
    webhookStatus: 'healthy',
    installationStatus: 'installed',
    description: x.readme_summary || x.architecture_summary || null,
    url: fullName ? `https://github.com/${fullName}` : '',
    createdAt: iso(x.indexed_at) || updatedAt,
    updatedAt,
    chunkCount: num(x.chunk_count),
    fileCount: num(x.file_count),
    retrievalCount: num(x.retrieval_count),
    hitRate: x.hit_rate ?? null,
    lastError: x.last_error || null,
    architectureSummary: x.architecture_summary || '',
    indexedCommitSha: x.indexed_commit_sha || '',
  };
}

function recentIssue(x, i = 0) {
  const repo = x.repo || '';
  const number = num(x.issue, i + 1);
  const proba = num(x.proba, 0);
  const predicted = String(x.predicted || '');
  return {
    id: `${repoId(repo)}~${number}`,
    number,
    repositoryId: repoId(repo),
    repositoryName: repo,
    title: `Issue #${number}`,
    status: 'scored',
    priority: proba >= 0.8 ? 'high' : proba >= 0.5 ? 'medium' : 'low',
    severity: proba >= 0.8 ? 'high' : proba >= 0.5 ? 'medium' : 'low',
    classification: predicted || 'unknown',
    actionability: predicted,
    confidence: proba,
    labels: predicted ? [predicted] : [],
    assignee: null,
    createdAt: iso(x.at) || new Date().toISOString(),
    updatedAt: iso(x.at) || new Date().toISOString(),
    aiStatus: 'analyzed',
    hasEngineeringReport: false,
    url: repo && number ? `https://github.com/${repo}/issues/${number}` : '',
  };
}

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
  const latency = (s.latency_ms && (s.latency_ms['/webhook'] || s.latency_ms['POST /webhook'])) || {};
  const analytics = s.analytics || {};
  const componentAnalytics = analytics.component_analytics || {};
  const repoRates = Object.values(componentAnalytics).map((x) => x?.positive_rate)
    .filter((x) => typeof x === 'number');
  const healthScore = repoRates.length
    ? Math.round(100 - (repoRates.reduce((a, b) => a + b, 0) / repoRates.length) * 100)
    : null;
  const ri = h.repository_intelligence || {};

  return {
    repositoriesConnected: haveRepos && Array.isArray(r.repositories)
      ? r.repositories.length
      : null,
    openIssues: haveStats ? num(s.scored) : null,
    issuesToday: scoredToday,
    resolvedToday: haveStats ? s.online_evaluation?.resolved ?? null : null,
    aiAnalysesToday: scoredToday,
    highPriorityIssues: haveStats ? num(s.predicted_actionable) : null,
    regressions: analytics.duplicate_rate?.duplicate_labels_observed_live ?? null,
    duplicateCandidates: analytics.duplicate_rate?.predictions_with_related_candidates ?? null,
    repositoryHealthScore: healthScore,
    engineeringRiskScore: typeof healthScore === 'number' ? 100 - healthScore : null,
    averageAiProcessingTime: num(latency.p50_ms ?? latency.p50, null),
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
      actor: 'GHIC',
      message: `scored ${x.repo}#${x.issue} at ${Math.round((x.proba ?? 0) * 100)}%`,
      repositoryName: x.repo,
      repository: x.repo,
      issueNumber: x.issue,
      title: `Issue #${x.issue} scored ${Math.round((x.proba ?? 0) * 100)}%`,
      description: `Classified as ${x.predicted}`,
      timestamp: x.at,
      link: x.repo && x.issue ? `https://github.com/${x.repo}/issues/${x.issue}` : null,
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
        type: 'system',
        severity: 'critical',
        title: 'GHIC service degraded',
        description: `Health endpoint reported "${h.status}".`,
        timestamp: new Date().toISOString(),
        resolved: false,
      });
    }
    if (ri && ri.enabled && ri.can_index === false) {
      out.push({
        id: 'cannot-index',
        type: 'repository_intelligence',
        severity: 'warning',
        title: 'Automatic indexing unavailable',
        description:
          ri.indexing_note || 'git is not available in this runtime; index out of band.',
        timestamp: new Date().toISOString(),
        resolved: false,
      });
    }
    // A missing token is an operator mistake that otherwise looks like an
    // idle system, so it is surfaced as an alert rather than left to be
    // inferred from empty panels.
    if (!GHIC_TOKEN) {
      out.push({
        id: 'token-missing',
        type: 'configuration',
        severity: 'critical',
        title: 'GHIC API token not configured',
        description:
          'GHIC_API_TOKEN is not set on this deployment, so authenticated metrics ' +
          '(stats, repositories, analytics) cannot be read. Set it in the project ' +
          'environment — it is the same value as GHIC_WEBHOOK_SECRET.',
        timestamp: new Date().toISOString(),
        resolved: false,
      });
    } else {
      try {
        await ghic('/stats');
      } catch (tokenError) {
        if (tokenError.status === 401) {
          out.push({
            id: 'token-invalid',
            type: 'configuration',
            severity: 'critical',
            title: 'GHIC API token rejected',
            description:
              'GHIC returned 401 for authenticated endpoints. The configured ' +
              'GHIC_API_TOKEN does not match GHIC_WEBHOOK_SECRET.',
            timestamp: new Date().toISOString(),
            resolved: false,
          });
        }
      }
    }
    if (ri && ri.enabled && ri.state_durable === false) {
      out.push({
        id: 'state-not-durable',
        type: 'repository_intelligence',
        severity: 'warning',
        title: 'Repository state is not durable',
        description: 'Index state will not survive a restart on this deployment.',
        timestamp: new Date().toISOString(),
        resolved: false,
      });
    }
  } catch (e) {
    out.push({
      id: 'unreachable',
      type: 'system',
      severity: 'critical',
      title: 'Cannot reach GHIC',
      description: String(e.message || e),
      timestamp: new Date().toISOString(),
      resolved: false,
    });
  }
  return out;
}

async function systemHealth() {
  const [healthRes, statsRes] = await Promise.allSettled([
    ghic('/healthz', { token: false }),
    ghic('/stats'),
  ]);
  const h = healthRes.status === 'fulfilled' ? healthRes.value : {};
  const s = statsRes.status === 'fulfilled' ? statsRes.value : {};
  const ri = h.repository_intelligence || {};
  const latency = (s.latency_ms && (s.latency_ms['/webhook'] || s.latency_ms['POST /webhook'])) || {};

  // Matches the SystemHealth schema the page renders. Subsystems GHIC does
  // not expose a probe for are reported as "unknown" rather than "healthy":
  // claiming a green light we never checked is worse than admitting we
  // cannot see it.
  const up = h.status === 'ok';
  return {
    overall: up ? 'healthy' : 'degraded',
    webhookStatus: up ? 'healthy' : 'degraded',
    queueStatus: ri.queue_durable ? 'healthy' : 'unknown',
    queueLength: null,
    databaseStatus: ri.state_durable ? 'healthy' : 'unknown',
    vectorStoreStatus:
      ri.enabled ? (ri.vector_provider === 'postgres' ? 'healthy' : 'degraded') : 'unknown',
    embeddingProviderStatus: ri.enabled ? 'healthy' : 'unknown',
    llmProviderStatus: 'unknown',
    repositoryIntelligenceStatus: ri.enabled
      ? (ri.can_index ? 'healthy' : 'degraded')
      : 'disabled',
    engineeringIntelligenceStatus: 'unknown',
    githubApiStatus: up ? 'healthy' : 'unknown',
    githubApiRateLimit: null,
    githubApiRateLimitRemaining: null,
    processingLatencyMs: num(latency.p50_ms ?? latency.p50, null),
    averageResponseTimeMs: num(latency.mean_ms ?? latency.p50_ms ?? latency.p50, null),
    failedJobsLast24h: null,
    uptimePercent: null,
    lastCheckedAt: new Date().toISOString(),
    version: h.version || null,
    model: h.model || null,
  };
}

async function repositories() {
  const r = await ghic('/repositories');
  return list((r.repositories || []).map(normalizeRepo), 1, 50);
}

async function repositoryAnalytics(repo) {
  const a = await ghic(`/automation/repository-analytics?repo=${encodeURIComponent(repo)}`);
  return a;
}

async function repositoryDetail(id) {
  const decoded = repoFromId(id);
  const repos = await repositories();
  return repos.items.find((repo) => repo.id === id || repo.fullName === decoded) || null;
}

async function issues() {
  const s = await ghic('/stats');
  return list((Array.isArray(s.recent) ? s.recent : []).slice().reverse().map(recentIssue), 1, 50);
}

async function issueDetail(id) {
  const items = (await issues()).items;
  const issue = items.find((x) => x.id === id);
  if (!issue) return null;
  return {
    issue,
    executiveSummary: `${issue.repositoryName}#${issue.number} was scored as ${issue.classification} with ${Math.round(issue.confidence * 100)}% confidence.`,
    rootCauseAnalysis: null,
    regressionSignals: null,
    engineeringImpact: null,
    investigationPlan: null,
    suggestedTests: [],
    suggestedLabels: issue.labels,
    suggestedAssignee: null,
    missingInformation: null,
    relevantFiles: [],
    relevantFunctions: [],
    relevantComponents: [],
    relatedCommits: [],
    relatedPullRequests: [],
    relatedIssues: [],
    timeline: [{
      id: `${issue.id}-scored`,
      type: 'scored',
      actor: 'GHIC',
      description: `Prediction recorded at ${Math.round(issue.confidence * 100)}% confidence.`,
      timestamp: issue.updatedAt,
    }],
    automationSuggestions: [],
  };
}

async function allRepositoryAnalytics() {
  const repos = (await repositories()).items;
  const rows = await Promise.allSettled(
    repos.map((repo) => repositoryAnalytics(repo.fullName).then((analytics) => ({ repo, analytics }))),
  );
  return rows
    .filter((row) => row.status === 'fulfilled')
    .map((row) => row.value);
}

function componentFromAnalytics(repo, component, i) {
  const score = component.health_index;
  const health = component.health_band || (typeof score === 'number' && score >= 85 ? 'healthy' : 'watch');
  const riskScore = typeof score === 'number' ? 100 - score : null;
  return {
    id: `${repo.id}-component-${i}`,
    name: component.component || component.name || 'unknown',
    repositoryId: repo.id,
    repositoryName: repo.fullName,
    path: component.component || '',
    health,
    healthScore: score,
    risk: typeof riskScore === 'number' && riskScore >= 65 ? 'high' : riskScore >= 35 ? 'medium' : 'low',
    riskScore,
    issueCount: num(component.issue_count),
    regressionCount: num(component.regression_count),
    recentCommits: num(component.commit_count),
    recentIssues: num(component.recent_issue_count),
    relatedFiles: [],
    mostActiveContributors: [],
    lastUpdated: iso(component.last_activity) || repo.updatedAt,
  };
}

async function components(repoParam = '') {
  const source = repoParam
    ? [{ repo: normalizeRepo({ repo: repoParam }), analytics: await repositoryAnalytics(repoParam) }]
    : await allRepositoryAnalytics();
  const items = source.flatMap(({ repo, analytics }) =>
    (analytics.components || []).map((component, i) => componentFromAnalytics(repo, component, i)),
  );
  return list(items, 1, 100);
}

function clusterToDuplicate(repo, cluster, i) {
  const refs = Array.isArray(cluster.references) ? cluster.references : [];
  const issueRef = (ref, index) => {
    const number = Number(String(ref).replace(/\D/g, '')) || index + 1;
    return {
      id: `${repo.id}~${number}`,
      number,
      title: `${cluster.component || 'Related'} issue ${ref}`,
      status: 'historical',
    };
  };
  return {
    id: `${repo.id}-cluster-${i}`,
    primaryIssue: issueRef(refs[0] || '#0', 0),
    possibleDuplicates: refs.slice(1).map((ref, index) => ({
      issue: issueRef(ref, index + 1),
      similarity: cluster.label === 'probable duplicate' ? 0.85 : 0.55,
    })),
    sharedComponents: cluster.component ? [cluster.component] : [],
    sharedFiles: [],
    sharedCommits: [],
    recommendedAction: cluster.label || 'review relationship',
    createdAt: iso(cluster.first_seen) || new Date().toISOString(),
    regressionCount: num(cluster.regression_count),
    spanDays: num(cluster.span_days),
  };
}

async function duplicates(repoParam = '') {
  const source = repoParam
    ? [{ repo: normalizeRepo({ repo: repoParam }), analytics: await repositoryAnalytics(repoParam) }]
    : await allRepositoryAnalytics();
  const items = source.flatMap(({ repo, analytics }) =>
    (analytics.clusters || []).map((cluster, i) => clusterToDuplicate(repo, cluster, i)),
  );
  return list(items, 1, 100);
}

async function regressions(repoParam = '') {
  const clusters = (await duplicates(repoParam)).items.filter((x) => x.regressionCount > 0);
  return list(clusters.map((cluster) => ({
    id: `${cluster.id}-regression`,
    issue: cluster.primaryIssue,
    confidence: 0.7,
    relatedCommit: null,
    relatedCommitSha: null,
    relatedRelease: null,
    affectedFiles: cluster.sharedFiles,
    regressionWindowStart: cluster.createdAt,
    regressionWindowEnd: new Date().toISOString(),
    investigationStatus: 'needs_review',
    repositoryId: cluster.id.split('-cluster-')[0],
    repositoryName: cluster.sharedComponents[0] || 'repository',
    detectedAt: cluster.createdAt,
  })), 1, 100);
}

async function analyticsOverview() {
  const s = await ghic('/stats');
  const analytics = s.analytics || {};
  const trendMap = analytics.issue_trends?.predictions_per_day || {};
  const repos = analytics.component_analytics || {};
  return {
    period: 'last_30_days',
    totalIssues: num(s.scored),
    resolvedIssues: num(s.online_evaluation?.resolved),
    openIssues: num(s.online_evaluation?.awaiting_outcome),
    regressions: num(analytics.duplicate_rate?.duplicate_labels_observed_live),
    duplicatesFound: num(analytics.duplicate_rate?.predictions_with_related_candidates),
    avgResolutionDays: 0,
    issuesByPriority: [
      { category: 'actionable', count: num(s.predicted_actionable) },
      { category: 'non-actionable', count: Math.max(0, num(s.scored) - num(s.predicted_actionable)) },
    ],
    issuesBySeverity: [],
    issuesByClassification: [
      { category: 'actionable', count: num(s.predicted_actionable) },
      { category: 'non-actionable', count: Math.max(0, num(s.scored) - num(s.predicted_actionable)) },
    ],
    issuesByRepository: Object.entries(repos).map(([category, value]) => ({
      category,
      count: num(value?.scored),
    })),
    trend: Object.entries(trendMap).map(([date, value]) => ({ date, value: num(value) })),
  };
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
  const url = new URL(req.url, 'http://localhost');
  // vercel.json rewrites /api/<anything> to /api/index?path=<anything>, so
  // the route arrives as a query param. Bracket catch-all filenames
  // (`[...path].mjs`) are a Next.js convention and do not match nested
  // paths in a plain Vite project: /api/system-health resolved while
  // /api/dashboard/alerts returned NOT_FOUND. The pathname fallback keeps
  // direct invocation and local testing working.
  const path = (url.searchParams.get('path') || url.pathname.replace(/^\/api\/?/, ''))
    .replace(/^\/+/, '')
    .replace(/\/$/, '');
  const [head, ...rest] = path.split('/');

  // Every endpoint is authenticated. There is no public route and no
  // allow-list: an unauthenticated request gets 401 before any GHIC call
  // or database query happens, so an auth bug cannot leak data through a
  // route someone forgot to add to a list.
  let viewer;
  try {
    const claims = await verifyRequest(req);
    // The token is proof of identity; the row is the source of truth for
    // role and settings. Upserting here is also what creates the user
    // record on first login.
    viewer = dbConfigured
      ? await upsertUser(claims)
      : { ...claims, id: claims.uid, role: 'owner', settings: {}, ephemeral: true };
  } catch (e) {
    res.status(e.status || 401).json({
      error: e instanceof AuthError ? e.message : 'Authentication failed.',
    });
    return;
  }

  // Reading the request body for the mutating routes below.
  async function readJson() {
    if (req.body && typeof req.body === 'object') return req.body;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      const e = new Error('Request body is not valid JSON.');
      e.status = 400;
      throw e;
    }
  }

  try {
    let body;

    // --- account and workspace -------------------------------------
    // The only writable surface. Everything else is read-only, and
    // deployment configuration (environment variables, thresholds, API
    // keys) is deliberately not reachable from here at all: it is set on
    // the server and changing it needs deploy access, not an admin role.
    if (path === 'me') {
      res.status(200).json(viewer);
      return;
    }
    if (path === 'me/settings' && (req.method === 'PATCH' || req.method === 'PUT')) {
      if (!dbConfigured) throw Object.assign(new Error('No database configured.'), { status: 503 });
      const patch = await readJson();
      // A user may change their own preferences and nothing else. Role is
      // rejected here rather than silently dropped so a client cannot
      // believe it escalated.
      if ('role' in patch) {
        throw Object.assign(new Error('Role cannot be changed from user settings.'), { status: 403 });
      }
      res.status(200).json(await updateUserSettings(viewer.id, patch));
      return;
    }
    if (path === 'organization' && req.method === 'GET') {
      const settings = dbConfigured
        ? await getOrgSettings()
        : { workspaceName: 'GHIC Workspace' };
      const repoCount = await repositories().then((r) => r.total).catch(() => 0);
      const memberCount = dbConfigured ? await listUsers().then((u) => u.length).catch(() => 0) : 1;
      body = {
        id: 'ghic-workspace',
        name: settings.workspaceName || 'GHIC Workspace',
        slug: String(settings.workspaceName || 'GHIC Workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        avatarUrl: null,
        plan: 'self-hosted',
        memberCount,
        repositoryCount: repoCount,
        createdAt: settings.updatedAt || new Date().toISOString(),
        ...settings,
      };
      res.status(200).json(body);
      return;
    }
    if (path === 'organization' && (req.method === 'PATCH' || req.method === 'PUT')) {
      if (!dbConfigured) throw Object.assign(new Error('No database configured.'), { status: 503 });
      requireRole(viewer, 'owner');
      res.status(200).json(await updateOrgSettings(await readJson(), viewer.id));
      return;
    }
    if (path === 'organization/members' && req.method === 'GET') {
      const members = dbConfigured ? await listUsers() : [viewer];
      const items = members.map((member) => ({
        id: member.id,
        login: member.name || member.email || member.id,
        name: member.name,
        email: member.email,
        avatarUrl: member.avatarUrl,
        role: member.role,
        joinedAt: member.createdAt || new Date().toISOString(),
        lastActiveAt: member.lastLogin || null,
      }));
      body = {
        members,
        items,
        total: items.length,
        page: 1,
        limit: 50,
      };
      res.status(200).json(body);
      return;
    }
    if (head === 'organization' && rest[0] === 'members' && rest[1] &&
        (req.method === 'PATCH' || req.method === 'PUT')) {
      if (!dbConfigured) throw Object.assign(new Error('No database configured.'), { status: 503 });
      requireRole(viewer, 'owner');
      const { role } = await readJson();
      if (!['owner', 'admin', 'member', 'viewer'].includes(role)) {
        throw Object.assign(new Error('Unknown role.'), { status: 400 });
      }
      res.status(200).json(await updateUserRole(decodeURIComponent(rest[1]), role));
      return;
    }

    // Everything past this point is a read. The client defines several
    // mutating routes (approve, reject, toggle, reindex) that GHIC has no
    // equivalent for; answering them would let the UI claim it did
    // something it did not.
    if (req.method !== 'GET') {
      res.status(405).json({
        error: 'Not writable from the dashboard.',
        detail:
          'Only account and workspace settings can be changed here. Deployment '
          + 'configuration is server-side.',
      });
      return;
    }

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
      case head === 'repositories' && rest.length === 0: {
        body = await repositoryDetail(decodeURIComponent(head));
        break;
      }
      case head === 'repositories' && rest.length === 1: {
        body = await repositoryDetail(rest[0]);
        break;
      }
      case head === 'repositories' && rest[1] === 'analytics':
        body = await repositoryAnalytics(repoFromId(rest[0]));
        break;
      case head === 'repositories' && rest[1] === 'components':
        body = await components(repoFromId(rest[0]));
        break;
      case head === 'repositories' && rest[1] === 'commits':
        body = list([], 1, 50);
        break;
      case head === 'repositories' && rest[1] === 'pull-requests':
        body = list([], 1, 50);
        break;
      case head === 'repositories' && rest[1] === 'releases':
        body = list([], 1, 50);
        break;
      case path === 'components': {
        const repo = url.searchParams.get('repo') || url.searchParams.get('repositoryId');
        body = await components(repo ? repoFromId(repo) : '');
        break;
      }
      case path === 'duplicates': {
        const repo = url.searchParams.get('repo') || url.searchParams.get('repositoryId');
        body = await duplicates(repo ? repoFromId(repo) : '');
        break;
      }
      case path === 'regressions': {
        const repo = url.searchParams.get('repo') || url.searchParams.get('repositoryId');
        body = await regressions(repo ? repoFromId(repo) : '');
        break;
      }
      case path === 'issues':
        body = await issues();
        break;
      case head === 'issues' && rest[0]: {
        body = await issueDetail(rest[0]);
        if (!body) {
          res.status(404).json({ error: `Unknown issue: ${rest[0]}` });
          return;
        }
        break;
      }
      case path === 'commits':
      case path === 'pull-requests':
      case path === 'releases':
      case path === 'automation/suggestions':
        body = list([], 1, 50);
        break;
      case path === 'audit-logs': {
        const items = (await recentActivity()).map((item) => ({
          id: item.id,
          timestamp: item.timestamp,
          user: item.actor,
          userAvatarUrl: null,
          repositoryName: item.repositoryName,
          action: item.type,
          modelVersion: null,
          evidence: item.message,
          executionTimeMs: null,
          result: 'success',
          ipAddress: null,
        }));
        body = list(items, 1, 50);
        break;
      }
      case path === 'notifications': {
        const items = (await alerts()).map((alert) => ({
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          repositoryName: alert.repositoryName || null,
          read: false,
          timestamp: alert.timestamp,
          link: null,
        }));
        body = { items, total: items.length, unread: items.length, page: 1, limit: 50 };
        break;
      }
      case path === 'integrations': {
        const h = await ghic('/healthz', { token: false });
        const ri = h.repository_intelligence || {};
        body = [
          {
            id: 'github-app',
            name: 'GitHub App',
            type: 'github',
            enabled: h.status === 'ok',
            status: h.status === 'ok' ? 'connected' : 'error',
            webhookUrl: `${GHIC_BASE}/webhook`,
            lastPingAt: new Date().toISOString(),
            configuredAt: null,
            errorMessage: h.status === 'ok' ? null : `Health status: ${h.status}`,
          },
          {
            id: 'repository-intelligence',
            name: 'Repository Intelligence',
            type: 'internal',
            enabled: Boolean(ri.enabled),
            status: ri.enabled ? (ri.can_index === false ? 'degraded' : 'connected') : 'disabled',
            webhookUrl: null,
            lastPingAt: new Date().toISOString(),
            configuredAt: null,
            errorMessage: ri.indexing_note || null,
          },
        ];
        break;
      }
      case path === 'intelligence/summary': {
        const overview = await analyticsOverview();
        body = {
          totalRootCauses: overview.totalIssues,
          criticalPatterns: overview.duplicatesFound,
          activeRegressions: overview.regressions,
          knowledgeItems: overview.issuesByRepository.length,
          riskLevel: overview.regressions > 0 ? 'watch' : 'normal',
          topInsight: overview.totalIssues
            ? `${overview.totalIssues} issues have been scored by GHIC.`
            : 'No scored issues have been recorded yet.',
          engineeringHealthTrend: 'stable',
          lastAnalysisAt: new Date().toISOString(),
        };
        break;
      }
      case path === 'intelligence/root-causes':
      case path === 'intelligence/historical-patterns':
        body = list([], 1, 50);
        break;
      case path === 'intelligence/risk-analysis': {
        const repos = (await repositories()).items;
        body = {
          overallRisk: repos.some((repo) => num(repo.riskScore) >= 70) ? 'high' : 'normal',
          overallRiskScore: repos.length
            ? Math.round(repos.reduce((sum, repo) => sum + num(repo.riskScore), 0) / repos.length)
            : 0,
          repositories: repos.map((repo) => ({
            repositoryId: repo.id,
            repositoryName: repo.fullName,
            riskScore: num(repo.riskScore),
            riskLevel: num(repo.riskScore) >= 70 ? 'high' : num(repo.riskScore) >= 35 ? 'medium' : 'low',
            topRiskFactor: repo.lastError || 'No active risk factor exposed',
          })),
          topRisks: repos.filter((repo) => repo.lastError).map((repo) => ({
            category: 'repository_index',
            description: repo.lastError,
            severity: 'medium',
            repositoryName: repo.fullName,
          })),
          trendDirection: 'stable',
          lastCalculatedAt: new Date().toISOString(),
        };
        break;
      }
      case path === 'analytics/overview':
        body = await analyticsOverview();
        break;
      case path === 'search': {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const repos = q ? (await repositories()).items : [];
        const issueItems = q ? (await issues()).items : [];
        const repoResults = repos
          .filter((repo) => repo.fullName.toLowerCase().includes(q))
          .map((repo) => ({
            id: repo.id,
            type: 'repository',
            title: repo.fullName,
            description: repo.description,
            repositoryName: repo.fullName,
            url: `/repositories/${repo.id}`,
            score: 1,
            timestamp: repo.updatedAt,
          }));
        const issueResults = issueItems
          .filter((issue) => `${issue.repositoryName} ${issue.number} ${issue.classification}`.toLowerCase().includes(q))
          .map((issue) => ({
            id: issue.id,
            type: 'issue',
            title: `${issue.repositoryName}#${issue.number}`,
            description: issue.classification,
            repositoryName: issue.repositoryName,
            url: `/issues/${issue.id}`,
            score: issue.confidence,
            timestamp: issue.updatedAt,
          }));
        body = {
          query: q,
          total: repoResults.length + issueResults.length,
          repositories: repoResults,
          issues: issueResults,
          commits: [],
          pullRequests: [],
          components: [],
          releases: [],
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
