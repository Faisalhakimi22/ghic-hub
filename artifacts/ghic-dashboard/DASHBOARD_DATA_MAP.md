# GHIC Dashboard Data Map

The dashboard is a Vite React application with a Vercel catch-all API. Every
API route verifies a Firebase ID token and then requires an explicit
`ghic_users` workspace membership. Product data is queried server-side.

| Dashboard section | API endpoint                                                             | Source                                                                        | Real data returned                                                                                 | UI component                                            |
| ----------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Overview          | `GET /api/dashboard/overview`                                            | Aggregates below                                                              | Repository, issue, analysis, alert, activity, and retrieval counts                                 | `pages/dashboard.tsx`                                   |
| Recent activity   | Included in overview; compatibility `GET /api/dashboard/recent-activity` | `ghic_ledger`                                                                 | Prediction, analysis, failure, GitHub action, label, and outcome events                            | `pages/dashboard.tsx`                                   |
| Active alerts     | Included in overview; compatibility `GET /api/dashboard/alerts`          | `ghic_repository_state`, `ghic_ledger`, GHIC `/healthz`                       | Index failures/mismatches, processing failures, retrieval failures, runtime/config mismatches      | `pages/dashboard.tsx`                                   |
| Repositories      | `GET /api/repositories`, `GET /api/repositories/{id}`                    | `ghic_repository_state`, grouped `ghic_repo_chunks`, latest analysis metadata | State, SHA, times, files/chunks, embedding metadata, index health                                  | `pages/repositories.tsx`, `pages/repository-detail.tsx` |
| Issues            | `GET /api/issues`, `GET /api/issues/{id}`                                | Latest prediction, analysis, action, and outcome events in `ghic_ledger`      | Classification, statistical score, AI result, evidence status, files/functions, labels, timestamps | `pages/issues.tsx`, `pages/issue-detail.tsx`            |
| Analytics         | `GET /api/analytics/overview`                                            | Server-side `ghic_ledger` aggregates                                          | Volume/trend, classification/priority/severity distributions, latency, retrieval success           | `pages/analytics.tsx`                                   |
| Duplicates        | `GET /api/duplicates`                                                    | Persisted `related_issues` in analysis events                                 | Only recorded duplicate candidates and recorded similarity, when present                           | `pages/duplicates.tsx`                                  |
| Search            | `GET /api/search?q=`                                                     | `ghic_repository_state`, `ghic_ledger`, `ghic_repo_chunks`                    | Repository/issue matches and lexical indexed path, symbol, or text matches                         | `pages/search.tsx`                                      |
| Processing audit  | `GET /api/audit-logs`                                                    | `ghic_ledger`                                                                 | GHIC processing events; not fabricated user audit events                                           | `pages/audit-logs.tsx`                                  |
| System health     | `GET /api/system-health`                                                 | PostgreSQL query success, index metadata, GHIC `/healthz`                     | Runtime/index compatibility plus unknown or disabled status for unmeasured services                | `pages/system-health.tsx`                               |
| Integrations      | `GET /api/integrations`                                                  | GHIC `/healthz`                                                               | GHIC runtime and repository-intelligence status only                                               | `pages/integrations.tsx`                                |
| Account/settings  | `GET /api/me`, `PATCH /api/me/settings`                                  | `ghic_users`                                                                  | Name, avatar, theme, timezone, notification/email preferences, role                                | shell and `pages/settings.tsx`                          |
| Workspace/members | `GET/PATCH /api/organization`, member routes                             | `ghic_org_settings`, `ghic_users`                                             | Workspace name, members, roles, repository count                                                   | `pages/organization.tsx`, `pages/settings.tsx`          |

## Explicitly unavailable

Engineering Intelligence, component health, regressions, Automation, commit
lists, pull request lists, and release lists do not have a durable production
source today. Their existing routes return `available: false` with a reason and
their pages render that reason. Notifications also remain unavailable because
GHIC has no persisted per-user notification/read-state feed; active operational
alerts are shown in the overview instead.

## Persistence addition

No dashboard table or vector migration is required. GHIC now appends sanitized
`analysis` and `processing_failure` records to the existing `ghic_ledger` so
future completed analyses have titles, AI output, repository evidence metadata,
latency, and comment status. Issue bodies, retrieved code text, generated
comments, credentials, and stack traces are not copied into dashboard events.

## Tenancy and RBAC

The current schema represents one shared GHIC workspace, not multiple
organizations. All explicitly admitted members see that workspace. Firebase
authentication proves identity but no longer auto-enrolls users after the first
owner bootstrap. Owners manage the workspace and all roles; admins may change
members/viewers only; members and viewers have read access; every user may edit
only their own account settings.
