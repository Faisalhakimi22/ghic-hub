// Mock data for GHIC Engineering Intelligence Platform

export const mockRepositories = [
  {
    id: "repo-1",
    name: "api-gateway",
    fullName: "acme-corp/api-gateway",
    owner: "acme-corp",
    visibility: "private",
    language: "TypeScript",
    framework: "Express",
    defaultBranch: "main",
    sizeKb: 48320,
    stars: 12,
    forks: 3,
    openIssues: 47,
    contributors: 8,
    healthScore: 72,
    riskScore: 38,
    lastIndexedAt: "2026-08-06T10:14:00Z",
    indexStatus: "indexed",
    repositoryIntelligenceStatus: "active",
    engineeringIntelligenceStatus: "active",
    webhookStatus: "healthy",
    installationStatus: "installed",
    description: "Central API gateway handling authentication, routing, and rate limiting",
    url: "https://github.com/acme-corp/api-gateway",
    createdAt: "2023-01-15T08:00:00Z",
    updatedAt: "2026-08-06T10:14:00Z",
  },
  {
    id: "repo-2",
    name: "data-pipeline",
    fullName: "acme-corp/data-pipeline",
    owner: "acme-corp",
    visibility: "private",
    language: "Python",
    framework: "FastAPI",
    defaultBranch: "main",
    sizeKb: 22100,
    stars: 5,
    forks: 1,
    openIssues: 23,
    contributors: 4,
    healthScore: 58,
    riskScore: 61,
    lastIndexedAt: "2026-08-06T09:45:00Z",
    indexStatus: "indexed",
    repositoryIntelligenceStatus: "active",
    engineeringIntelligenceStatus: "degraded",
    webhookStatus: "healthy",
    installationStatus: "installed",
    description: "Real-time data ingestion and processing pipeline",
    url: "https://github.com/acme-corp/data-pipeline",
    createdAt: "2023-06-01T08:00:00Z",
    updatedAt: "2026-08-05T22:30:00Z",
  },
  {
    id: "repo-3",
    name: "frontend-app",
    fullName: "acme-corp/frontend-app",
    owner: "acme-corp",
    visibility: "private",
    language: "TypeScript",
    framework: "React",
    defaultBranch: "main",
    sizeKb: 31500,
    stars: 8,
    forks: 2,
    openIssues: 31,
    contributors: 6,
    healthScore: 85,
    riskScore: 22,
    lastIndexedAt: "2026-08-06T11:00:00Z",
    indexStatus: "indexed",
    repositoryIntelligenceStatus: "active",
    engineeringIntelligenceStatus: "active",
    webhookStatus: "healthy",
    installationStatus: "installed",
    description: "Main customer-facing React application",
    url: "https://github.com/acme-corp/frontend-app",
    createdAt: "2022-09-10T08:00:00Z",
    updatedAt: "2026-08-06T11:00:00Z",
  },
  {
    id: "repo-4",
    name: "ml-inference",
    fullName: "acme-corp/ml-inference",
    owner: "acme-corp",
    visibility: "private",
    language: "Python",
    framework: "PyTorch",
    defaultBranch: "main",
    sizeKb: 15800,
    stars: 19,
    forks: 4,
    openIssues: 12,
    contributors: 3,
    healthScore: 91,
    riskScore: 14,
    lastIndexedAt: "2026-08-06T08:30:00Z",
    indexStatus: "indexed",
    repositoryIntelligenceStatus: "active",
    engineeringIntelligenceStatus: "active",
    webhookStatus: "healthy",
    installationStatus: "installed",
    description: "ML model serving and inference service",
    url: "https://github.com/acme-corp/ml-inference",
    createdAt: "2024-02-20T08:00:00Z",
    updatedAt: "2026-08-06T08:30:00Z",
  },
  {
    id: "repo-5",
    name: "auth-service",
    fullName: "acme-corp/auth-service",
    owner: "acme-corp",
    visibility: "private",
    language: "Go",
    framework: "Gin",
    defaultBranch: "main",
    sizeKb: 9200,
    stars: 7,
    forks: 1,
    openIssues: 8,
    contributors: 3,
    healthScore: 88,
    riskScore: 19,
    lastIndexedAt: "2026-08-06T07:15:00Z",
    indexStatus: "indexed",
    repositoryIntelligenceStatus: "active",
    engineeringIntelligenceStatus: "active",
    webhookStatus: "healthy",
    installationStatus: "installed",
    description: "OAuth 2.0 and JWT authentication service",
    url: "https://github.com/acme-corp/auth-service",
    createdAt: "2023-03-05T08:00:00Z",
    updatedAt: "2026-08-06T07:15:00Z",
  },
  {
    id: "repo-6",
    name: "notification-worker",
    fullName: "acme-corp/notification-worker",
    owner: "acme-corp",
    visibility: "private",
    language: "TypeScript",
    framework: "Node.js",
    defaultBranch: "main",
    sizeKb: 7400,
    stars: 2,
    forks: 0,
    openIssues: 5,
    contributors: 2,
    healthScore: 79,
    riskScore: 28,
    lastIndexedAt: "2026-08-05T18:00:00Z",
    indexStatus: "stale",
    repositoryIntelligenceStatus: "degraded",
    engineeringIntelligenceStatus: "inactive",
    webhookStatus: "warning",
    installationStatus: "installed",
    description: "Async notification delivery worker (email, SMS, push)",
    url: "https://github.com/acme-corp/notification-worker",
    createdAt: "2024-07-01T08:00:00Z",
    updatedAt: "2026-08-05T18:00:00Z",
  },
];

export const mockIssues = [
  {
    id: "issue-1",
    number: 847,
    repositoryId: "repo-1",
    repositoryName: "api-gateway",
    title: "Memory leak in connection pool under high concurrent load",
    status: "open",
    priority: "critical",
    severity: "high",
    classification: "performance",
    actionability: "high",
    confidence: 0.94,
    labels: ["memory-leak", "performance", "production"],
    assignee: "jsmith",
    createdAt: "2026-08-04T14:22:00Z",
    updatedAt: "2026-08-06T09:15:00Z",
    aiStatus: "analyzed",
    hasEngineeringReport: true,
    url: "https://github.com/acme-corp/api-gateway/issues/847",
  },
  {
    id: "issue-2",
    number: 234,
    repositoryId: "repo-2",
    repositoryName: "data-pipeline",
    title: "Kafka consumer group rebalancing causes duplicate message processing",
    status: "open",
    priority: "high",
    severity: "high",
    classification: "correctness",
    actionability: "high",
    confidence: 0.89,
    labels: ["kafka", "data-integrity", "regression"],
    assignee: "alee",
    createdAt: "2026-08-05T08:10:00Z",
    updatedAt: "2026-08-06T10:00:00Z",
    aiStatus: "analyzed",
    hasEngineeringReport: true,
    url: "https://github.com/acme-corp/data-pipeline/issues/234",
  },
  {
    id: "issue-3",
    number: 512,
    repositoryId: "repo-3",
    repositoryName: "frontend-app",
    title: "React Query cache invalidation not firing after optimistic update",
    status: "open",
    priority: "medium",
    severity: "medium",
    classification: "bug",
    actionability: "medium",
    confidence: 0.82,
    labels: ["react-query", "cache", "frontend"],
    assignee: null,
    createdAt: "2026-08-03T16:30:00Z",
    updatedAt: "2026-08-05T12:00:00Z",
    aiStatus: "analyzed",
    hasEngineeringReport: true,
    url: "https://github.com/acme-corp/frontend-app/issues/512",
  },
  {
    id: "issue-4",
    number: 848,
    repositoryId: "repo-1",
    repositoryName: "api-gateway",
    title: "Rate limiter bypass via malformed X-Forwarded-For header",
    status: "open",
    priority: "critical",
    severity: "critical",
    classification: "security",
    actionability: "high",
    confidence: 0.97,
    labels: ["security", "rate-limiting", "vulnerability"],
    assignee: "mwilson",
    createdAt: "2026-08-06T06:45:00Z",
    updatedAt: "2026-08-06T11:20:00Z",
    aiStatus: "analyzed",
    hasEngineeringReport: true,
    url: "https://github.com/acme-corp/api-gateway/issues/848",
  },
  {
    id: "issue-5",
    number: 513,
    repositoryId: "repo-3",
    repositoryName: "frontend-app",
    title: "Bundle size regression after upgrading to webpack 5.92",
    status: "open",
    priority: "medium",
    severity: "low",
    classification: "regression",
    actionability: "low",
    confidence: 0.76,
    labels: ["bundle-size", "webpack", "regression"],
    assignee: null,
    createdAt: "2026-08-02T09:00:00Z",
    updatedAt: "2026-08-04T14:00:00Z",
    aiStatus: "pending",
    hasEngineeringReport: false,
    url: "https://github.com/acme-corp/frontend-app/issues/513",
  },
  {
    id: "issue-6",
    number: 99,
    repositoryId: "repo-5",
    repositoryName: "auth-service",
    title: "JWT refresh token rotation window too narrow — spurious 401s",
    status: "open",
    priority: "high",
    severity: "medium",
    classification: "bug",
    actionability: "high",
    confidence: 0.88,
    labels: ["jwt", "auth", "ux"],
    assignee: "tchen",
    createdAt: "2026-08-01T11:00:00Z",
    updatedAt: "2026-08-06T08:00:00Z",
    aiStatus: "analyzed",
    hasEngineeringReport: true,
    url: "https://github.com/acme-corp/auth-service/issues/99",
  },
  {
    id: "issue-7",
    number: 235,
    repositoryId: "repo-2",
    repositoryName: "data-pipeline",
    title: "Schema evolution breaks backward compatibility for Avro records",
    status: "open",
    priority: "low",
    severity: "medium",
    classification: "data-model",
    actionability: "medium",
    confidence: 0.71,
    labels: ["avro", "schema", "backward-compat"],
    assignee: null,
    createdAt: "2026-07-28T14:00:00Z",
    updatedAt: "2026-08-03T10:00:00Z",
    aiStatus: "analyzed",
    hasEngineeringReport: false,
    url: "https://github.com/acme-corp/data-pipeline/issues/235",
  },
  {
    id: "issue-8",
    number: 41,
    repositoryId: "repo-4",
    repositoryName: "ml-inference",
    title: "GPU memory not released between batched inference requests",
    status: "open",
    priority: "high",
    severity: "high",
    classification: "performance",
    actionability: "high",
    confidence: 0.91,
    labels: ["gpu", "memory", "inference"],
    assignee: "rgupta",
    createdAt: "2026-08-05T17:00:00Z",
    updatedAt: "2026-08-06T07:30:00Z",
    aiStatus: "analyzed",
    hasEngineeringReport: true,
    url: "https://github.com/acme-corp/ml-inference/issues/41",
  },
];

export const mockIssueDetail = {
  issue: mockIssues[0],
  executiveSummary:
    "A memory leak has been identified in the connection pool manager. Under sustained concurrent load (>500 req/s), connections are not properly returned to the pool after request completion when errors occur mid-stream. Over 30–60 minutes this exhausts available file descriptors, causing cascading 503 responses. The root cause is traced to error handling in the `keepAlive` interceptor introduced in commit a4f8d2b.",
  rootCauseAnalysis:
    "The `ConnectionPoolManager.release()` method is not called in the `finally` block of the request pipeline when the response stream emits an error event before completion. This path was introduced in the refactor of the HTTP/2 multiplexing layer (PR #841). The `onError` handler calls `connection.destroy()` directly, bypassing pool release, leaving the connection in a dangling state that is never garbage collected.",
  regressionSignals:
    "Memory usage trend shows a consistent upward slope starting at the time of deployment on 2026-08-03T14:30Z. Pod restart count increased from 0.1/day to 3.2/day. Connection pool saturation alerts began firing 2 hours after deploy. Heap snapshots confirm growing `TLSSocket` count.",
  engineeringImpact:
    "Production impact: ~8% of requests under high load return 503. P99 latency increased 340ms. Pod restarts are masking the root cause — each restart temporarily alleviates pressure. Estimated 2–3 engineers × 2 days to fix and validate.",
  investigationPlan:
    "1. Add `finally { pool.release(conn) }` to the request pipeline error path. 2. Write load test that triggers error paths under 600 req/s sustained. 3. Add metric: `connection_pool.dangling_connections`. 4. Deploy canary with fix and monitor for 4 hours before full rollout.",
  suggestedTests: [
    "Test: connection returned to pool after stream error",
    "Load test: 600 req/s with 10% error injection — pool should not grow",
    "Integration test: HTTP/2 multiplexed request interrupted mid-stream",
    "Test: memory usage stable over 60 minutes at P95 load",
  ],
  suggestedLabels: ["memory-leak", "performance", "regression", "hotfix"],
  suggestedAssignee: "jsmith",
  missingInformation:
    "Exact threshold at which pool saturation begins. Whether the leak also occurs on HTTP/1.1 connections. Heap dump from production pod before restart.",
  relevantFiles: [
    "src/pool/ConnectionPoolManager.ts",
    "src/middleware/keepAlive.ts",
    "src/http2/multiplexer.ts",
    "src/pipeline/RequestPipeline.ts",
  ],
  relevantFunctions: [
    "ConnectionPoolManager.release()",
    "ConnectionPoolManager.acquire()",
    "KeepAliveInterceptor.onError()",
    "RequestPipeline.execute()",
  ],
  relevantComponents: ["ConnectionPool", "HTTP2Multiplexer", "RequestPipeline"],
  relatedCommits: [
    { sha: "a4f8d2b3c1e9f4a5d8b2c6e3f1a9b4d7c2e5f8a1", message: "refactor: HTTP/2 multiplexing layer overhaul", author: "jsmith", date: "2026-08-03T14:00:00Z" },
    { sha: "b3c7e1f4a9d2c8e5f3b1a6d4e9c2f7a4b8d1e6f9", message: "feat: add keepAlive interceptor for connection reuse", author: "jsmith", date: "2026-08-03T12:30:00Z" },
  ],
  relatedPullRequests: [
    { number: 841, title: "HTTP/2 multiplexing layer refactor", status: "merged", url: "https://github.com/acme-corp/api-gateway/pull/841" },
  ],
  relatedIssues: [
    { id: "issue-4", number: 848, title: "Rate limiter bypass via malformed X-Forwarded-For header", status: "open" },
  ],
  timeline: [
    { id: "tl-1", type: "opened", actor: "alerting-bot", description: "Issue auto-created from PagerDuty alert", timestamp: "2026-08-04T14:22:00Z" },
    { id: "tl-2", type: "assigned", actor: "mwilson", description: "Assigned to jsmith", timestamp: "2026-08-04T15:00:00Z" },
    { id: "tl-3", type: "ai-analyzed", actor: "ghic-ai", description: "AI analysis completed — high confidence regression detected", timestamp: "2026-08-04T15:05:00Z" },
    { id: "tl-4", type: "commented", actor: "jsmith", description: "Confirmed leak visible in heap snapshot. Investigating keepAlive interceptor.", timestamp: "2026-08-05T09:30:00Z" },
    { id: "tl-5", type: "label-added", actor: "jsmith", description: "Added label: hotfix", timestamp: "2026-08-06T09:15:00Z" },
  ],
  automationSuggestions: [
    { id: "auto-1", type: "label", issueId: "issue-1", issueTitle: "Memory leak in connection pool", repositoryId: "repo-1", repositoryName: "api-gateway", content: "Add labels: memory-leak, hotfix, regression", status: "pending", confidence: 0.94, createdAt: "2026-08-04T15:05:00Z", reviewedAt: null, reviewedBy: null },
    { id: "auto-2", type: "test", issueId: "issue-1", issueTitle: "Memory leak in connection pool", repositoryId: "repo-1", repositoryName: "api-gateway", content: "Generate test: verify connection returned to pool after stream error in ConnectionPoolManager", status: "pending", confidence: 0.88, createdAt: "2026-08-04T15:05:00Z", reviewedAt: null, reviewedBy: null },
  ],
};

export const mockCommits = [
  { id: "c1", sha: "a4f8d2b3c1e9f4a5d8b2c6e3f1a9b4d7c2e5f8a1", shortSha: "a4f8d2b", message: "refactor: HTTP/2 multiplexing layer overhaul", author: "jsmith", authorAvatarUrl: null, repositoryId: "repo-1", repositoryName: "api-gateway", date: "2026-08-03T14:00:00Z", filesChanged: 18, additions: 412, deletions: 287, relatedIssues: ["847"], relatedPrs: ["841"], risk: "high", regressionSignals: true, affectedComponents: ["ConnectionPool", "HTTP2Multiplexer"], aiSummary: "Major refactor of the HTTP/2 multiplexing layer. Introduces keepAlive interceptor but removes explicit pool release in error paths.", url: "https://github.com/acme-corp/api-gateway/commit/a4f8d2b" },
  { id: "c2", sha: "b3c7e1f4a9d2c8e5f3b1a6d4e9c2f7a4b8d1e6f9", shortSha: "b3c7e1f", message: "feat: add request deduplication middleware", author: "mwilson", authorAvatarUrl: null, repositoryId: "repo-1", repositoryName: "api-gateway", date: "2026-08-04T10:00:00Z", filesChanged: 5, additions: 89, deletions: 12, relatedIssues: [], relatedPrs: ["842"], risk: "low", regressionSignals: false, affectedComponents: ["RequestPipeline"], aiSummary: "Idempotency key middleware for deduplicating POST requests. Well-scoped change.", url: "https://github.com/acme-corp/api-gateway/commit/b3c7e1f" },
  { id: "c3", sha: "c1d4e8f2a5b9c3d7e1f4a8b2c6d9e3f7a1b5c8d2", shortSha: "c1d4e8f", message: "fix: prevent duplicate Kafka message processing on rebalance", author: "alee", authorAvatarUrl: null, repositoryId: "repo-2", repositoryName: "data-pipeline", date: "2026-08-05T16:00:00Z", filesChanged: 7, additions: 143, deletions: 61, relatedIssues: ["234"], relatedPrs: ["89"], risk: "medium", regressionSignals: false, affectedComponents: ["KafkaConsumer", "MessageProcessor"], aiSummary: "Adds distributed lock using Redis to prevent duplicate processing during consumer group rebalancing.", url: "https://github.com/acme-corp/data-pipeline/commit/c1d4e8f" },
  { id: "c4", sha: "d2e5f9a3b7c1d4e8f2a6b9c3d7e1f4a8b2c5d9e3", shortSha: "d2e5f9a", message: "chore: upgrade webpack 5.92 and adjust code splitting", author: "kpatel", authorAvatarUrl: null, repositoryId: "repo-3", repositoryName: "frontend-app", date: "2026-08-01T09:00:00Z", filesChanged: 12, additions: 78, deletions: 34, relatedIssues: ["513"], relatedPrs: ["278"], risk: "medium", regressionSignals: true, affectedComponents: ["BuildSystem"], aiSummary: "Webpack upgrade introduces bundle size regression in the vendor chunk. Code splitting config needs adjustment.", url: "https://github.com/acme-corp/frontend-app/commit/d2e5f9a" },
  { id: "c5", sha: "e3f7a1b5c9d2e6f3a7b1c4d8e2f5a9b3c7d1e4f8", shortSha: "e3f7a1b", message: "feat: add JWT sliding window refresh with configurable rotation", author: "tchen", authorAvatarUrl: null, repositoryId: "repo-5", repositoryName: "auth-service", date: "2026-07-30T13:00:00Z", filesChanged: 4, additions: 67, deletions: 23, relatedIssues: ["99"], relatedPrs: ["55"], risk: "medium", regressionSignals: false, affectedComponents: ["JWTService", "RefreshTokenHandler"], aiSummary: "Sliding window approach for JWT refresh. The rotation window may be too narrow under latency — needs monitoring.", url: "https://github.com/acme-corp/auth-service/commit/e3f7a1b" },
];

export const mockPullRequests = [
  { id: "pr-1", number: 841, title: "HTTP/2 multiplexing layer overhaul", status: "merged", repositoryId: "repo-1", repositoryName: "api-gateway", author: "jsmith", authorAvatarUrl: null, relatedIssues: ["847"], risk: "high", reviewComplexity: "high", affectedComponents: ["ConnectionPool", "HTTP2Multiplexer", "RequestPipeline"], estimatedTesting: "4–6 hours", linkedRelease: "v2.14.0", createdAt: "2026-08-02T10:00:00Z", updatedAt: "2026-08-03T15:00:00Z", url: "https://github.com/acme-corp/api-gateway/pull/841" },
  { id: "pr-2", number: 842, title: "Add request deduplication middleware", status: "open", repositoryId: "repo-1", repositoryName: "api-gateway", author: "mwilson", authorAvatarUrl: null, relatedIssues: [], risk: "low", reviewComplexity: "low", affectedComponents: ["RequestPipeline"], estimatedTesting: "1 hour", linkedRelease: null, createdAt: "2026-08-04T10:30:00Z", updatedAt: "2026-08-05T08:00:00Z", url: "https://github.com/acme-corp/api-gateway/pull/842" },
  { id: "pr-3", number: 89, title: "Fix duplicate Kafka message processing", status: "open", repositoryId: "repo-2", repositoryName: "data-pipeline", author: "alee", authorAvatarUrl: null, relatedIssues: ["234"], risk: "medium", reviewComplexity: "medium", affectedComponents: ["KafkaConsumer", "MessageProcessor"], estimatedTesting: "2–3 hours", linkedRelease: null, createdAt: "2026-08-05T17:00:00Z", updatedAt: "2026-08-06T09:00:00Z", url: "https://github.com/acme-corp/data-pipeline/pull/89" },
  { id: "pr-4", number: 278, title: "Webpack 5.92 upgrade and bundle optimization", status: "open", repositoryId: "repo-3", repositoryName: "frontend-app", author: "kpatel", authorAvatarUrl: null, relatedIssues: ["513"], risk: "medium", reviewComplexity: "medium", affectedComponents: ["BuildSystem"], estimatedTesting: "2 hours", linkedRelease: null, createdAt: "2026-08-01T09:30:00Z", updatedAt: "2026-08-04T15:00:00Z", url: "https://github.com/acme-corp/frontend-app/pull/278" },
  { id: "pr-5", number: 55, title: "JWT sliding window refresh implementation", status: "merged", repositoryId: "repo-5", repositoryName: "auth-service", author: "tchen", authorAvatarUrl: null, relatedIssues: ["99"], risk: "medium", reviewComplexity: "medium", affectedComponents: ["JWTService"], estimatedTesting: "3 hours", linkedRelease: "v1.8.0", createdAt: "2026-07-29T14:00:00Z", updatedAt: "2026-07-31T10:00:00Z", url: "https://github.com/acme-corp/auth-service/pull/55" },
];

export const mockReleases = [
  { id: "rel-1", version: "v2.14.0", repositoryId: "repo-1", repositoryName: "api-gateway", releaseDate: "2026-08-03T16:00:00Z", issuesIntroduced: 2, issuesFixed: 5, regressionCount: 1, risk: "high", affectedComponents: ["ConnectionPool", "HTTP2Multiplexer"], health: "degraded", rollbackRisk: "medium", url: "https://github.com/acme-corp/api-gateway/releases/tag/v2.14.0" },
  { id: "rel-2", version: "v2.13.2", repositoryId: "repo-1", repositoryName: "api-gateway", releaseDate: "2026-07-25T12:00:00Z", issuesIntroduced: 0, issuesFixed: 8, regressionCount: 0, risk: "low", affectedComponents: ["RateLimiter", "Logging"], health: "healthy", rollbackRisk: "low", url: "https://github.com/acme-corp/api-gateway/releases/tag/v2.13.2" },
  { id: "rel-3", version: "v1.9.0", repositoryId: "repo-2", repositoryName: "data-pipeline", releaseDate: "2026-07-30T10:00:00Z", issuesIntroduced: 1, issuesFixed: 3, regressionCount: 0, risk: "medium", affectedComponents: ["KafkaConsumer"], health: "healthy", rollbackRisk: "low", url: "https://github.com/acme-corp/data-pipeline/releases/tag/v1.9.0" },
  { id: "rel-4", version: "v1.8.0", repositoryId: "repo-5", repositoryName: "auth-service", releaseDate: "2026-07-31T14:00:00Z", issuesIntroduced: 1, issuesFixed: 2, regressionCount: 0, risk: "medium", affectedComponents: ["JWTService"], health: "warning", rollbackRisk: "medium", url: "https://github.com/acme-corp/auth-service/releases/tag/v1.8.0" },
];

export const mockComponents = [
  { id: "comp-1", name: "ConnectionPool", repositoryId: "repo-1", repositoryName: "api-gateway", path: "src/pool/", health: "critical", healthScore: 28, risk: "critical", riskScore: 87, issueCount: 3, regressionCount: 1, recentCommits: 5, recentIssues: 2, relatedFiles: ["src/pool/ConnectionPoolManager.ts", "src/pool/PoolConfig.ts"], mostActiveContributors: ["jsmith", "mwilson"], lastUpdated: "2026-08-03T14:00:00Z" },
  { id: "comp-2", name: "KafkaConsumer", repositoryId: "repo-2", repositoryName: "data-pipeline", path: "src/consumers/", health: "warning", healthScore: 54, risk: "high", riskScore: 65, issueCount: 2, regressionCount: 0, recentCommits: 3, recentIssues: 1, relatedFiles: ["src/consumers/KafkaConsumer.ts", "src/consumers/ConsumerGroup.ts"], mostActiveContributors: ["alee"], lastUpdated: "2026-08-05T16:00:00Z" },
  { id: "comp-3", name: "JWTService", repositoryId: "repo-5", repositoryName: "auth-service", path: "src/jwt/", health: "warning", healthScore: 67, risk: "medium", riskScore: 41, issueCount: 1, regressionCount: 0, recentCommits: 2, recentIssues: 1, relatedFiles: ["src/jwt/JWTService.ts", "src/jwt/RefreshTokenHandler.ts"], mostActiveContributors: ["tchen"], lastUpdated: "2026-07-30T13:00:00Z" },
  { id: "comp-4", name: "RequestPipeline", repositoryId: "repo-1", repositoryName: "api-gateway", path: "src/pipeline/", health: "healthy", healthScore: 82, risk: "low", riskScore: 24, issueCount: 0, regressionCount: 0, recentCommits: 4, recentIssues: 0, relatedFiles: ["src/pipeline/RequestPipeline.ts"], mostActiveContributors: ["jsmith", "mwilson"], lastUpdated: "2026-08-04T10:00:00Z" },
  { id: "comp-5", name: "InferenceEngine", repositoryId: "repo-4", repositoryName: "ml-inference", path: "src/inference/", health: "warning", healthScore: 70, risk: "medium", riskScore: 38, issueCount: 1, regressionCount: 0, recentCommits: 1, recentIssues: 1, relatedFiles: ["src/inference/InferenceEngine.py", "src/inference/GPUMemoryManager.py"], mostActiveContributors: ["rgupta"], lastUpdated: "2026-08-05T17:00:00Z" },
];

export const mockDuplicateClusters = [
  {
    id: "dup-1",
    primaryIssue: { id: "issue-1", number: 847, title: "Memory leak in connection pool under high concurrent load", status: "open" },
    possibleDuplicates: [
      { issue: { id: "issue-9", number: 819, title: "Connection pool exhaustion after extended runtime", status: "closed" }, similarity: 0.91 },
      { issue: { id: "issue-10", number: 803, title: "API gateway OOM kill under load test", status: "closed" }, similarity: 0.78 },
    ],
    sharedComponents: ["ConnectionPool"],
    sharedFiles: ["src/pool/ConnectionPoolManager.ts"],
    sharedCommits: ["a4f8d2b"],
    recommendedAction: "Review closed issues 819 and 803 — likely same root cause. Consider merging and reopening #819.",
    createdAt: "2026-08-04T15:10:00Z",
  },
  {
    id: "dup-2",
    primaryIssue: { id: "issue-2", number: 234, title: "Kafka consumer group rebalancing causes duplicate message processing", status: "open" },
    possibleDuplicates: [
      { issue: { id: "issue-11", number: 218, title: "Duplicate events during Kafka partition reassignment", status: "closed" }, similarity: 0.86 },
    ],
    sharedComponents: ["KafkaConsumer"],
    sharedFiles: ["src/consumers/KafkaConsumer.ts"],
    sharedCommits: [],
    recommendedAction: "Possible duplicate of #218. Review context before proceeding with fix.",
    createdAt: "2026-08-05T09:00:00Z",
  },
];

export const mockRegressions = [
  {
    id: "reg-1",
    issue: { id: "issue-1", number: 847, title: "Memory leak in connection pool under high concurrent load", status: "open" },
    confidence: 0.94,
    relatedCommit: "a4f8d2b3c1e9f4a5d8b2c6e3f1a9b4d7c2e5f8a1",
    relatedCommitSha: "a4f8d2b",
    relatedRelease: "v2.14.0",
    affectedFiles: ["src/pool/ConnectionPoolManager.ts", "src/middleware/keepAlive.ts"],
    regressionWindowStart: "2026-08-03T14:30:00Z",
    regressionWindowEnd: "2026-08-06T00:00:00Z",
    investigationStatus: "in-progress",
    repositoryId: "repo-1",
    repositoryName: "api-gateway",
    detectedAt: "2026-08-04T15:05:00Z",
  },
  {
    id: "reg-2",
    issue: { id: "issue-5", number: 513, title: "Bundle size regression after upgrading to webpack 5.92", status: "open" },
    confidence: 0.76,
    relatedCommit: "d2e5f9a3b7c1d4e8f2a6b9c3d7e1f4a8b2c5d9e3",
    relatedCommitSha: "d2e5f9a",
    relatedRelease: null,
    affectedFiles: ["webpack.config.js", "src/vendor.ts"],
    regressionWindowStart: "2026-08-01T09:00:00Z",
    regressionWindowEnd: "2026-08-06T00:00:00Z",
    investigationStatus: "open",
    repositoryId: "repo-3",
    repositoryName: "frontend-app",
    detectedAt: "2026-08-02T10:00:00Z",
  },
];

export const mockAutomationSuggestions = [
  { id: "auto-1", type: "label", issueId: "issue-1", issueTitle: "Memory leak in connection pool", repositoryId: "repo-1", repositoryName: "api-gateway", content: "Suggested labels: memory-leak, regression, hotfix, performance", status: "pending", confidence: 0.94, createdAt: "2026-08-04T15:05:00Z", reviewedAt: null, reviewedBy: null },
  { id: "auto-2", type: "test", issueId: "issue-1", issueTitle: "Memory leak in connection pool", repositoryId: "repo-1", repositoryName: "api-gateway", content: "```typescript\nit('should release connection to pool after stream error', async () => {\n  const pool = new ConnectionPoolManager({ max: 5 });\n  const conn = await pool.acquire();\n  conn.emit('error', new Error('stream error'));\n  await new Promise(r => setTimeout(r, 100));\n  expect(pool.available).toBe(5);\n});\n```", status: "pending", confidence: 0.88, createdAt: "2026-08-04T15:05:00Z", reviewedAt: null, reviewedBy: null },
  { id: "auto-3", type: "assignee", issueId: "issue-2", issueTitle: "Kafka consumer group rebalancing", repositoryId: "repo-2", repositoryName: "data-pipeline", content: "Suggested assignee: alee (85% expertise match based on 12 related commits to KafkaConsumer)", status: "approved", confidence: 0.85, createdAt: "2026-08-05T09:00:00Z", reviewedAt: "2026-08-05T10:00:00Z", reviewedBy: "mwilson" },
  { id: "auto-4", type: "investigation", issueId: "issue-4", issueTitle: "Rate limiter bypass via malformed X-Forwarded-For header", repositoryId: "repo-1", repositoryName: "api-gateway", content: "Investigation plan: 1. Test with X-Forwarded-For: 127.0.0.1, 10.0.0.1, 999.999.999.999. 2. Check CIDR validation in RateLimiter.resolveClientIp(). 3. Audit all header-parsing code paths. 4. Add fuzz test for header parser.", status: "pending", confidence: 0.97, createdAt: "2026-08-06T07:00:00Z", reviewedAt: null, reviewedBy: null },
  { id: "auto-5", type: "fix-plan", issueId: "issue-6", issueTitle: "JWT refresh token rotation window too narrow", repositoryId: "repo-5", repositoryName: "auth-service", content: "Fix plan: Increase default rotation window from 500ms to 2000ms. Add jitter (±200ms) to prevent thundering herd on token refresh. Expose `JWT_ROTATION_WINDOW_MS` env var for tuning. Update integration tests.", status: "rejected", confidence: 0.81, createdAt: "2026-08-01T12:00:00Z", reviewedAt: "2026-08-02T09:00:00Z", reviewedBy: "tchen" },
  { id: "auto-6", type: "pr-draft", issueId: "issue-8", issueTitle: "GPU memory not released between batched inference requests", repositoryId: "repo-4", repositoryName: "ml-inference", content: "PR draft title: 'fix(inference): explicitly release GPU memory after each batch'\n\nChanges: Add `torch.cuda.empty_cache()` after each batch completion in `InferenceEngine._run_batch()`. Wrap in try/finally to guarantee execution. Add memory usage metric before/after.", status: "pending", confidence: 0.79, createdAt: "2026-08-05T18:00:00Z", reviewedAt: null, reviewedBy: null },
];

export const mockNotifications = [
  { id: "notif-1", type: "regression", severity: "critical", title: "Regression detected in api-gateway v2.14.0", description: "Memory leak confirmed as regression introduced in commit a4f8d2b. Issue #847 now classified as regression.", repositoryName: "api-gateway", read: false, timestamp: "2026-08-04T15:05:00Z", link: "/issues/issue-1" },
  { id: "notif-2", type: "security", severity: "critical", title: "Security vulnerability detected", description: "Rate limiter bypass vulnerability found in api-gateway. Issue #848 filed with high confidence.", repositoryName: "api-gateway", read: false, timestamp: "2026-08-06T07:00:00Z", link: "/issues/issue-4" },
  { id: "notif-3", type: "webhook-failure", severity: "warning", title: "Webhook delivery failed", description: "3 webhook deliveries to notification-worker failed in the last hour.", repositoryName: "notification-worker", read: false, timestamp: "2026-08-06T08:30:00Z", link: "/system-health" },
  { id: "notif-4", type: "github-api-limit", severity: "warning", title: "GitHub API rate limit at 75%", description: "API rate limit usage is elevated. Consider reducing polling frequency.", repositoryName: null, read: true, timestamp: "2026-08-06T06:00:00Z", link: "/system-health" },
  { id: "notif-5", type: "analysis-complete", severity: "info", title: "AI analysis complete for data-pipeline #234", description: "Root cause identified with 89% confidence. Engineering report available.", repositoryName: "data-pipeline", read: true, timestamp: "2026-08-05T09:05:00Z", link: "/issues/issue-2" },
];

export const mockIntegrations = [
  { id: "int-github", name: "GitHub", type: "github", enabled: true, status: "connected", webhookUrl: "https://ghic.acme.io/webhooks/github", lastPingAt: "2026-08-06T11:00:00Z", configuredAt: "2023-01-15T08:00:00Z", errorMessage: null },
  { id: "int-slack", name: "Slack", type: "slack", enabled: true, status: "connected", webhookUrl: "https://hooks.slack.com/services/xxx/yyy/zzz", lastPingAt: "2026-08-06T10:55:00Z", configuredAt: "2023-03-01T08:00:00Z", errorMessage: null },
  { id: "int-jira", name: "Jira", type: "jira", enabled: false, status: "disconnected", webhookUrl: null, lastPingAt: null, configuredAt: null, errorMessage: null },
  { id: "int-linear", name: "Linear", type: "linear", enabled: false, status: "disconnected", webhookUrl: null, lastPingAt: null, configuredAt: null, errorMessage: null },
  { id: "int-discord", name: "Discord", type: "discord", enabled: false, status: "disconnected", webhookUrl: null, lastPingAt: null, configuredAt: null, errorMessage: null },
  { id: "int-teams", name: "Microsoft Teams", type: "teams", enabled: false, status: "disconnected", webhookUrl: null, lastPingAt: null, configuredAt: null, errorMessage: null },
  { id: "int-azure", name: "Azure DevOps", type: "azure-devops", enabled: false, status: "disconnected", webhookUrl: null, lastPingAt: null, configuredAt: null, errorMessage: null },
  { id: "int-gitlab", name: "GitLab", type: "gitlab", enabled: false, status: "disconnected", webhookUrl: null, lastPingAt: null, configuredAt: null, errorMessage: null },
];

export const mockApiKeys = [
  { id: "ak-1", name: "CI/CD Pipeline", prefix: "ghic_ci_", scopes: ["read:issues", "read:repositories", "write:automation"], createdAt: "2026-01-15T08:00:00Z", lastUsedAt: "2026-08-06T10:00:00Z", expiresAt: "2027-01-15T08:00:00Z", rateLimit: 10000, usageCount: 48302 },
  { id: "ak-2", name: "Monitoring Dashboard", prefix: "ghic_mon_", scopes: ["read:system-health", "read:analytics"], createdAt: "2026-03-01T08:00:00Z", lastUsedAt: "2026-08-06T11:00:00Z", expiresAt: null, rateLimit: 5000, usageCount: 12847 },
];

export const mockOrganization = {
  id: "org-1",
  name: "Acme Corp",
  slug: "acme-corp",
  avatarUrl: null,
  plan: "enterprise",
  memberCount: 12,
  repositoryCount: 6,
  createdAt: "2023-01-15T08:00:00Z",
};

export const mockMembers = [
  { id: "mem-1", login: "mwilson", name: "Marcus Wilson", email: "m.wilson@acme.io", avatarUrl: null, role: "owner", joinedAt: "2023-01-15T08:00:00Z", lastActiveAt: "2026-08-06T11:00:00Z" },
  { id: "mem-2", login: "jsmith", name: "Jane Smith", email: "j.smith@acme.io", avatarUrl: null, role: "admin", joinedAt: "2023-01-15T08:00:00Z", lastActiveAt: "2026-08-06T10:30:00Z" },
  { id: "mem-3", login: "alee", name: "Andy Lee", email: "a.lee@acme.io", avatarUrl: null, role: "maintainer", joinedAt: "2023-06-01T08:00:00Z", lastActiveAt: "2026-08-06T09:00:00Z" },
  { id: "mem-4", login: "tchen", name: "Tina Chen", email: "t.chen@acme.io", avatarUrl: null, role: "developer", joinedAt: "2024-01-10T08:00:00Z", lastActiveAt: "2026-08-05T17:00:00Z" },
  { id: "mem-5", login: "kpatel", name: "Kiran Patel", email: "k.patel@acme.io", avatarUrl: null, role: "developer", joinedAt: "2024-03-01T08:00:00Z", lastActiveAt: "2026-08-04T15:00:00Z" },
  { id: "mem-6", login: "rgupta", name: "Raj Gupta", email: "r.gupta@acme.io", avatarUrl: null, role: "developer", joinedAt: "2025-01-01T08:00:00Z", lastActiveAt: "2026-08-06T08:00:00Z" },
];

export const mockSettings = {
  general: {
    organizationName: "Acme Corp",
    defaultBranch: "main",
    timezone: "America/New_York",
    language: "en",
  },
  llmProvider: "openai-gpt4",
  embeddingProvider: "openai-text-embedding-3",
  automationEnabled: true,
  notificationsEnabled: true,
  repositoryIntelligenceEnabled: true,
  engineeringIntelligenceEnabled: true,
  featureFlags: {
    regressionDetection: true,
    duplicateDetection: true,
    automatedLabeling: true,
    prDraftGeneration: false,
    fixPlanGeneration: true,
    knowledgeGraph: false,
  },
};

export const mockAuditLogs = [
  { id: "al-1", timestamp: "2026-08-06T10:14:00Z", user: "jsmith", userAvatarUrl: null, repositoryName: "api-gateway", action: "repository.sync", modelVersion: null, evidence: null, executionTimeMs: 4231, result: "success", ipAddress: "10.0.1.5" },
  { id: "al-2", timestamp: "2026-08-06T09:00:00Z", user: "ghic-ai", userAvatarUrl: null, repositoryName: "api-gateway", action: "ai.analysis.complete", modelVersion: "gpt-4o-2026-07", evidence: "Issue #847 analyzed with 94% confidence", executionTimeMs: 12847, result: "success", ipAddress: null },
  { id: "al-3", timestamp: "2026-08-06T07:00:00Z", user: "ghic-ai", userAvatarUrl: null, repositoryName: "api-gateway", action: "regression.detected", modelVersion: "regression-v3.1", evidence: "Commit a4f8d2b correlated with memory growth signal", executionTimeMs: 3210, result: "success", ipAddress: null },
  { id: "al-4", timestamp: "2026-08-05T10:00:00Z", user: "mwilson", userAvatarUrl: null, repositoryName: "data-pipeline", action: "automation.suggestion.approved", modelVersion: null, evidence: "Approved assignee suggestion for issue #234", executionTimeMs: null, result: "success", ipAddress: "10.0.1.2" },
  { id: "al-5", timestamp: "2026-08-05T09:00:00Z", user: "mwilson", userAvatarUrl: null, repositoryName: null, action: "settings.update", modelVersion: null, evidence: "Updated LLM provider to gpt-4o-2026-07", executionTimeMs: null, result: "success", ipAddress: "10.0.1.2" },
  { id: "al-6", timestamp: "2026-08-04T15:05:00Z", user: "ghic-ai", userAvatarUrl: null, repositoryName: "api-gateway", action: "duplicate.cluster.created", modelVersion: "embedding-v2.1", evidence: "Issues #847, #819, #803 clustered with similarity >0.78", executionTimeMs: 1840, result: "success", ipAddress: null },
];

export const mockSystemHealth = {
  overall: "warning",
  webhookStatus: "healthy",
  queueStatus: "healthy",
  queueLength: 14,
  databaseStatus: "healthy",
  vectorStoreStatus: "healthy",
  embeddingProviderStatus: "healthy",
  llmProviderStatus: "healthy",
  repositoryIntelligenceStatus: "healthy",
  engineeringIntelligenceStatus: "degraded",
  githubApiStatus: "healthy",
  githubApiRateLimit: 5000,
  githubApiRateLimitRemaining: 1248,
  processingLatencyMs: 183,
  averageResponseTimeMs: 42,
  failedJobsLast24h: 3,
  uptimePercent: 99.94,
  lastCheckedAt: "2026-08-06T11:05:00Z",
  services: [
    { name: "API Server", status: "healthy", latencyMs: 12, errorMessage: null, lastCheckedAt: "2026-08-06T11:05:00Z" },
    { name: "PostgreSQL", status: "healthy", latencyMs: 3, errorMessage: null, lastCheckedAt: "2026-08-06T11:05:00Z" },
    { name: "Redis Queue", status: "healthy", latencyMs: 1, errorMessage: null, lastCheckedAt: "2026-08-06T11:05:00Z" },
    { name: "Pinecone Vector Store", status: "healthy", latencyMs: 84, errorMessage: null, lastCheckedAt: "2026-08-06T11:05:00Z" },
    { name: "OpenAI GPT-4o", status: "healthy", latencyMs: 1240, errorMessage: null, lastCheckedAt: "2026-08-06T11:05:00Z" },
    { name: "OpenAI Embeddings", status: "healthy", latencyMs: 320, errorMessage: null, lastCheckedAt: "2026-08-06T11:05:00Z" },
    { name: "GitHub API", status: "healthy", latencyMs: 210, errorMessage: null, lastCheckedAt: "2026-08-06T11:05:00Z" },
    { name: "Engineering Intelligence Engine", status: "degraded", latencyMs: 4800, errorMessage: "Embedding index sync lag >5 minutes on data-pipeline repository", lastCheckedAt: "2026-08-06T11:05:00Z" },
    { name: "Webhook Processor", status: "healthy", latencyMs: 8, errorMessage: null, lastCheckedAt: "2026-08-06T11:05:00Z" },
  ],
};

function generateTrend(days: number, base: number, variance: number) {
  const result = [];
  for (let i = days; i >= 0; i--) {
    const date = new Date("2026-08-06T00:00:00Z");
    date.setDate(date.getDate() - i);
    result.push({
      date: date.toISOString().split("T")[0],
      value: Math.max(0, base + Math.round((Math.random() - 0.5) * variance * 2)),
    });
  }
  return result;
}

export function getDashboardStats() {
  return {
    repositoriesConnected: 6,
    openIssues: 126,
    issuesToday: 8,
    resolvedToday: 3,
    aiAnalysesToday: 14,
    highPriorityIssues: 12,
    regressions: 2,
    duplicateCandidates: 4,
    repositoryHealthScore: 73.8,
    engineeringRiskScore: 41.2,
    averageAiProcessingTime: 8.4,
    githubApiUsage: 75.04,
    llmUsage: 23.1,
    embeddingUsage: 18.6,
    queueStatus: "healthy",
    webhookStatus: "healthy",
  };
}

export function getAnalyticsOverview(period: string = "30d") {
  return {
    period,
    totalIssues: 156,
    resolvedIssues: 30,
    openIssues: 126,
    regressions: 2,
    duplicatesFound: 4,
    avgResolutionDays: 4.2,
    issuesByPriority: [
      { category: "critical", count: 4 },
      { category: "high", count: 22 },
      { category: "medium", count: 61 },
      { category: "low", count: 39 },
    ],
    issuesBySeverity: [
      { category: "critical", count: 3 },
      { category: "high", count: 18 },
      { category: "medium", count: 54 },
      { category: "low", count: 51 },
    ],
    issuesByClassification: [
      { category: "bug", count: 48 },
      { category: "performance", count: 22 },
      { category: "security", count: 8 },
      { category: "regression", count: 12 },
      { category: "data-model", count: 9 },
      { category: "other", count: 27 },
    ],
    issuesByRepository: mockRepositories.map((r) => ({
      category: r.name,
      count: r.openIssues,
    })),
    trend: generateTrend(29, 4, 3),
  };
}

export function getRepositoryAnalytics(repositoryId: string) {
  const repo = mockRepositories.find((r) => r.id === repositoryId) || mockRepositories[0];
  return {
    repositoryId: repo.id,
    bugDensity: 1.48,
    issueVelocity: 2.3,
    engineeringVelocity: 4.1,
    regressionRate: 0.08,
    duplicateRate: 0.12,
    resolutionTimeDays: 3.8,
    componentStability: 68,
    releaseStability: 71,
    issuesByDay: generateTrend(29, 2, 2),
    resolutionsByDay: generateTrend(29, 1, 1),
    topContributors: mockMembers.slice(0, 3).map((m) => ({
      login: m.login,
      avatarUrl: null,
      commits: Math.round(Math.random() * 40 + 10),
      additions: Math.round(Math.random() * 800 + 200),
      deletions: Math.round(Math.random() * 400 + 50),
    })),
    mostChangedFiles: [
      { path: "src/pool/ConnectionPoolManager.ts", changes: 24, lastModified: "2026-08-03T14:00:00Z" },
      { path: "src/middleware/keepAlive.ts", changes: 18, lastModified: "2026-08-03T12:00:00Z" },
      { path: "src/pipeline/RequestPipeline.ts", changes: 14, lastModified: "2026-08-04T10:00:00Z" },
    ],
    mostFragileComponents: mockComponents
      .filter((c) => c.repositoryId === repositoryId)
      .map((c) => ({ name: c.name, issueCount: c.issueCount, regressionCount: c.regressionCount, healthScore: c.healthScore })),
  };
}

export function getIntelligenceSummary() {
  return {
    totalRootCauses: 7,
    criticalPatterns: 2,
    activeRegressions: 2,
    knowledgeItems: 34,
    riskLevel: "medium",
    topInsight: "Connection pool resource management is the leading root cause across 3 of 8 critical issues this month.",
    engineeringHealthTrend: "declining",
    lastAnalysisAt: "2026-08-06T09:00:00Z",
  };
}

export function getRootCauses() {
  return [
    { id: "rc-1", category: "Resource Management", description: "Missing resource release in error code paths — affects connection pools, file handles, GPU memory", affectedIssues: 3, repositoryId: "repo-1", repositoryName: "api-gateway", confidence: 0.94, firstSeenAt: "2026-07-01T00:00:00Z", lastSeenAt: "2026-08-04T15:05:00Z" },
    { id: "rc-2", category: "Distributed Systems", description: "Consumer group coordination issues under partition rebalancing — no distributed lock for idempotency", affectedIssues: 2, repositoryId: "repo-2", repositoryName: "data-pipeline", confidence: 0.89, firstSeenAt: "2026-06-15T00:00:00Z", lastSeenAt: "2026-08-05T09:00:00Z" },
    { id: "rc-3", category: "Security Validation", description: "Insufficient validation of forwarded headers — affects rate limiting and IP resolution", affectedIssues: 1, repositoryId: "repo-1", repositoryName: "api-gateway", confidence: 0.97, firstSeenAt: "2026-08-06T07:00:00Z", lastSeenAt: "2026-08-06T07:00:00Z" },
    { id: "rc-4", category: "Token Lifecycle", description: "Narrow rotation windows and missing jitter in token refresh flows", affectedIssues: 1, repositoryId: "repo-5", repositoryName: "auth-service", confidence: 0.81, firstSeenAt: "2026-07-31T00:00:00Z", lastSeenAt: "2026-08-01T12:00:00Z" },
  ];
}

export function getHistoricalPatterns() {
  return [
    { id: "hp-1", patternType: "Release Degradation", description: "New releases consistently introduce performance regressions within 48 hours of deploy", frequency: "monthly", repositoryId: "repo-1", repositoryName: "api-gateway", impact: "high", occurrences: 4, firstSeenAt: "2026-04-01T00:00:00Z", lastSeenAt: "2026-08-03T00:00:00Z" },
    { id: "hp-2", patternType: "Kafka Sensitivity", description: "Consumer group issues recur after every major Kafka version upgrade", frequency: "quarterly", repositoryId: "repo-2", repositoryName: "data-pipeline", impact: "medium", occurrences: 3, firstSeenAt: "2025-10-01T00:00:00Z", lastSeenAt: "2026-08-05T00:00:00Z" },
    { id: "hp-3", patternType: "Bundle Bloat", description: "Dependency upgrades without bundle analysis cause recurring size regressions", frequency: "monthly", repositoryId: "repo-3", repositoryName: "frontend-app", impact: "low", occurrences: 5, firstSeenAt: "2025-08-01T00:00:00Z", lastSeenAt: "2026-08-01T00:00:00Z" },
  ];
}

export function getRiskAnalysis() {
  return {
    overallRisk: "medium",
    overallRiskScore: 41.2,
    repositories: mockRepositories.map((r) => ({
      repositoryId: r.id,
      repositoryName: r.name,
      riskScore: r.riskScore,
      riskLevel: r.riskScore > 60 ? "high" : r.riskScore > 30 ? "medium" : "low",
      topRiskFactor: r.id === "repo-1" ? "Memory leak in connection pool" : r.id === "repo-2" ? "Duplicate message processing" : "Dependency freshness",
    })),
    topRisks: [
      { category: "Security", description: "Rate limiter bypass vulnerability in api-gateway", severity: "critical", repositoryName: "api-gateway" },
      { category: "Stability", description: "Active memory leak causing pod restarts under load", severity: "high", repositoryName: "api-gateway" },
      { category: "Data Integrity", description: "Duplicate message processing risk during Kafka rebalancing", severity: "high", repositoryName: "data-pipeline" },
    ],
    trendDirection: "stable",
    lastCalculatedAt: "2026-08-06T09:00:00Z",
  };
}

export function getRecentActivity() {
  return [
    { id: "act-1", type: "ai-analysis", message: "AI analysis complete for issue #848 — security vulnerability detected", repositoryName: "api-gateway", actor: "ghic-ai", timestamp: "2026-08-06T07:00:00Z", link: "/issues/issue-4" },
    { id: "act-2", type: "sync", message: "Repository synced — 3 new commits indexed", repositoryName: "api-gateway", actor: "jsmith", timestamp: "2026-08-06T10:14:00Z", link: "/repositories/repo-1" },
    { id: "act-3", type: "issue-opened", message: "New issue #848 opened: Rate limiter bypass", repositoryName: "api-gateway", actor: "mwilson", timestamp: "2026-08-06T06:45:00Z", link: "/issues/issue-4" },
    { id: "act-4", type: "regression-detected", message: "Regression detected in issue #847 — correlated to commit a4f8d2b", repositoryName: "api-gateway", actor: "ghic-ai", timestamp: "2026-08-04T15:05:00Z", link: "/regressions" },
    { id: "act-5", type: "automation", message: "Automation suggestion approved: assignee for issue #234", repositoryName: "data-pipeline", actor: "mwilson", timestamp: "2026-08-05T10:00:00Z", link: "/automation" },
    { id: "act-6", type: "pr-merged", message: "PR #841 merged — HTTP/2 multiplexing layer overhaul", repositoryName: "api-gateway", actor: "jsmith", timestamp: "2026-08-03T15:00:00Z", link: "/pull-requests" },
  ];
}

export function getAlerts() {
  return [
    { id: "alert-1", type: "security", severity: "critical", title: "Security vulnerability in api-gateway", description: "Rate limiter bypass via malformed headers — issue #848", repositoryName: "api-gateway", timestamp: "2026-08-06T07:00:00Z", resolved: false },
    { id: "alert-2", type: "performance", severity: "high", title: "Memory leak causing pod restarts", description: "api-gateway pods restarting 3.2x/day due to connection pool exhaustion", repositoryName: "api-gateway", timestamp: "2026-08-04T15:00:00Z", resolved: false },
    { id: "alert-3", type: "webhook", severity: "warning", title: "Webhook delivery failures", description: "3 deliveries failed for notification-worker in last hour", repositoryName: "notification-worker", timestamp: "2026-08-06T08:30:00Z", resolved: false },
    { id: "alert-4", type: "api-limit", severity: "warning", title: "GitHub API rate limit at 75%", description: "1248 / 5000 requests remaining. Resets at 12:00 UTC.", repositoryName: null, timestamp: "2026-08-06T06:00:00Z", resolved: false },
  ];
}

export function globalSearch(q: string) {
  if (!q) return { query: q, total: 0, repositories: [], issues: [], commits: [], pullRequests: [], components: [], releases: [] };
  const lq = q.toLowerCase();
  return {
    query: q,
    total: 8,
    repositories: mockRepositories.filter((r) => r.name.toLowerCase().includes(lq) || (r.description || "").toLowerCase().includes(lq)).slice(0, 3).map((r) => ({ id: r.id, type: "repository", title: r.fullName, description: r.description || null, repositoryName: r.name, url: `/repositories/${r.id}`, score: 0.9, timestamp: r.updatedAt })),
    issues: mockIssues.filter((i) => i.title.toLowerCase().includes(lq) || i.repositoryName.toLowerCase().includes(lq)).slice(0, 3).map((i) => ({ id: i.id, type: "issue", title: `#${i.number} ${i.title}`, description: i.repositoryName, repositoryName: i.repositoryName, url: `/issues/${i.id}`, score: 0.85, timestamp: i.updatedAt })),
    commits: mockCommits.filter((c) => c.message.toLowerCase().includes(lq) || c.shortSha.toLowerCase().includes(lq)).slice(0, 2).map((c) => ({ id: c.id, type: "commit", title: c.message, description: c.shortSha, repositoryName: c.repositoryName, url: null, score: 0.8, timestamp: c.date })),
    pullRequests: mockPullRequests.filter((p) => p.title.toLowerCase().includes(lq)).slice(0, 2).map((p) => ({ id: p.id, type: "pull-request", title: `#${p.number} ${p.title}`, description: p.repositoryName, repositoryName: p.repositoryName, url: p.url, score: 0.75, timestamp: p.updatedAt })),
    components: mockComponents.filter((c) => c.name.toLowerCase().includes(lq)).slice(0, 2).map((c) => ({ id: c.id, type: "component", title: c.name, description: c.repositoryName, repositoryName: c.repositoryName, url: null, score: 0.7, timestamp: c.lastUpdated })),
    releases: mockReleases.filter((r) => r.version.toLowerCase().includes(lq) || r.repositoryName.toLowerCase().includes(lq)).slice(0, 2).map((r) => ({ id: r.id, type: "release", title: `${r.repositoryName} ${r.version}`, description: null, repositoryName: r.repositoryName, url: r.url, score: 0.7, timestamp: r.releaseDate })),
  };
}

export function paginate<T>(items: T[], page: number = 1, limit: number = 20) {
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total: items.length,
    page,
    limit,
  };
}
