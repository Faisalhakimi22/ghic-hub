import React from "react";
import {
  getGetDashboardOverviewQueryKey,
  useGetDashboardOverview,
} from "@workspace/api-client-react";
import {
  Activity,
  AlertCircle,
  Bug,
  CheckCircle2,
  Cpu,
  FileSearch,
  FolderGit2,
  ScanSearch,
  ShieldAlert,
} from "lucide-react";
import { Link } from "wouter";

import { ConnectGitHub, useNothingConnected } from "@/components/connect-github";
import { DataError } from "@/components/data-state";
import { UsagePanel } from "@/components/usage-panel";
import {
  Grid,
  PageContent,
  PageHeader,
  StatusBadge,
} from "@/components/ui/swiss";
import { useDashboardDate } from "@/lib/account";

function BentoCard({
  label,
  value,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  variant?: "default" | "dark" | "accent";
}) {
  const variants = {
    default: "bg-card border border-border text-foreground",
    dark: "bg-foreground text-background border border-foreground",
    accent: "bg-primary text-primary-foreground border border-primary",
  };
  const muted = {
    default: "text-muted-foreground",
    dark: "text-background/60",
    accent: "text-primary-foreground/70",
  };
  return (
    <div
      className={`p-4 sm:p-5 flex flex-col justify-between min-h-[132px] sm:min-h-[148px] min-w-0 ${variants[variant]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`text-[10px] font-display tracking-widest uppercase ${muted[variant]}`}
        >
          {label}
        </span>
        {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${muted[variant]}`} />}
      </div>
      <div className="font-display font-bold leading-none tracking-tight text-3xl sm:text-4xl break-words [overflow-wrap:anywhere]">
        {value === null || value === undefined ? (
          <span className="opacity-40" title="Not recorded">
            &mdash;
          </span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { nothingConnected } = useNothingConnected();
  const overview = useGetDashboardOverview({
    query: { queryKey: getGetDashboardOverviewQueryKey() },
  });
  const formatDate = useDashboardDate();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Dashboard" description="Live GHIC workspace data" />
      {nothingConnected ? (
        <PageContent className="flex flex-col gap-8 w-full">
          {/* A workspace with no installation has nothing to show, and a
              screen of zeroes tells a new account nothing about what to do
              next. The one action that starts the product belongs here, not
              only behind a nav item they have to think to click. */}
          <ConnectGitHub
            heading="Start with a repository"
            blurb="GHIC has nothing to analyse yet. Install the GitHub App and choose which repositories it can read — the selection you make on GitHub is what GHIC records, so there is nothing to type here."
          />
        </PageContent>
      ) : (
      <PageContent className="flex flex-col gap-8 w-full">
        {/* Above the metrics on purpose. A workspace whose analysis has
            stopped needs to learn that before it reads a chart of how
            little happened this month and concludes the product is
            broken. */}
        <UsagePanel />
        {overview.isLoading ? (
          <div className="h-32 bg-muted animate-pulse border border-border" />
        ) : overview.isError ? (
          <DataError
            error={overview.error}
            title="Dashboard overview unavailable"
          />
        ) : overview.data ? (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2">
                Key Metrics
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <BentoCard
                  label="Tracked Repositories"
                  value={overview.data.stats.trackedRepositories}
                  icon={FolderGit2}
                />
                <BentoCard
                  label="Indexed Repositories"
                  value={overview.data.stats.indexedRepositories}
                  icon={CheckCircle2}
                  variant="dark"
                />
                <BentoCard
                  label="Issues Scored"
                  value={overview.data.stats.issuesScored}
                  icon={ScanSearch}
                  variant="accent"
                />
                <BentoCard
                  label="Actionable Bugs"
                  value={overview.data.stats.bugsDetected}
                  icon={Bug}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                <BentoCard
                  label="Full Analyses"
                  value={overview.data.stats.analysesCompleted}
                  icon={Cpu}
                />
                <BentoCard
                  label="Analyses / 24h"
                  value={overview.data.stats.analysesLast24Hours}
                  variant="dark"
                />
                <BentoCard
                  label="High Priority"
                  value={overview.data.stats.highPriorityIssues}
                  icon={AlertCircle}
                />
                <BentoCard
                  label="Needs Review"
                  value={overview.data.stats.maintainerReviewIssues}
                  icon={ShieldAlert}
                />
                <BentoCard
                  label="Retrieval Success"
                  value={
                    overview.data.stats.retrievalSuccessRate == null
                      ? null
                      : `${overview.data.stats.retrievalSuccessRate}%`
                  }
                  icon={FileSearch}
                />
              </div>
            </section>

            <Grid cols={2} gap={8}>
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2 flex items-center justify-between">
                  <span>Recent Activity</span>
                  <Link
                    href="/audit-logs"
                    className="text-[10px] text-primary hover:underline"
                  >
                    View All
                  </Link>
                </h2>
                {overview.data.recentActivity.length ? (
                  <div className="border border-border bg-card flex flex-col">
                    {overview.data.recentActivity.map((item, index) => (
                      <div
                        key={item.id}
                        className={`p-4 flex flex-col gap-2 ${index + 1 < overview.data.recentActivity.length ? "border-b border-border" : ""}`}
                      >
                        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:gap-4">
                          <p className="text-sm">
                            <span className="font-bold mr-2">{item.actor}</span>
                            <span className="text-muted-foreground">
                              {item.message}
                            </span>
                          </p>
                          <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                            {formatDate(item.timestamp, { year: undefined })}
                          </span>
                        </div>
                        {item.repositoryName && (
                          <span className="text-xs font-mono text-muted-foreground">
                            repo: {item.repositoryName}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 border border-border text-center text-muted-foreground">
                    No recorded activity
                  </div>
                )}
              </section>

              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2 flex items-center justify-between">
                  <span>Active Alerts ({overview.data.alerts.length})</span>
                  <Link
                    href="/system-health"
                    className="text-[10px] text-primary hover:underline"
                  >
                    System Health
                  </Link>
                </h2>
                {overview.data.alerts.length ? (
                  <div className="border border-border bg-card flex flex-col">
                    {overview.data.alerts.map((alert, index) => (
                      <div
                        key={alert.id}
                        className={`p-4 flex flex-col gap-2 ${index + 1 < overview.data.alerts.length ? "border-b border-border" : ""}`}
                      >
                        <div className="flex flex-col justify-between items-start gap-2 sm:flex-row sm:gap-4">
                          <div className="flex items-center gap-2">
                            <StatusBadge
                              status={
                                alert.severity === "critical" ||
                                alert.severity === "high"
                                  ? "danger"
                                  : "warning"
                              }
                              text={alert.severity}
                            />
                            <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                              {alert.type}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                            {formatDate(alert.timestamp, { year: undefined })}
                          </span>
                        </div>
                        <p className="text-sm font-bold">{alert.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {alert.description}
                        </p>
                        {alert.repositoryName && (
                          <span className="text-xs font-mono text-muted-foreground">
                            repo: {alert.repositoryName}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 border border-border text-center text-muted-foreground">
                    No active alerts
                  </div>
                )}
              </section>
            </Grid>

            <section className="flex flex-col gap-4">
              <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2 flex items-center justify-between">
                <span>Recent GHIC Analyses</span>
                <Link
                  href="/issues"
                  className="text-[10px] text-primary hover:underline"
                >
                  View Issues
                </Link>
              </h2>
              {overview.data.recentAnalyses.length ? (
                <div className="border border-border bg-card overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm text-left">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        {[
                          "Issue",
                          "Repository",
                          "Classification",
                          "Priority",
                          "Repository Evidence",
                          "Analyzed",
                        ].map((label) => (
                          <th
                            key={label}
                            className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {overview.data.recentAnalyses.map((issue) => (
                        <tr key={issue.id}>
                          <td className="px-4 py-3">
                            <Link
                              href={`/issues/${issue.id}`}
                              className="font-bold hover:text-primary"
                            >
                              #{issue.number}{" "}
                              {issue.title || "Title not recorded"}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {issue.repositoryName}
                          </td>
                          <td className="px-4 py-3">{issue.classification}</td>
                          <td className="px-4 py-3">
                            {issue.priority || "Not recorded"}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              status={
                                issue.repositoryEvidenceStatus === "available"
                                  ? "success"
                                  : "neutral"
                              }
                              text={issue.repositoryEvidenceStatus}
                            />
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                            {formatDate(issue.analysisTimestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 border border-border text-center text-muted-foreground">
                  No complete analyses recorded yet
                </div>
              )}
            </section>

            <section className="flex flex-col gap-4">
              <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2">
                Repository Indexing
              </h2>
              {overview.data.repositoryIndexing.length ? (
                <div className="border border-border bg-card divide-y divide-border">
                  {overview.data.repositoryIndexing.map((repository) => (
                    <div
                      key={repository.id}
                      className="p-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center gap-2 sm:gap-5 text-sm"
                    >
                      <Link
                        href={`/repositories/${repository.id}`}
                        className="font-bold break-words hover:text-primary sm:truncate"
                      >
                        {repository.fullName}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">
                        {repository.fileCount} files / {repository.chunkCount}{" "}
                        chunks
                      </span>
                      <StatusBadge
                        status={
                          repository.status === "ready"
                            ? "success"
                            : repository.status === "failed"
                              ? "danger"
                              : "neutral"
                        }
                        text={repository.status}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 border border-border text-center text-muted-foreground">
                  No repositories tracked
                </div>
              )}
            </section>
          </>
        ) : null}
      </PageContent>
      )}
    </div>
  );
}
