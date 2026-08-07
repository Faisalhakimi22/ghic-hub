import React from 'react';
import { useGetAnalyticsOverview, getGetAnalyticsOverviewQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid, MetricCard } from "@/components/ui/swiss";

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
              <MetricCard title="Avg Resolution" value={`${data.avgResolutionDays}d`} />
            </Grid>
            
            <div className="border border-border bg-card p-6 h-64 flex items-center justify-center text-muted-foreground">
              [Charts Placeholder - Use Recharts here]
            </div>
          </div>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">No analytics data available.</div>
        )}
      </PageContent>
    </div>
  );
}
