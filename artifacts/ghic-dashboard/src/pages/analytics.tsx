import React from 'react';
import { useGetAnalyticsOverview, getGetAnalyticsOverviewQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid, MetricCard } from "@/components/ui/swiss";

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(120px,1fr)_3fr_64px] items-center gap-3 text-sm">
      <span className="truncate text-muted-foreground">{label}</span>
      <div className="h-2 bg-muted border border-border">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-right">{value}</span>
    </div>
  );
}

export default function Analytics() {
  const { data, isLoading } = useGetAnalyticsOverview({}, { query: { queryKey: getGetAnalyticsOverviewQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Analytics" description="Engineering velocity and quality metrics" />
      <PageContent>
        {isLoading ? (
          <div className="h-32 bg-muted animate-pulse border border-border" />
        ) : data ? (
          <div className="flex flex-col gap-8">
            <Grid cols={4}>
              <MetricCard title="Total Issues" value={data.totalIssues} />
              <MetricCard title="Resolved" value={data.resolvedIssues} />
              <MetricCard title="Regressions" value={data.regressions} />
              <MetricCard title="Duplicates" value={data.duplicatesFound} />
            </Grid>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="border border-border bg-card p-6 flex flex-col gap-4">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">Issues by Repository</h2>
                {(data.issuesByRepository || []).length ? (
                  <div className="flex flex-col gap-3">
                    {data.issuesByRepository.map((row) => (
                      <Bar
                        key={row.category}
                        label={row.category}
                        value={row.count}
                        max={Math.max(...data.issuesByRepository.map((x) => x.count), 1)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No repository-level issue data recorded yet.</p>
                )}
              </div>

              <div className="border border-border bg-card p-6 flex flex-col gap-4">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">Prediction Trend</h2>
                {(data.trend || []).length ? (
                  <div className="flex flex-col gap-3">
                    {data.trend.slice(-14).map((row) => (
                      <Bar
                        key={row.date}
                        label={row.date}
                        value={row.value}
                        max={Math.max(...data.trend.map((x) => x.value), 1)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No daily trend data recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">No analytics data available.</div>
        )}
      </PageContent>
    </div>
  );
}
