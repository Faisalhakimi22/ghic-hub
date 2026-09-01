/**
 * Authenticated GHIC product API for the Vite dashboard.
 *
 * Durable product data is read directly from the existing Neon tables. The
 * GHIC runtime is called only for its public health snapshot, so volatile
 * process counters and a missing shared webhook token cannot erase the UI.
 */
import {
  AuthError,
  requireRole,
  requireRoleChange,
  verifyRequest,
} from "./_lib/auth.mjs";
import {
  authenticateUser,
  dbConfigured,
  getOrgSettings,
  getUser,
  listUsers,
  updateOrgSettings,
  updateUserRole,
  updateUserSettings,
} from "./_lib/db.mjs";
import {
  completeGitHubInstallation,
  disconnectGitHubInstallation,
  getGitHubConnectionSummary,
  createGitHubInstallationIntent,
  refreshGitHubInstallation,
} from "./_lib/github-installations.mjs";
import { usageForWorkspace } from "./_lib/plans.mjs";
import {
  activityFromLedgerRow,
  buildDashboardOverview,
  issueDetail,
  readAggregate,
  readAnalytics,
  readDuplicateCandidates,
  readIssues,
  readLedgerEvents,
  readRepositories,
  repositoryFromId,
  searchProductData,
  unavailable,
} from "./_lib/product-data.mjs";

const GHIC_BASE =
  process.env.GHIC_API_URL || "https://github-issue-classifier-dun.vercel.app";

const FEATURE_REASONS = {
  commits:
    "Commit list metadata is not persisted by the current repository index.",
  "pull-requests":
    "Pull request list metadata is not persisted by the current repository index.",
  releases:
    "Release list metadata is not persisted by the current repository index.",
  components:
    "Component health requires Engineering Intelligence, which is intentionally disabled.",
  regressions:
    "GHIC does not persist verified regression records, so no regressions are displayed.",
  automation: "Automation is intentionally disabled in production.",
  intelligence:
    "Engineering Intelligence is intentionally disabled; repository retrieval remains active.",
  notifications:
    "GHIC has no persisted notification/read-state feed. Current operational alerts appear on the dashboard.",
};

async function runtimeHealth() {
  try {
    const response = await fetch(`${GHIC_BASE}/healthz`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { available: false, status: "unavailable" };
    return { available: true, ...(await response.json()) };
  } catch {
    return { available: false, status: "unavailable" };
  }
}

function parsePath(req) {
  const url = new URL(req.url, "http://localhost");
  const path = (
    url.searchParams.get("path") || url.pathname.replace(/^\/api\/?/, "")
  )
    .replace(/^\/+/, "")
    .replace(/\/$/, "");
  return { url, path, segments: path.split("/").filter(Boolean) };
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Request body is not valid JSON."), {
      status: 400,
      code: "invalid_json",
    });
  }
}

function sanitizeUserSettings(patch, current) {
  const next = {};
  if ("displayName" in patch) {
    next.displayName =
      patch.displayName == null
        ? null
        : String(patch.displayName).trim().slice(0, 120) || null;
  }
  if ("avatarUrl" in patch) {
    const value = patch.avatarUrl == null ? "" : String(patch.avatarUrl).trim();
    if (value && !/^https:\/\//i.test(value)) {
      throw Object.assign(new Error("Avatar URL must use HTTPS."), {
        status: 400,
      });
    }
    next.avatarUrl = value || null;
  }
  if ("theme" in patch) {
    if (!["system", "light", "dark"].includes(patch.theme)) {
      throw Object.assign(new Error("Theme must be system, light, or dark."), {
        status: 400,
      });
    }
    next.theme = patch.theme;
  }
  if ("timezone" in patch) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: patch.timezone }).format();
    } catch {
      throw Object.assign(new Error("Timezone is not a valid IANA timezone."), {
        status: 400,
      });
    }
    next.timezone = patch.timezone;
  }
  if ("emailPreferences" in patch) {
    next.emailPreferences = booleanPreferences(
      patch.emailPreferences,
      current.emailPreferences,
      ["productUpdates", "weeklyDigest"],
    );
  }
  if ("notificationPreferences" in patch) {
    next.notificationPreferences = booleanPreferences(
      patch.notificationPreferences,
      current.notificationPreferences,
      ["criticalAlerts", "regressions", "duplicates"],
    );
  }
  return next;
}

function booleanPreferences(patch, current, keys) {
  const next = { ...(current || {}) };
  if (!patch || typeof patch !== "object") {
    throw Object.assign(new Error("Preference group must be an object."), {
      status: 400,
    });
  }
  for (const key of keys) {
    if (key in patch) {
      if (typeof patch[key] !== "boolean") {
        throw Object.assign(new Error(`${key} must be true or false.`), {
          status: 400,
        });
      }
      next[key] = patch[key];
    }
  }
  return next;
}

function filterAlerts(alerts, viewer) {
  if (viewer.settings?.notificationPreferences?.criticalAlerts === false) {
    return alerts.filter((alert) => alert.severity !== "critical");
  }
  return alerts;
}

function errorPayload(error) {
  const status = Number(error.status) || 500;
  if (status === 401) {
    return {
      status,
      body: {
        code: "authentication_required",
        error: "Authentication required.",
      },
    };
  }
  if (status === 403) {
    return {
      status,
      body: {
        code: error.code || "forbidden",
        error: error.message || "Access denied.",
      },
    };
  }
  if (status === 400 || status === 404 || status === 405 || status === 409) {
    return {
      status,
      body: { code: error.code || "request_error", error: error.message },
    };
  }
  // GitHub API failures are upstream, not database failures. Without this
  // they fall through to the generic 500 and the caller loses the reason.
  if (status === 502) {
    return {
      status,
      body: { code: error.code || "github_api_error", error: error.message },
    };
  }
  if (status === 503) {
    return {
      status,
      body: {
        code: error.code || "database_unavailable",
        error:
          error.code === "github_app_not_configured"
            ? error.message
            : "Dashboard data is temporarily unavailable because PostgreSQL could not be queried.",
      },
    };
  }
  if (!dbConfigured || error.name === "NeonDbError") {
    return {
      status: 503,
      body: {
        code: "database_unavailable",
        error:
          "Dashboard data is temporarily unavailable because PostgreSQL could not be queried.",
      },
    };
  }
  return {
    status: 500,
    body: {
      code: "dashboard_error",
      error: "The dashboard could not load this data.",
    },
  };
}

const productionDependencies = {
  verifyRequest,
  authenticateUser,
  getOrgSettings,
  getUser,
  listUsers,
  updateOrgSettings,
  updateUserRole,
  updateUserSettings,
  runtimeHealth,
  readRepositories,
  readIssues,
  readAggregate,
  readLedgerEvents,
  readAnalytics,
  readDuplicateCandidates,
  searchProductData,
  getGitHubConnectionSummary,
  createGitHubInstallationIntent,
  completeGitHubInstallation,
  disconnectGitHubInstallation,
  refreshGitHubInstallation,
  usageForWorkspace,
};

export function createHandler(overrides = {}) {
  const dependencies = { ...productionDependencies, ...overrides };

  async function overview(viewer) {
    const [repositoryResponse, aggregate, eventRows, issueResponse, runtime] =
      await Promise.all([
        dependencies.readRepositories({ limit: 100, workspaceId: viewer.workspaceId }),
        dependencies.readAggregate(viewer.workspaceId),
        dependencies.readLedgerEvents(200, viewer.workspaceId),
        dependencies.readIssues({ limit: 100, workspaceId: viewer.workspaceId }),
        dependencies.runtimeHealth(),
      ]);
    const result = buildDashboardOverview({
      repositories: repositoryResponse.items,
      repositoryTotal: repositoryResponse.total,
      indexedRepositoryTotal: repositoryResponse.indexedTotal,
      aggregate,
      eventRows,
      issues: issueResponse.items,
      runtime,
    });
    result.alerts = filterAlerts(result.alerts, viewer);
    result.stats.activeAlerts = result.alerts.length;
    return result;
  }

  async function organizationView(settings = null, viewer = null) {
    if (!viewer?.workspaceId) {
      throw new AuthError("Workspace membership is required.", 403);
    }
    const [resolvedSettings, members, repositories] = await Promise.all([
      settings ? Promise.resolve(settings) : dependencies.getOrgSettings(viewer?.workspaceId),
      dependencies.listUsers(viewer?.workspaceId),
      dependencies.readRepositories({ limit: 100, workspaceId: viewer?.workspaceId }),
    ]);
    return {
      id: viewer.workspaceId,
      name: resolvedSettings.workspaceName,
      workspaceName: resolvedSettings.workspaceName,
      slug: String(resolvedSettings.workspaceName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      avatarUrl: null,
      plan: "self-hosted",
      memberCount: members.length,
      repositoryCount: repositories.total,
      createdAt: null,
      updatedAt: resolvedSettings.updatedAt || null,
    };
  }

  return async function handler(req, res) {
    const { url, path, segments } = parsePath(req);
    res.setHeader("cache-control", "private, no-store");
    let viewer;
    try {
      const claims = await dependencies.verifyRequest(req);
      if (!dbConfigured && !overrides.allowUnconfiguredDatabase) {
        throw Object.assign(new Error("PostgreSQL is not configured."), {
          status: 503,
        });
      }
      viewer = await dependencies.authenticateUser(claims);
    } catch (error) {
      const response = errorPayload(error);
      res.status(response.status).json(response.body);
      return;
    }

    try {
      if (path === "me" && req.method === "GET") {
        res.status(200).json(viewer);
        return;
      }
      if (path === "me/settings" && ["PATCH", "PUT"].includes(req.method)) {
        const patch = await readJson(req);
        if ("role" in patch)
          throw new AuthError(
            "Role cannot be changed from user settings.",
            403,
          );
        const sanitized = sanitizeUserSettings(patch, viewer.settings || {});
        res
          .status(200)
          .json(await dependencies.updateUserSettings(viewer.id, sanitized));
        return;
      }
      if (path === "organization" && req.method === "GET") {
        res.status(200).json(await organizationView(null, viewer));
        return;
      }
      if (path === "organization" && ["PATCH", "PUT"].includes(req.method)) {
        requireRole(viewer, "owner");
        const patch = await readJson(req);
        const workspaceName = String(patch.workspaceName || "")
          .trim()
          .slice(0, 120);
        if (!workspaceName)
          throw Object.assign(new Error("Workspace name is required."), {
            status: 400,
          });
        const settings = await dependencies.updateOrgSettings(
          { workspaceName }, viewer.id, viewer.workspaceId,
        );
        res.status(200).json(await organizationView(settings, viewer));
        return;
      }
      if (path === "organization/members" && req.method === "GET") {
        const members = await dependencies.listUsers(viewer.workspaceId);
        const items = members.map((member) => ({
          id: member.id,
          login: member.name || member.email || member.id,
          name: member.name,
          email: member.email,
          avatarUrl: member.avatarUrl,
          role: member.role,
          joinedAt: member.createdAt || null,
          lastActiveAt: member.lastLogin || null,
        }));
        res.status(200).json({
          members: items,
          items,
          total: items.length,
          page: 1,
          limit: 100,
        });
        return;
      }
      if (
        segments[0] === "organization" &&
        segments[1] === "members" &&
        segments[2] &&
        ["PATCH", "PUT"].includes(req.method)
      ) {
        const target = await dependencies.getUser(decodeURIComponent(segments[2]), viewer.workspaceId);
        if (!target)
          throw Object.assign(new Error("User not found."), { status: 404 });
        const { role } = await readJson(req);
        requireRoleChange(viewer, target, role);
        res
          .status(200)
          .json(await dependencies.updateUserRole(target.id, role, viewer.workspaceId));
        return;
      }

      // GitHub connection. These are the only write surfaces besides account
      // and organization administration, so they sit above the read-only
      // guard below.
      if (path === "github/connection" && req.method === "GET") {
        res.status(200).json(await dependencies.getGitHubConnectionSummary(viewer.workspaceId));
        return;
      }
      if (path === "github/installations/intent" && req.method === "POST") {
        res
          .status(200)
          .json(await dependencies.createGitHubInstallationIntent(viewer));
        return;
      }
      if (path === "github/installations" && req.method === "POST") {
        // The browser supplies the callback state and installation id. The
        // server consumes the state once, then independently verifies the
        // installation and repository list with GitHub App credentials.
        const payload = await readJson(req);
        res
          .status(200)
          .json(await dependencies.completeGitHubInstallation(viewer, payload));
        return;
      }
      if (
        segments[0] === "github" &&
        segments[1] === "installations" &&
        segments[2] &&
        segments[3] === "disconnect" &&
        req.method === "POST"
      ) {
        res
          .status(200)
          .json(
            await dependencies.disconnectGitHubInstallation(viewer, segments[2]),
          );
        return;
      }
      if (
        segments[0] === "github" &&
        segments[1] === "installations" &&
        segments[2] &&
        segments[3] === "refresh" &&
        req.method === "POST"
      ) {
        res
          .status(200)
          .json(
            await dependencies.refreshGitHubInstallation(viewer, segments[2]),
          );
        return;
      }

      if (req.method !== "GET") {
        throw Object.assign(new Error("This dashboard surface is read-only."), {
          status: 405,
        });
      }

      let body;
      if (path === "dashboard/overview") {
        body = await overview(viewer);
      } else if (path === "dashboard/stats") {
        body = (await overview(viewer)).stats;
      } else if (path === "dashboard/recent-activity") {
        body = (await overview(viewer)).recentActivity;
      } else if (path === "dashboard/alerts") {
        body = (await overview(viewer)).alerts;
      } else if (path === "usage") {
        body = await dependencies.usageForWorkspace(viewer.workspaceId);
      } else if (path === "repositories") {
        body = await dependencies.readRepositories({
          workspaceId: viewer.workspaceId,
          page: url.searchParams.get("page"),
          limit: url.searchParams.get("limit"),
          search: url.searchParams.get("search"),
          language: url.searchParams.get("language"),
          status: url.searchParams.get("status"),
        });
      } else if (
        segments[0] === "repositories" &&
        segments[1] &&
        segments.length === 2
      ) {
        const fullName = repositoryFromId(segments[1]);
        const response = await dependencies.readRepositories({
          workspaceId: viewer.workspaceId,
          search: fullName,
          limit: 100,
        });
        body = response.items.find((repo) => repo.fullName === fullName);
        if (!body)
          throw Object.assign(new Error("Repository not found."), {
            status: 404,
          });
      } else if (segments[0] === "repositories" && segments[2]) {
        body = unavailable(
          segments[2],
          FEATURE_REASONS[segments[2]] ||
            "This repository view is not available.",
        );
      } else if (path === "issues") {
        body = await dependencies.readIssues(
          {
            ...Object.fromEntries(url.searchParams),
            // Query parameters are filters only. Tenant scope comes from the
            // authenticated Firebase user and server-side membership.
            workspaceId: viewer.workspaceId,
          },
        );
      } else if (segments[0] === "issues" && segments[1]) {
        const separator = segments[1].lastIndexOf("~");
        if (separator < 1)
          throw Object.assign(new Error("Issue identifier is invalid."), {
            status: 400,
          });
        const repoPart = segments[1].slice(0, separator);
        const numberPart = segments[1].slice(separator + 1);
        if (!/^\d+$/.test(numberPart)) {
          throw Object.assign(new Error("Issue identifier is invalid."), {
            status: 400,
          });
        }
        const repo = repositoryFromId(repoPart);
        const response = await dependencies.readIssues({
          workspaceId: viewer.workspaceId,
          repositoryId: repositoryIdForQuery(repo),
          limit: 100,
        });
        const issue = response.items.find(
          (item) =>
            item.id === segments[1] ||
            (item.repositoryName === repo &&
              item.number === Number(numberPart)),
        );
        if (!issue)
          throw Object.assign(new Error("Issue not found."), { status: 404 });
        body = issueDetail(issue);
      } else if (path === "analytics/overview") {
        body = await dependencies.readAnalytics(viewer.workspaceId);
      } else if (path === "duplicates") {
        body = await dependencies.readDuplicateCandidates(viewer.workspaceId);
      } else if (path === "search") {
        body = await dependencies.searchProductData(
          url.searchParams.get("q") || "", 20, viewer.workspaceId,
        );
      } else if (path === "audit-logs") {
        const rows = await dependencies.readLedgerEvents(100, viewer.workspaceId);
        const items = rows
          .map((row) => {
            const activity = activityFromLedgerRow(row);
            const data =
              row.data && typeof row.data === "object" ? row.data : {};
            return (
              activity && {
                id: activity.id,
                timestamp: activity.timestamp,
                user: activity.actor,
                userAvatarUrl: null,
                repositoryName: activity.repositoryName,
                action: activity.type,
                modelVersion: data.prediction?.model || null,
                evidence: activity.description,
                executionTimeMs: data.duration_ms ?? null,
                result:
                  data.type === "processing_failure" ? "failed" : "success",
                ipAddress: null,
              }
            );
          })
          .filter(Boolean);
        body = {
          items,
          total: items.length,
          page: 1,
          limit: 100,
          available: true,
        };
      } else if (path === "system-health" || path === "healthz") {
        const [runtime, repositories, aggregate] = await Promise.all([
          dependencies.runtimeHealth(),
          dependencies.readRepositories({ limit: 100, workspaceId: viewer.workspaceId }),
          dependencies.readAggregate(viewer.workspaceId),
        ]);
        const ri = runtime.repository_intelligence || {};
        const signaturesMatch = repositories.items.every(
          (repo) =>
            repo.indexStatus !== "ready" ||
            !repo.embeddingSignature ||
            !ri.embedding_signature ||
            repo.embeddingSignature === ri.embedding_signature,
        );
        body = {
          overall:
            runtime.available && runtime.status === "ok" && signaturesMatch
              ? "healthy"
              : "degraded",
          webhookStatus: "unknown",
          queueStatus: ri.queue_durable
            ? "healthy"
            : ri.enabled
              ? "not_configured"
              : "disabled",
          queueLength: null,
          databaseStatus: "healthy",
          vectorStoreStatus:
            ri.vector_provider === "postgres" && signaturesMatch
              ? "healthy"
              : ri.enabled
                ? "degraded"
                : "disabled",
          embeddingProviderStatus:
            ri.enabled && signaturesMatch
              ? "healthy"
              : ri.enabled
                ? "degraded"
                : "disabled",
          llmProviderStatus: "unknown",
          repositoryIntelligenceStatus:
            ri.enabled && signaturesMatch
              ? "healthy"
              : ri.enabled
                ? "degraded"
                : "disabled",
          engineeringIntelligenceStatus: "disabled",
          automationStatus: "disabled",
          autoIndex: ri.auto_index ?? null,
          githubApiStatus: "unknown",
          githubApiRateLimit: null,
          githubApiRateLimitRemaining: null,
          processingLatencyMs:
            aggregate.average_latency_ms == null
              ? null
              : Math.round(Number(aggregate.average_latency_ms)),
          averageResponseTimeMs: null,
          failedJobsLast24h: Number(aggregate.failures_last_24h || 0),
          uptimePercent: null,
          lastCheckedAt: new Date().toISOString(),
          version: runtime.version || null,
          model: runtime.model || null,
          embeddingSignature: ri.embedding_signature || null,
        };
      } else if (path === "integrations") {
        const runtime = await dependencies.runtimeHealth();
        const ri = runtime.repository_intelligence || {};
        body = [
          {
            id: "ghic-runtime",
            name: "GHIC Runtime",
            type: "internal",
            enabled: runtime.available,
            status:
              runtime.available && runtime.status === "ok"
                ? "connected"
                : "error",
            webhookUrl: null,
            lastPingAt: new Date().toISOString(),
            configuredAt: null,
            errorMessage: runtime.available
              ? null
              : "The live health check is unavailable.",
          },
          {
            id: "repository-intelligence",
            name: "Repository Intelligence",
            type: "internal",
            enabled: Boolean(ri.enabled),
            status: ri.enabled ? "connected" : "disabled",
            webhookUrl: null,
            lastPingAt: new Date().toISOString(),
            configuredAt: null,
            errorMessage: null,
          },
        ];
      } else if (path === "notifications") {
        body = unavailable("notifications", FEATURE_REASONS.notifications);
      } else if (
        path === "intelligence/summary" ||
        path === "intelligence/root-causes" ||
        path === "intelligence/historical-patterns" ||
        path === "intelligence/risk-analysis"
      ) {
        body = unavailable("intelligence", FEATURE_REASONS.intelligence);
      } else if (path === "components") {
        body = unavailable("components", FEATURE_REASONS.components);
      } else if (path === "regressions") {
        body = unavailable("regressions", FEATURE_REASONS.regressions);
      } else if (path === "automation/suggestions") {
        body = unavailable("automation", FEATURE_REASONS.automation);
      } else if (["commits", "pull-requests", "releases"].includes(path)) {
        body = unavailable(path, FEATURE_REASONS[path]);
      } else {
        throw Object.assign(new Error(`Unknown endpoint: /${path}`), {
          status: 404,
        });
      }

      res.status(200).json(body);
    } catch (error) {
      const response = errorPayload(error);
      res.status(response.status).json(response.body);
    }
  };
}

function repositoryIdForQuery(repo) {
  return encodeURIComponent(repo || "").replace(/%2F/gi, "~");
}

export default createHandler();
