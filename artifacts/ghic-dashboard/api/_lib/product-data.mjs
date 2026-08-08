import { database } from "./db.mjs";

const LEDGER_TYPES = new Set([
  "prediction",
  "analysis",
  "processing_failure",
  "action",
  "label_event",
  "outcome",
]);

const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const asObject = (value) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

export function toIso(value) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function repositoryId(repo) {
  return encodeURIComponent(repo || "").replace(/%2F/gi, "~");
}

export function repositoryFromId(id) {
  return decodeURIComponent(String(id || "").replace(/~/g, "/"));
}

function pagination(page = 1, limit = 50) {
  const safePage = Math.max(1, Math.trunc(asNumber(page, 1)));
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(asNumber(limit, 50))));
  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
}

export async function sourceCapabilities() {
  const q = await database();
  const [row] = await q`
    SELECT
      to_regclass('public.ghic_ledger') IS NOT NULL AS ledger,
      to_regclass('public.ghic_repository_state') IS NOT NULL AS repository_state,
      to_regclass('public.ghic_repo_chunks') IS NOT NULL AS repo_chunks`;
  return {
    ledger: Boolean(row?.ledger),
    repositoryState: Boolean(row?.repository_state),
    repoChunks: Boolean(row?.repo_chunks),
  };
}

export async function readRepositories({
  page = 1,
  limit = 50,
  search = "",
  language = "",
  status = "",
} = {}) {
  const q = await database();
  const capabilities = await sourceCapabilities();
  const paging = pagination(page, limit);
  if (!capabilities.repositoryState) {
    return {
      items: [],
      total: 0,
      indexedTotal: 0,
      ...paging,
      available: true,
    };
  }

  const chunkCounts = capabilities.repoChunks
    ? `chunk_counts AS (
         SELECT repo, count(*)::int AS actual_chunk_count,
                count(DISTINCT path)::int AS actual_file_count
         FROM ghic_repo_chunks GROUP BY repo
       )`
    : `chunk_counts AS (
         SELECT NULL::text AS repo, NULL::int AS actual_chunk_count,
                NULL::int AS actual_file_count WHERE false
       )`;
  const latestAnalyses = capabilities.ledger
    ? `latest_analyses AS (
         SELECT DISTINCT ON (data->>'repo')
                data->>'repo' AS repo,
                data->'repository_private' AS repository_private,
                data->>'repository_url' AS repository_url,
                data->>'installation_id' AS installation_id
         FROM ghic_ledger
         WHERE data->>'type' = 'analysis' AND COALESCE(data->>'repo', '') <> ''
         ORDER BY data->>'repo', id DESC
       )`
    : `latest_analyses AS (
         SELECT NULL::text AS repo, NULL::jsonb AS repository_private,
                NULL::text AS repository_url, NULL::text AS installation_id
         WHERE false
       )`;
  const actualChunkCount = capabilities.repoChunks
    ? "COALESCE(chunks.actual_chunk_count, 0)"
    : "NULL::int";
  const actualFileCount = capabilities.repoChunks
    ? "COALESCE(chunks.actual_file_count, 0)"
    : "NULL::int";
  const rows = await q(
    `WITH ${chunkCounts}, ${latestAnalyses}
     SELECT repository_state.repo, repository_state.state,
            repository_state.data, repository_state.updated_at,
            ${actualChunkCount} AS actual_chunk_count,
            ${actualFileCount} AS actual_file_count,
            analyses.repository_private, analyses.repository_url,
            analyses.installation_id,
            count(*) OVER ()::int AS total_count,
            count(*) FILTER (WHERE repository_state.state = 'ready') OVER ()::int AS indexed_count
     FROM ghic_repository_state repository_state
     LEFT JOIN chunk_counts chunks USING (repo)
     LEFT JOIN latest_analyses analyses USING (repo)
     WHERE ($1::text = '' OR lower(
              repository_state.repo || ' ' ||
              COALESCE(repository_state.data->>'primary_language', '') || ' ' ||
              COALESCE(repository_state.data->>'frameworks', '')
            ) LIKE '%' || lower($1::text) || '%')
       AND ($2::text = '' OR lower(COALESCE(
              repository_state.data->>'primary_language',
              repository_state.data->'metadata'->>'primary_language', ''
            )) = lower($2::text))
       AND ($3::text = '' OR repository_state.state = $3::text)
     ORDER BY repository_state.updated_at DESC
     LIMIT $4 OFFSET $5`,
    [
      String(search || "").trim(),
      String(language || ""),
      String(status || ""),
      paging.limit,
      paging.offset,
    ],
  );
  const items = rows.map(normalizeRepositoryRow);
  const total = rows.length ? asNumber(rows[0].total_count, 0) : 0;
  const indexedTotal = rows.length ? asNumber(rows[0].indexed_count, 0) : 0;
  return {
    items,
    total,
    indexedTotal,
    page: paging.page,
    limit: paging.limit,
    available: true,
  };
}

export function normalizeRepositoryRow(row = {}) {
  const data = asObject(row.data);
  const metadata = asObject(data.metadata);
  const fullName = String(row.repo || data.repo || "");
  const [owner = "", name = ""] = fullName.split("/", 2);
  const stateChunkCount = asNumber(data.chunk_count, 0);
  const stateFileCount = asNumber(data.file_count, 0);
  const chunkCount =
    row.actual_chunk_count == null
      ? stateChunkCount
      : asNumber(row.actual_chunk_count, 0);
  const fileCount =
    row.actual_file_count == null
      ? stateFileCount
      : asNumber(row.actual_file_count, 0);
  const state = String(row.state || data.state || "not_indexed");
  const embeddingProvider = String(data.embedding_provider || "");
  const embeddingModel = String(data.embedding_model || "");
  const embeddingDimensions = asNumber(data.embedding_dimensions, 0) || null;
  const embeddingSignature = String(
    data.embedding_signature ||
      (embeddingProvider && embeddingModel && embeddingDimensions
        ? `${embeddingProvider}:${embeddingModel}:${embeddingDimensions}`
        : ""),
  );
  const countMismatch =
    state === "ready" &&
    (stateChunkCount !== chunkCount || stateFileCount !== fileCount);
  const lastError = String(data.last_error || "");
  const health =
    state === "failed"
      ? "failed"
      : countMismatch || lastError
        ? "degraded"
        : state === "ready"
          ? "healthy"
          : state;
  const privateValue = row.repository_private;
  const isPrivate = privateValue === true || privateValue === "true";
  const visibility =
    privateValue == null ? "not_recorded" : isPrivate ? "private" : "public";
  const indexedAt = toIso(data.indexed_at);
  const updatedAt = toIso(row.updated_at) || toIso(data.updated_at);

  return {
    id: repositoryId(fullName),
    name: String(data.name || name || fullName),
    fullName,
    owner: String(data.owner || owner),
    visibility,
    language: data.primary_language || metadata.primary_language || null,
    framework: Array.isArray(data.frameworks)
      ? data.frameworks.join(", ") || null
      : Array.isArray(metadata.frameworks)
        ? metadata.frameworks.join(", ") || null
        : null,
    defaultBranch: data.default_branch || metadata.default_branch || null,
    health,
    healthScore: null,
    riskScore: null,
    openIssues: null,
    indexStatus: state,
    repositoryIntelligenceStatus: state === "ready" ? "active" : state,
    engineeringIntelligenceStatus: "disabled",
    webhookStatus: "not_recorded",
    installationStatus: row.installation_id ? "installed" : "not_recorded",
    description: data.readme_summary || data.architecture_summary || null,
    architectureSummary: data.architecture_summary || "",
    url:
      row.repository_url || (fullName ? `https://github.com/${fullName}` : ""),
    createdAt: indexedAt || updatedAt,
    updatedAt,
    lastIndexedAt: indexedAt,
    indexedCommitSha: String(data.indexed_commit_sha || ""),
    chunkCount,
    fileCount,
    stateChunkCount,
    stateFileCount,
    countMismatch,
    embeddingProvider: embeddingProvider || null,
    embeddingModel: embeddingModel || null,
    embeddingDimensions,
    embeddingSignature: embeddingSignature || null,
    vectorBackend: data.vector_backend || null,
    retrievalCount: asNumber(data.retrieval_count, 0),
    retrievalHitCount: asNumber(data.retrieval_hit_count, 0),
    retrievalHitRate: data.hit_rate == null ? null : asNumber(data.hit_rate),
    indexDurationSeconds:
      data.index_duration_seconds == null
        ? null
        : asNumber(data.index_duration_seconds),
    hasIndexError: Boolean(lastError),
    operationalMessage: safeRepositoryError(lastError),
  };
}

function safeRepositoryError(error) {
  const value = String(error || "").toLowerCase();
  if (!value) return null;
  if (value.includes("embedding") || value.includes("dimension")) {
    return "Repository vectors are incompatible with the configured embedding runtime.";
  }
  if (
    value.includes("401") ||
    value.includes("403") ||
    value.includes("permission") ||
    value.includes("private")
  ) {
    return "GHIC could not access this repository with the installed GitHub permissions.";
  }
  return "The most recent repository indexing operation failed.";
}

export async function readIssues(params = {}) {
  const q = await database();
  const capabilities = await sourceCapabilities();
  const paging = pagination(params.page, params.limit);
  if (!capabilities.ledger) {
    return { items: [], total: 0, ...paging, available: true };
  }

  const repository = params.repositoryId
    ? repositoryFromId(params.repositoryId)
    : "";
  const rows = await q(
    `WITH predictions AS (
       SELECT DISTINCT ON (data->>'repo', (data->>'number')::int)
              data->>'repo' AS repo, (data->>'number')::int AS number,
              data, created_at
       FROM ghic_ledger
       WHERE data->>'type' = 'prediction'
         AND data->>'number' ~ '^[0-9]+$'
       ORDER BY data->>'repo', (data->>'number')::int, id DESC
     ), analyses AS (
       SELECT DISTINCT ON (data->>'repo', (data->>'number')::int)
              data->>'repo' AS repo, (data->>'number')::int AS number,
              data, created_at
       FROM ghic_ledger
       WHERE data->>'type' = 'analysis'
         AND data->>'number' ~ '^[0-9]+$'
       ORDER BY data->>'repo', (data->>'number')::int, id DESC
     ), outcomes AS (
       SELECT DISTINCT ON (data->>'repo', (data->>'number')::int)
              data->>'repo' AS repo, (data->>'number')::int AS number,
              data, created_at
       FROM ghic_ledger
       WHERE data->>'type' = 'outcome'
         AND data->>'number' ~ '^[0-9]+$'
       ORDER BY data->>'repo', (data->>'number')::int, id DESC
     ), actions AS (
       SELECT data->>'repo' AS repo, (data->>'number')::int AS number,
              bool_or(data->>'action' = 'comment') AS comment_posted
       FROM ghic_ledger
       WHERE data->>'type' = 'action'
         AND data->>'number' ~ '^[0-9]+$'
       GROUP BY data->>'repo', (data->>'number')::int
     ), issue_keys AS (
       SELECT repo, number FROM predictions
       UNION
       SELECT repo, number FROM analyses
     ), rows AS (
       SELECT k.repo, k.number,
              p.data AS prediction, p.created_at AS prediction_created_at,
              a.data AS analysis, a.created_at AS analysis_created_at,
              o.data AS outcome, o.created_at AS outcome_created_at,
              COALESCE(actions.comment_posted, false) AS comment_posted,
              COALESCE(a.created_at, p.created_at) AS sort_at,
              COALESCE(a.data->>'title', '') AS title,
              COALESCE(
                a.data->'llm_analysis'->>'category',
                a.data->'category'->>'predicted',
                CASE WHEN COALESCE(
                  a.data->'prediction'->>'predicted_label', p.data->>'predicted'
                ) = '1' THEN 'actionable-bug' ELSE 'non-actionable' END
              ) AS classification,
              a.data->'llm_analysis'->>'priority' AS priority,
              a.data->'llm_analysis'->>'severity' AS severity,
              CASE WHEN o.data IS NOT NULL THEN 'closed'
                   ELSE COALESCE(a.data->>'issue_state', 'open') END AS issue_status
       FROM issue_keys k
       LEFT JOIN predictions p USING (repo, number)
       LEFT JOIN analyses a USING (repo, number)
       LEFT JOIN outcomes o USING (repo, number)
       LEFT JOIN actions USING (repo, number)
     )
     SELECT *, count(*) OVER ()::int AS total_count
     FROM rows
     WHERE ($1 = '' OR lower(title || ' ' || repo || ' #' || number::text) LIKE '%' || lower($1) || '%')
       AND ($2 = '' OR repo = $2)
       AND ($3 = '' OR priority = $3)
       AND ($4 = '' OR severity = $4)
       AND ($5 = '' OR issue_status = $5)
       AND ($6 = '' OR classification = $6)
       AND ($7 = '' OR COALESCE(analysis->>'analysis_status', 'scored_only') = $7)
       AND ($8::text = '' OR COALESCE(analysis->'labels', '[]'::jsonb) ? $8::text
                    OR COALESCE(analysis->'llm_analysis'->'recommended_labels', '[]'::jsonb) ? $8::text)
       AND $9::text = ''
     ORDER BY sort_at DESC
     LIMIT $10 OFFSET $11`,
    [
      String(params.search || "").trim(),
      repository,
      String(params.priority || ""),
      String(params.severity || ""),
      String(params.status || ""),
      String(params.classification || ""),
      String(params.aiStatus || ""),
      String(params.label || ""),
      String(params.assignee || ""),
      paging.limit,
      paging.offset,
    ],
  );
  const total = rows.length ? asNumber(rows[0].total_count, 0) : 0;
  return {
    items: rows.map(issueFromRow),
    total,
    page: paging.page,
    limit: paging.limit,
    available: true,
  };
}

export function issueFromRow(row = {}) {
  const predictionEvent = asObject(row.prediction);
  const analysis = asObject(row.analysis);
  const embeddedPrediction = asObject(analysis.prediction);
  const llm = asObject(analysis.llm_analysis);
  const category = asObject(analysis.category);
  const context = asObject(analysis.repository_context);
  const outcome = asObject(row.outcome);
  const repo = String(row.repo || analysis.repo || predictionEvent.repo || "");
  const number = asNumber(
    row.number ?? analysis.number ?? predictionEvent.number,
    0,
  );
  const probability =
    embeddedPrediction.proba_actionable_bug == null
      ? asNumber(predictionEvent.proba, 0)
      : asNumber(embeddedPrediction.proba_actionable_bug, 0);
  const predictedLabel =
    embeddedPrediction.predicted_label == null
      ? asNumber(predictionEvent.predicted, 0)
      : asNumber(embeddedPrediction.predicted_label, 0);
  const actionability =
    embeddedPrediction.predicted_class ||
    (predictedLabel === 1 ? "actionable-bug" : "non-actionable");
  const classification = llm.category || category.predicted || actionability;
  const analyzedAt = toIso(row.analysis_created_at) || toIso(analysis.at);
  const predictedAt =
    toIso(row.prediction_created_at) || toIso(predictionEvent.at);
  const actualLabels = Array.isArray(analysis.labels)
    ? analysis.labels.map(String)
    : [];
  const suggestedLabels = Array.isArray(llm.recommended_labels)
    ? llm.recommended_labels.map(String)
    : [];
  const relevantFiles = Array.isArray(context.relevant_files)
    ? context.relevant_files.map(String)
    : [];
  const relevantFunctions = Array.isArray(context.relevant_symbols)
    ? context.relevant_symbols.map(String)
    : [];
  const reviewReasons = Array.isArray(analysis.review_reasons)
    ? analysis.review_reasons.map(String)
    : [];
  const title = analysis.title ? String(analysis.title) : null;
  const status = Object.keys(outcome).length
    ? "closed"
    : String(analysis.issue_state || "open");
  const relatedIssues = Array.isArray(analysis.related_issues)
    ? analysis.related_issues.map((candidate) => {
        const related = asObject(candidate);
        const relatedNumber = asNumber(related.number, 0);
        return {
          id: `${repositoryId(repo)}~${relatedNumber}`,
          number: relatedNumber,
          title: related.title ? String(related.title) : null,
          status: "not_recorded",
          similarity:
            related.similarity == null ? null : asNumber(related.similarity),
        };
      })
    : [];

  return {
    id: `${repositoryId(repo)}~${number}`,
    number,
    repositoryId: repositoryId(repo),
    repositoryName: repo,
    title,
    status,
    priority: llm.priority || null,
    severity: llm.severity || null,
    classification,
    actionability,
    confidence: probability,
    statisticalScore: probability,
    threshold:
      embeddedPrediction.threshold == null
        ? null
        : asNumber(embeddedPrediction.threshold),
    llmConfidence: llm.confidence == null ? null : asNumber(llm.confidence),
    riskLevel: llm.risk_level || null,
    labels: actualLabels,
    suggestedLabels,
    assignee: null,
    createdAt: toIso(analysis.issue_created_at) || predictedAt,
    updatedAt: analyzedAt || predictedAt,
    analysisTimestamp: analyzedAt,
    aiStatus: analysis.analysis_status || "scored_only",
    hasEngineeringReport: false,
    url:
      analysis.url ||
      (repo && number ? `https://github.com/${repo}/issues/${number}` : ""),
    summary: llm.summary || null,
    finalVerdict: llm.recommended_action || null,
    recommendedAction: llm.recommended_action || null,
    reasoning: Array.isArray(llm.reasoning) ? llm.reasoning.map(String) : [],
    riskReasons: Array.isArray(llm.risk_reasons)
      ? llm.risk_reasons.map(String)
      : [],
    businessImpact: Array.isArray(llm.business_impact)
      ? llm.business_impact.map(String)
      : [],
    missingInformation: Array.isArray(llm.missing_information)
      ? llm.missing_information.map(String)
      : [],
    repositoryEvidenceStatus:
      analysis.repository_evidence_status || "not_recorded",
    repositoryEvidenceNote: context.note || null,
    relevantFiles,
    relevantFunctions,
    evidenceChunks: Array.isArray(context.chunks) ? context.chunks : [],
    relatedIssues,
    needsMaintainerReview: Boolean(analysis.needs_maintainer_review),
    reviewReasons,
    commentPosted: Boolean(analysis.comment_posted || row.comment_posted),
    analysisLatencyMs:
      analysis.duration_ms == null ? null : asNumber(analysis.duration_ms),
    dryRun: analysis.dry_run == null ? null : Boolean(analysis.dry_run),
  };
}

export function issueDetail(issue) {
  return {
    issue,
    executiveSummary:
      issue.summary ||
      `${issue.repositoryName}#${issue.number} was statistically classified as ` +
        `${issue.actionability} with ${Math.round(issue.statisticalScore * 100)}% probability.`,
    rootCauseAnalysis: null,
    regressionSignals: null,
    engineeringImpact: issue.businessImpact.length
      ? issue.businessImpact.join("\n")
      : null,
    investigationPlan: issue.recommendedAction,
    suggestedTests: [],
    suggestedLabels: issue.suggestedLabels,
    suggestedAssignee: null,
    missingInformation: issue.missingInformation.join("\n") || null,
    relevantFiles: issue.relevantFiles,
    relevantFunctions: issue.relevantFunctions,
    relevantComponents: [],
    relatedCommits: [],
    relatedPullRequests: [],
    relatedIssues: issue.relatedIssues,
    reasoning: issue.reasoning,
    riskReasons: issue.riskReasons,
    businessImpact: issue.businessImpact,
    repositoryEvidenceStatus: issue.repositoryEvidenceStatus,
    repositoryEvidenceNote: issue.repositoryEvidenceNote,
    evidenceChunks: issue.evidenceChunks,
    reviewReasons: issue.reviewReasons,
    timeline: [
      ...(issue.createdAt
        ? [
            {
              id: `${issue.id}-scored`,
              type: "scored",
              actor: "GHIC",
              description: `Statistical prediction recorded at ${Math.round(issue.statisticalScore * 100)}%.`,
              timestamp: issue.createdAt,
            },
          ]
        : []),
      ...(issue.analysisTimestamp
        ? [
            {
              id: `${issue.id}-analyzed`,
              type: "analyzed",
              actor: "GHIC",
              description: `Analysis completed with repository evidence status: ${issue.repositoryEvidenceStatus}.`,
              timestamp: issue.analysisTimestamp,
            },
          ]
        : []),
    ],
    automationSuggestions: [],
  };
}

export async function readLedgerEvents(limit = 100) {
  const q = await database();
  const capabilities = await sourceCapabilities();
  if (!capabilities.ledger) return [];
  const safeLimit = Math.min(
    500,
    Math.max(1, Math.trunc(asNumber(limit, 100))),
  );
  return q(
    `SELECT id, data, created_at
     FROM ghic_ledger
     WHERE data->>'type' IN (
       'prediction', 'analysis', 'processing_failure', 'action', 'label_event', 'outcome'
     )
     ORDER BY id DESC
     LIMIT $1`,
    [safeLimit],
  );
}

export function activityFromLedgerRow(row = {}) {
  const data = asObject(row.data);
  const type = String(data.type || "");
  if (!LEDGER_TYPES.has(type)) return null;
  const repo = String(data.repo || "");
  const number = asNumber(data.number, 0);
  const timestamp = toIso(data.at) || toIso(row.created_at);
  const link =
    repo && number ? `https://github.com/${repo}/issues/${number}` : null;
  const base = {
    id: `ledger-${row.id}`,
    type,
    actor: "GHIC",
    repositoryName: repo || null,
    issueNumber: number || null,
    timestamp,
    link,
  };
  if (type === "analysis") {
    const llm = asObject(data.llm_analysis);
    const evidence = data.repository_evidence_status || "not recorded";
    return {
      ...base,
      type: "issue_analyzed",
      message: `analyzed ${repo}#${number}`,
      title: data.title || `Issue #${number}`,
      description: `${llm.category || "Issue"}; repository evidence ${evidence}.`,
    };
  }
  if (type === "prediction") {
    return {
      ...base,
      type: "issue_classified",
      message: `classified ${repo}#${number}`,
      title: `Issue #${number}`,
      description: `${data.predicted === 1 ? "Actionable bug" : "Non-actionable"} at ${Math.round(asNumber(data.proba) * 100)}%.`,
    };
  }
  if (type === "action") {
    const action = String(data.action || "action");
    return {
      ...base,
      type: action === "comment" ? "comment_posted" : "github_action",
      message: `${action === "comment" ? "posted a comment on" : `performed ${action} for`} ${repo}#${number}`,
      title: `${action} recorded`,
      description: "GitHub write recorded by GHIC.",
    };
  }
  if (type === "outcome") {
    return {
      ...base,
      type: "issue_resolved",
      message: `recorded the outcome for ${repo}#${number}`,
      title: `Issue #${number} closed`,
      description:
        data.truth === 1
          ? "Resolved as actionable."
          : "Resolved as non-actionable.",
    };
  }
  if (type === "label_event") {
    return {
      ...base,
      type: "label_observed",
      message: `observed label ${data.added ? "added to" : "removed from"} ${repo}#${number}`,
      title: String(data.label || "Label event"),
      description: data.added
        ? "Label added by a maintainer."
        : "Label removed by a maintainer.",
    };
  }
  return {
    ...base,
    type: "processing_failed",
    message: `could not complete analysis for ${repo}#${number}`,
    title: "Issue processing failed",
    description:
      "The issue was not marked analyzed because processing did not complete.",
  };
}

export async function readAggregate() {
  const q = await database();
  const capabilities = await sourceCapabilities();
  if (!capabilities.ledger) return emptyAggregate();
  const [row] = await q`
    WITH predictions AS (
      SELECT DISTINCT ON (data->>'repo', data->>'number') data, created_at
      FROM ghic_ledger
      WHERE data->>'type' = 'prediction'
      ORDER BY data->>'repo', data->>'number', id DESC
    ), analyses AS (
      SELECT DISTINCT ON (data->>'repo', data->>'number') data, created_at
      FROM ghic_ledger
      WHERE data->>'type' = 'analysis'
      ORDER BY data->>'repo', data->>'number', id DESC
    ), outcomes AS (
      SELECT DISTINCT ON (data->>'repo', data->>'number') data, created_at
      FROM ghic_ledger
      WHERE data->>'type' = 'outcome'
      ORDER BY data->>'repo', data->>'number', id DESC
    )
    SELECT
      (SELECT count(*) FROM predictions)::int AS issues_scored,
      (SELECT count(*) FROM predictions WHERE data->>'predicted' = '1')::int AS bugs_detected,
      (SELECT count(*) FROM predictions WHERE created_at >= now() - interval '24 hours')::int AS issues_last_24h,
      (SELECT count(*) FROM analyses WHERE data->>'analysis_status' = 'complete')::int AS analyses_completed,
      (SELECT count(*) FROM analyses WHERE data->>'analysis_status' = 'complete'
        AND created_at >= now() - interval '24 hours')::int AS analyses_last_24h,
      (SELECT count(*) FROM analyses WHERE data->'llm_analysis'->>'priority' IN ('high', 'critical'))::int AS high_priority,
      (SELECT count(*) FROM analyses WHERE data->>'needs_maintainer_review' = 'true')::int AS maintainer_review,
      (SELECT count(*) FROM analyses WHERE data->>'repository_evidence_status' <> 'disabled')::int AS retrieval_attempts,
      (SELECT count(*) FROM analyses WHERE data->>'repository_evidence_status' = 'available')::int AS retrieval_successes,
      (SELECT avg((data->>'duration_ms')::numeric) FROM analyses WHERE data->>'duration_ms' ~ '^[0-9]+(\\.[0-9]+)?$') AS average_latency_ms,
      (SELECT count(*) FROM outcomes)::int AS resolved_issues,
      (SELECT count(*) FROM outcomes WHERE created_at >= now() - interval '24 hours')::int AS resolved_last_24h,
      (SELECT count(*) FROM predictions p WHERE NOT EXISTS (
        SELECT 1 FROM outcomes o
        WHERE o.data->>'repo' = p.data->>'repo' AND o.data->>'number' = p.data->>'number'
      ))::int AS open_issues,
      (SELECT count(*) FROM predictions WHERE COALESCE((data->>'related_count')::int, 0) > 0)::int AS duplicate_candidates,
      (SELECT count(*) FROM ghic_ledger WHERE data->>'type' = 'action' AND data->>'action' = 'comment')::int AS comments_posted,
      (SELECT count(*) FROM ghic_ledger WHERE data->>'type' = 'processing_failure'
        AND created_at >= now() - interval '24 hours')::int AS failures_last_24h`;
  return { ...emptyAggregate(), ...row };
}

function emptyAggregate() {
  return {
    issues_scored: 0,
    bugs_detected: 0,
    issues_last_24h: 0,
    analyses_completed: 0,
    analyses_last_24h: 0,
    high_priority: 0,
    maintainer_review: 0,
    retrieval_attempts: 0,
    retrieval_successes: 0,
    average_latency_ms: null,
    resolved_issues: 0,
    resolved_last_24h: 0,
    open_issues: 0,
    duplicate_candidates: 0,
    comments_posted: 0,
    failures_last_24h: 0,
  };
}

export function buildAlerts({
  repositories = [],
  eventRows = [],
  issues = [],
  runtime = null,
  now = new Date(),
} = {}) {
  const alerts = [];
  const timestamp = now.toISOString();
  for (const repository of repositories) {
    if (repository.indexStatus === "failed" || repository.hasIndexError) {
      alerts.push({
        id: `repository-failed-${repository.id}`,
        type: "repository_index",
        severity: "high",
        title: "Repository indexing failed",
        description:
          repository.operationalMessage || "The repository index is not ready.",
        repositoryName: repository.fullName,
        timestamp: repository.updatedAt || timestamp,
        resolved: false,
      });
    } else if (repository.countMismatch) {
      alerts.push({
        id: `repository-count-mismatch-${repository.id}`,
        type: "repository_index",
        severity: "medium",
        title: "Repository index metadata mismatch",
        description:
          "Stored repository state does not match the current chunk and file counts.",
        repositoryName: repository.fullName,
        timestamp: repository.updatedAt || timestamp,
        resolved: false,
      });
    }
  }

  for (const issue of issues) {
    if (
      issue.status !== "open" ||
      !["high", "critical"].includes(issue.priority)
    )
      continue;
    alerts.push({
      id: `high-priority-${issue.id}`,
      type: "issue_priority",
      severity: issue.priority,
      title: `${issue.priority === "critical" ? "Critical" : "High-priority"} issue requires review`,
      description: `${issue.repositoryName}#${issue.number} was analyzed as ${issue.classification}.`,
      repositoryName: issue.repositoryName,
      timestamp: issue.analysisTimestamp || issue.updatedAt || timestamp,
      resolved: false,
    });
  }

  const latestSuccess = new Map();
  for (const row of eventRows) {
    const data = asObject(row.data);
    const key = `${data.repo || ""}#${data.number || ""}`;
    if (data.type === "analysis" && !latestSuccess.has(key)) {
      latestSuccess.set(
        key,
        new Date(toIso(data.at) || row.created_at || 0).getTime(),
      );
      if (data.repository_evidence_status === "unavailable") {
        alerts.push({
          id: `retrieval-unavailable-${row.id}`,
          type: "repository_retrieval",
          severity: "medium",
          title: "Repository evidence unavailable",
          description:
            "GHIC completed this analysis from the issue description without indexed code evidence.",
          repositoryName: data.repo || null,
          timestamp: toIso(data.at) || toIso(row.created_at) || timestamp,
          resolved: false,
        });
      }
    }
  }
  for (const row of eventRows) {
    const data = asObject(row.data);
    if (data.type !== "processing_failure") continue;
    const eventTime = new Date(toIso(data.at) || row.created_at || 0).getTime();
    const key = `${data.repo || ""}#${data.number || ""}`;
    if ((latestSuccess.get(key) || 0) > eventTime) continue;
    alerts.push({
      id: `processing-failure-${row.id}`,
      type: "issue_processing",
      severity: "high",
      title: "GHIC issue processing failed",
      description:
        "The issue was not marked analyzed and requires an operational review.",
      repositoryName: data.repo || null,
      timestamp: toIso(data.at) || toIso(row.created_at) || timestamp,
      resolved: false,
    });
  }

  if (!runtime || runtime.available === false) {
    alerts.push({
      id: "runtime-unavailable",
      type: "system",
      severity: "critical",
      title: "GHIC runtime unavailable",
      description:
        "The dashboard can read persisted data, but the live GHIC health check is unavailable.",
      repositoryName: null,
      timestamp,
      resolved: false,
    });
  } else if (runtime.status !== "ok") {
    alerts.push({
      id: "runtime-degraded",
      type: "system",
      severity: "critical",
      title: "GHIC runtime degraded",
      description:
        "The live GHIC health check is not reporting an operational state.",
      repositoryName: null,
      timestamp,
      resolved: false,
    });
  }

  const signature = runtime?.repository_intelligence?.embedding_signature;
  if (signature) {
    for (const repository of repositories) {
      if (
        repository.indexStatus === "ready" &&
        repository.embeddingSignature &&
        repository.embeddingSignature !== signature
      ) {
        alerts.push({
          id: `embedding-mismatch-${repository.id}`,
          type: "repository_retrieval",
          severity: "critical",
          title: "Repository embedding configuration mismatch",
          description:
            "Runtime embeddings are incompatible with this repository index; retrieval is unavailable.",
          repositoryName: repository.fullName,
          timestamp,
          resolved: false,
        });
      }
    }
  }
  return alerts;
}

export function buildDashboardOverview({
  repositories,
  repositoryTotal,
  indexedRepositoryTotal,
  aggregate,
  eventRows,
  issues,
  runtime,
}) {
  const eventActivity = eventRows.map(activityFromLedgerRow).filter(Boolean);
  const repositoryActivity = repositories
    .map((repository) => {
      const timestamp =
        repository.indexStatus === "ready"
          ? repository.lastIndexedAt
          : repository.updatedAt;
      return timestamp
        ? {
            id: `repository-state-${repository.id}-${timestamp}`,
            type:
              repository.indexStatus === "ready"
                ? "repository_indexed"
                : "repository_index_changed",
            actor: "GHIC",
            repositoryName: repository.fullName,
            timestamp,
            link: `/repositories/${repository.id}`,
            message:
              repository.indexStatus === "ready"
                ? `indexed ${repository.fullName}`
                : `recorded ${repository.fullName} index state as ${repository.indexStatus}`,
          }
        : null;
    })
    .filter(Boolean);
  const activity = [...eventActivity, ...repositoryActivity]
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() -
        new Date(left.timestamp).getTime(),
    )
    .slice(0, 25);
  const alerts = buildAlerts({ repositories, eventRows, issues, runtime });
  const attempts = asNumber(aggregate.retrieval_attempts, 0);
  const successes = asNumber(aggregate.retrieval_successes, 0);
  return {
    stats: {
      trackedRepositories: asNumber(repositoryTotal, repositories.length),
      indexedRepositories: asNumber(
        indexedRepositoryTotal,
        repositories.filter((repo) => repo.indexStatus === "ready").length,
      ),
      issuesScored: asNumber(aggregate.issues_scored, 0),
      bugsDetected: asNumber(aggregate.bugs_detected, 0),
      analysesCompleted: asNumber(aggregate.analyses_completed, 0),
      analysesLast24Hours: asNumber(aggregate.analyses_last_24h, 0),
      highPriorityIssues: asNumber(aggregate.high_priority, 0),
      maintainerReviewIssues: asNumber(aggregate.maintainer_review, 0),
      activeAlerts: alerts.length,
      retrievalSuccessRate: attempts
        ? Math.round((successes / attempts) * 1000) / 10
        : null,
      averageAnalysisLatencyMs:
        aggregate.average_latency_ms == null
          ? null
          : Math.round(asNumber(aggregate.average_latency_ms)),
      openIssues: asNumber(aggregate.open_issues, 0),
      resolvedIssues: asNumber(aggregate.resolved_issues, 0),
      commentsPosted: asNumber(aggregate.comments_posted, 0),
    },
    recentActivity: activity,
    alerts,
    recentAnalyses: issues
      .filter((issue) => issue.analysisTimestamp)
      .slice(0, 8),
    repositoryIndexing: repositories.map((repo) => ({
      id: repo.id,
      fullName: repo.fullName,
      status: repo.indexStatus,
      chunkCount: repo.chunkCount,
      fileCount: repo.fileCount,
      lastIndexedAt: repo.lastIndexedAt,
    })),
    runtime: runtime
      ? {
          available: runtime.available !== false,
          status: runtime.status || "unknown",
          autoIndex: runtime.repository_intelligence?.auto_index ?? null,
          engineeringIntelligence: false,
          automation: false,
        }
      : {
          available: false,
          status: "unavailable",
          autoIndex: null,
          engineeringIntelligence: false,
          automation: false,
        },
  };
}

export async function readAnalytics() {
  const q = await database();
  const capabilities = await sourceCapabilities();
  const aggregate = await readAggregate();
  if (!capabilities.ledger)
    return analyticsFromRows(aggregate, [], [], [], [], []);

  const [trend, byRepository, priorities, severities, classifications] =
    await Promise.all([
      q`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
             count(*)::int AS value
      FROM ghic_ledger
      WHERE data->>'type' = 'analysis'
        AND data->>'analysis_status' = 'complete'
        AND created_at >= now() - interval '30 days'
      GROUP BY 1 ORDER BY 1`,
      q`
      WITH latest AS (
        SELECT DISTINCT ON (data->>'repo', data->>'number') data
        FROM ghic_ledger WHERE data->>'type' = 'prediction'
        ORDER BY data->>'repo', data->>'number', id DESC
      )
      SELECT data->>'repo' AS category, count(*)::int AS count
      FROM latest GROUP BY 1 ORDER BY count DESC, category`,
      q`
      WITH latest AS (
        SELECT DISTINCT ON (data->>'repo', data->>'number') data
        FROM ghic_ledger WHERE data->>'type' = 'analysis'
        ORDER BY data->>'repo', data->>'number', id DESC
      )
      SELECT data->'llm_analysis'->>'priority' AS category, count(*)::int AS count
      FROM latest WHERE data->'llm_analysis'->>'priority' IS NOT NULL
      GROUP BY 1 ORDER BY count DESC, category`,
      q`
      WITH latest AS (
        SELECT DISTINCT ON (data->>'repo', data->>'number') data
        FROM ghic_ledger WHERE data->>'type' = 'analysis'
        ORDER BY data->>'repo', data->>'number', id DESC
      )
      SELECT data->'llm_analysis'->>'severity' AS category, count(*)::int AS count
      FROM latest WHERE data->'llm_analysis'->>'severity' IS NOT NULL
      GROUP BY 1 ORDER BY count DESC, category`,
      q`
      WITH latest_analysis AS (
        SELECT DISTINCT ON (data->>'repo', data->>'number') data
        FROM ghic_ledger WHERE data->>'type' = 'analysis'
        ORDER BY data->>'repo', data->>'number', id DESC
      ), latest_prediction AS (
        SELECT DISTINCT ON (data->>'repo', data->>'number') data
        FROM ghic_ledger WHERE data->>'type' = 'prediction'
        ORDER BY data->>'repo', data->>'number', id DESC
      )
      SELECT category, count(*)::int AS count FROM (
        SELECT COALESCE(data->'llm_analysis'->>'category', data->'category'->>'predicted') AS category
        FROM latest_analysis
        UNION ALL
        SELECT CASE WHEN data->>'predicted' = '1' THEN 'actionable-bug' ELSE 'non-actionable' END
        FROM latest_prediction p
        WHERE NOT EXISTS (
          SELECT 1 FROM latest_analysis a
          WHERE a.data->>'repo' = p.data->>'repo' AND a.data->>'number' = p.data->>'number'
        )
      ) rows WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC, category`,
    ]);
  return analyticsFromRows(
    aggregate,
    trend,
    byRepository,
    priorities,
    severities,
    classifications,
  );
}

export function analyticsFromRows(
  aggregate,
  trend,
  byRepository,
  priorities,
  severities,
  classifications,
) {
  const attempts = asNumber(aggregate.retrieval_attempts, 0);
  const successes = asNumber(aggregate.retrieval_successes, 0);
  return {
    period: "all_time_with_30_day_trend",
    totalIssues: asNumber(aggregate.issues_scored, 0),
    analyzedIssues: asNumber(aggregate.analyses_completed, 0),
    resolvedIssues: asNumber(aggregate.resolved_issues, 0),
    openIssues: asNumber(aggregate.open_issues, 0),
    bugsDetected: asNumber(aggregate.bugs_detected, 0),
    regressions: null,
    duplicatesFound: asNumber(aggregate.duplicate_candidates, 0),
    avgResolutionDays: null,
    averageAnalysisLatencyMs:
      aggregate.average_latency_ms == null
        ? null
        : Math.round(asNumber(aggregate.average_latency_ms)),
    retrievalSuccessRate: attempts
      ? Math.round((successes / attempts) * 1000) / 10
      : null,
    issuesByPriority: priorities.map(categoryCount),
    issuesBySeverity: severities.map(categoryCount),
    issuesByClassification: classifications.map(categoryCount),
    issuesByRepository: byRepository.map(categoryCount),
    trend: trend.map((row) => ({ date: row.date, value: asNumber(row.value) })),
  };
}

const categoryCount = (row) => ({
  category: String(row.category),
  count: asNumber(row.count),
});

export async function searchProductData(query, limit = 20) {
  const q = await database();
  const search = String(query || "").trim();
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(asNumber(limit, 20))));
  if (search.length < 3) {
    return emptySearch(search);
  }
  const capabilities = await sourceCapabilities();
  const [repositories, issueResponse, chunks] = await Promise.all([
    readRepositories({ search, limit: safeLimit }),
    readIssues({ search, limit: safeLimit }),
    capabilities.repoChunks
      ? q(
          `SELECT id, repo, path, language, kind, symbol, parent_symbol,
                  start_line, end_line,
                  CASE
                    WHEN lower(path) LIKE '%' || lower($1) || '%' THEN 3
                    WHEN lower(symbol) LIKE '%' || lower($1) || '%' THEN 2
                    ELSE 1
                  END AS lexical_rank
           FROM ghic_repo_chunks
           WHERE lower(path) LIKE '%' || lower($1) || '%'
              OR lower(symbol) LIKE '%' || lower($1) || '%'
              OR to_tsvector('simple', COALESCE(text, '')) @@ websearch_to_tsquery('simple', $1)
           ORDER BY lexical_rank DESC, repo, path, start_line
           LIMIT $2`,
          [search, safeLimit],
        )
      : Promise.resolve([]),
  ]);

  const repositoryResults = repositories.items.map((repo) => ({
    id: repo.id,
    type: "repository",
    title: repo.fullName,
    description: `${repo.indexStatus}; ${repo.chunkCount} indexed chunks`,
    repositoryName: repo.fullName,
    url: `/repositories/${repo.id}`,
    score: null,
    matchType: "metadata",
    timestamp: repo.updatedAt,
  }));
  const issueResults = issueResponse.items.map((issue) => ({
    id: issue.id,
    type: "issue",
    title: issue.title
      ? `#${issue.number} ${issue.title}`
      : `${issue.repositoryName}#${issue.number}`,
    description: issue.summary || issue.classification,
    repositoryName: issue.repositoryName,
    url: `/issues/${issue.id}`,
    score: null,
    matchType: "analysis",
    timestamp: issue.updatedAt,
  }));
  const codeResults = chunks.map((chunk) => ({
    id: `chunk-${chunk.id}`,
    type: "code",
    title: chunk.symbol
      ? `${chunk.path}:${chunk.parent_symbol ? `${chunk.parent_symbol}.` : ""}${chunk.symbol}`
      : chunk.path,
    description: `${chunk.kind || "code"}; lines ${chunk.start_line}-${chunk.end_line}`,
    repositoryName: chunk.repo,
    url: `/repositories/${repositoryId(chunk.repo)}`,
    score: null,
    matchType: "lexical",
    timestamp: null,
  }));
  return {
    query: search,
    total: repositoryResults.length + issueResults.length + codeResults.length,
    repositories: repositoryResults,
    issues: issueResults,
    code: codeResults,
    commits: [],
    pullRequests: [],
    components: [],
    releases: [],
  };
}

function emptySearch(query) {
  return {
    query,
    total: 0,
    repositories: [],
    issues: [],
    code: [],
    commits: [],
    pullRequests: [],
    components: [],
    releases: [],
  };
}

export async function readDuplicateCandidates() {
  const q = await database();
  const capabilities = await sourceCapabilities();
  if (!capabilities.ledger)
    return { items: [], total: 0, page: 1, limit: 100, available: true };
  const rows = await q`
    SELECT DISTINCT ON (data->>'repo', data->>'number') data, created_at
    FROM ghic_ledger
    WHERE data->>'type' = 'analysis'
      AND jsonb_typeof(data->'related_issues') = 'array'
      AND jsonb_array_length(data->'related_issues') > 0
    ORDER BY data->>'repo', data->>'number', id DESC`;
  const items = rows.map((row, index) => {
    const data = asObject(row.data);
    const repo = String(data.repo || "");
    const number = asNumber(data.number, 0);
    return {
      id: `${repositoryId(repo)}~${number}-duplicates-${index}`,
      primaryIssue: {
        id: `${repositoryId(repo)}~${number}`,
        number,
        title: data.title || null,
        status: data.issue_state || "open",
      },
      possibleDuplicates: (data.related_issues || []).map((candidate) => ({
        issue: {
          id: `${repositoryId(repo)}~${asNumber(candidate.number, 0)}`,
          number: asNumber(candidate.number, 0),
          title: candidate.title || null,
          status: "not_recorded",
        },
        similarity:
          candidate.similarity == null ? null : asNumber(candidate.similarity),
      })),
      sharedComponents: [],
      sharedFiles: [],
      sharedCommits: [],
      recommendedAction: "Review possible duplicate",
      repositoryName: repo,
      createdAt: toIso(data.at) || toIso(row.created_at),
    };
  });
  return { items, total: items.length, page: 1, limit: 100, available: true };
}

export function unavailable(feature, reason) {
  return {
    available: false,
    feature,
    reason,
    items: [],
    data: [],
    total: 0,
    page: 1,
    limit: 50,
  };
}
