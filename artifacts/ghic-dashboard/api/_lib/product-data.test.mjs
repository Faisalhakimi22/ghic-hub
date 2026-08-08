import assert from "node:assert/strict";
import test from "node:test";

import {
  activityFromLedgerRow,
  buildAlerts,
  buildDashboardOverview,
  issueFromRow,
  normalizeRepositoryRow,
} from "./product-data.mjs";

test("repository normalization uses stored state and actual counts without fake scores", () => {
  const repository = normalizeRepositoryRow({
    repo: "acme/widgets",
    state: "ready",
    updated_at: "2026-08-01T10:00:00Z",
    actual_chunk_count: 12,
    actual_file_count: 4,
    repository_private: true,
    data: {
      repo: "acme/widgets",
      indexed_commit_sha: "abc123",
      chunk_count: 12,
      file_count: 4,
      primary_language: "Python",
      embedding_provider: "openai",
      embedding_model: "mistralai/codestral-embed-2505",
      embedding_dimensions: 1536,
      vector_backend: "postgres",
      indexed_at: 1785578400,
    },
  });

  assert.equal(repository.fullName, "acme/widgets");
  assert.equal(repository.visibility, "private");
  assert.equal(repository.health, "healthy");
  assert.equal(repository.healthScore, null);
  assert.equal(repository.riskScore, null);
  assert.equal(repository.chunkCount, 12);
  assert.equal(
    repository.embeddingSignature,
    "openai:mistralai/codestral-embed-2505:1536",
  );
});

test("issue shaping keeps statistical and AI judgments separate", () => {
  const issue = issueFromRow({
    repo: "acme/widgets",
    number: 42,
    prediction: { proba: 0.82, predicted: 1, at: "2026-08-01T10:00:00Z" },
    prediction_created_at: "2026-08-01T10:00:00Z",
    analysis_created_at: "2026-08-01T10:00:03Z",
    comment_posted: true,
    analysis: {
      title: "CSV import crashes on Windows-1252",
      issue_state: "open",
      prediction: {
        proba_actionable_bug: 0.82,
        threshold: 0.5,
        predicted_label: 1,
        predicted_class: "actionable-bug",
      },
      llm_analysis: {
        category: "bug",
        priority: "high",
        severity: "medium",
        confidence: 0.91,
        summary: "CSV decoding fails for non-UTF-8 input.",
        recommended_action: "Handle the reported encoding explicitly.",
        reasoning: ["The report contains reproduction steps."],
        risk_reasons: ["Import is blocked."],
        missing_information: [],
        recommended_labels: ["bug"],
      },
      repository_evidence_status: "available",
      repository_context: {
        relevant_files: ["ghic/label.py"],
        relevant_symbols: ["_read_collected_csv"],
        chunks: [
          { path: "ghic/label.py", symbol: "_read_collected_csv", score: 0.7 },
        ],
      },
      related_issues: [
        { number: 7, title: "Same CSV failure", similarity: 0.88 },
      ],
      analysis_status: "complete",
      duration_ms: 3200,
    },
  });

  assert.equal(issue.statisticalScore, 0.82);
  assert.equal(issue.priority, "high");
  assert.equal(issue.severity, "medium");
  assert.equal(issue.classification, "bug");
  assert.equal(issue.relevantFunctions[0], "_read_collected_csv");
  assert.deepEqual(issue.relatedIssues[0], {
    id: "acme~widgets~7",
    number: 7,
    title: "Same CSV failure",
    status: "not_recorded",
    similarity: 0.88,
  });
  assert.equal(issue.commentPosted, true);
});

test("processing failures never become successful activity", () => {
  const activity = activityFromLedgerRow({
    id: 7,
    created_at: "2026-08-01T10:00:00Z",
    data: { type: "processing_failure", repo: "acme/widgets", number: 42 },
  });
  assert.equal(activity.type, "processing_failed");
  assert.match(activity.description, /not marked analyzed/i);
});

test("overview counts only real rows and reports unavailable runtime", () => {
  const repositories = [
    normalizeRepositoryRow({
      repo: "acme/widgets",
      state: "ready",
      actual_chunk_count: 1,
      actual_file_count: 1,
      data: { chunk_count: 1, file_count: 1 },
    }),
  ];
  const eventRows = [];
  const alerts = buildAlerts({
    repositories,
    eventRows,
    runtime: { available: false },
  });
  assert.equal(
    alerts.some((alert) => alert.id === "runtime-unavailable"),
    true,
  );

  const overview = buildDashboardOverview({
    repositories,
    repositoryTotal: 3,
    indexedRepositoryTotal: 2,
    aggregate: {
      issues_scored: 3,
      bugs_detected: 2,
      analyses_completed: 1,
      analyses_last_24h: 1,
      high_priority: 1,
      maintainer_review: 0,
      retrieval_attempts: 1,
      retrieval_successes: 1,
      open_issues: 2,
      resolved_issues: 1,
      comments_posted: 1,
    },
    eventRows,
    issues: [],
    runtime: { available: false },
  });
  assert.equal(overview.stats.trackedRepositories, 3);
  assert.equal(overview.stats.indexedRepositories, 2);
  assert.equal(overview.stats.retrievalSuccessRate, 100);
  assert.equal(overview.stats.activeAlerts, 1);
});

test("overview derives index activity and high-priority alerts only from persisted records", () => {
  const repositories = [
    normalizeRepositoryRow({
      repo: "acme/widgets",
      state: "ready",
      updated_at: "2026-08-01T10:00:00Z",
      actual_chunk_count: 2,
      actual_file_count: 1,
      data: { chunk_count: 2, file_count: 1, indexed_at: 1785578400 },
    }),
  ];
  const issues = [
    {
      id: "acme~widgets~42",
      repositoryName: "acme/widgets",
      number: 42,
      status: "open",
      priority: "high",
      classification: "bug",
      analysisTimestamp: "2026-08-01T11:00:00Z",
      updatedAt: "2026-08-01T11:00:00Z",
    },
  ];
  const overview = buildDashboardOverview({
    repositories,
    issues,
    eventRows: [],
    aggregate: {},
    runtime: { available: true, status: "ok" },
  });
  assert.equal(overview.recentActivity[0].type, "repository_indexed");
  assert.equal(overview.alerts[0].id, "high-priority-acme~widgets~42");
  assert.equal(overview.alerts[0].severity, "high");
});
