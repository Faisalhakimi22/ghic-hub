import React from "react";
import {
  getGetAnalyticsOverviewQueryKey,
  useGetAnalyticsOverview,
} from "@workspace/api-client-react";

import { DataError } from "@/components/data-state";
import {
  Grid,
  MetricCard,
  PageContent,
  PageHeader,
} from "@/components/ui/swiss";

function Bar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const percentage = max ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(100px,1fr)_3fr_56px] items-center gap-3 text-sm">
      <span className="truncate text-muted-foreground">{label}</span>
      <div className="h-2 bg-muted border border-border">
        <div
          className="h-full bg-primary"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="font-mono text-xs text-right">{value}</span>
    </div>
  );
}

export default function Analytics() {
  const query = useGetAnalyticsOverview(
    {},
    {
      query: { queryKey: getGetAnalyticsOverviewQueryKey() },
    },
  );

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Analytics"
        description="Persisted GHIC issue and analysis metrics"
      />
      <PageContent>
        {query.isLoading ? (
          <div className="h-32 bg-muted animate-pulse border border-border" />
        ) : query.isError ? (
          <DataError error={query.error} title="Analytics unavailable" />
        ) : query.data ? (
          <div className="flex flex-col gap-8">
            <Grid cols={4}>
              <MetricCard
                title="Issues Scored"
                value={query.data.totalIssues}
              />
              <MetricCard
                title="Full Analyses"
                value={query.data.analyzedIssues}
              />
              <MetricCard
                title="Bugs Detected"
                value={query.data.bugsDetected}
              />
              <MetricCard
                title="Retrieval Success"
                value={
                  query.data.retrievalSuccessRate == null
                    ? "Not measured"
                    : `${query.data.retrievalSuccessRate}%`
                }
              />
            </Grid>
            <Grid cols={4}>
              <MetricCard title="Open Issues" value={query.data.openIssues} />
              <MetricCard
                title="Resolved Issues"
                value={query.data.resolvedIssues}
              />
              <MetricCard
                title="Duplicate Candidates"
                value={query.data.duplicatesFound}
              />
              <MetricCard
                title="Average Analysis"
                value={
                  query.data.averageAnalysisLatencyMs == null
                    ? "Not measured"
                    : `${query.data.averageAnalysisLatencyMs}ms`
                }
              />
            </Grid>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Distribution
                title="Classification Distribution"
                rows={query.data.issuesByClassification}
              />
              <Distribution
                title="AI Priority Distribution"
                rows={query.data.issuesByPriority}
              />
              <Distribution
                title="AI Severity Distribution"
                rows={query.data.issuesBySeverity}
              />
              <Distribution
                title="Issues by Repository"
                rows={query.data.issuesByRepository}
              />
              <Distribution
                title="Completed Analyses, Last 30 Days"
                rows={query.data.trend.map((row) => ({
                  category: row.date,
                  count: row.value,
                }))}
              />
              <div className="border border-border bg-card p-6 flex flex-col gap-3">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">
                  Unavailable Metrics
                </h2>
                <p className="text-sm text-muted-foreground">
                  Regression rate and average resolution time are not derived
                  because GHIC does not persist verified regression records or
                  enough lifecycle timing data.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">
            No persisted analytics data is available.
          </div>
        )}
      </PageContent>
    </div>
  );
}

function Distribution({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ category: string; count: number }>;
}) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="border border-border bg-card p-6 flex flex-col gap-4">
      <h2 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">
        {title}
      </h2>
      {rows.length ? (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <Bar
              key={row.category}
              label={row.category}
              value={row.count}
              max={max}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No persisted data yet.</p>
      )}
    </div>
  );
}
