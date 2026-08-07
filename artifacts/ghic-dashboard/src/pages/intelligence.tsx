import React from 'react';
import { useGetIntelligenceSummary, getGetIntelligenceSummaryQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, MetricCard, Grid } from "@/components/ui/swiss";
import { AlertCircle, FileWarning, Search, Zap } from 'lucide-react';

export default function Intelligence() {
  const { data, isLoading } = useGetIntelligenceSummary({}, { query: { queryKey: getGetIntelligenceSummaryQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Engineering Intelligence" description="Deep AI analysis across all repositories" />
      <PageContent>
        {isLoading ? (
          <div className="h-32 bg-muted animate-pulse border border-border" />
        ) : data ? (
          <div className="flex flex-col gap-8">
            <Grid cols={4}>
              <MetricCard title="Root Causes" value={data.totalRootCauses} icon={Search} />
              <MetricCard title="Critical Patterns" value={data.criticalPatterns} icon={AlertCircle} />
              <MetricCard title="Active Regressions" value={data.activeRegressions} icon={FileWarning} />
              <MetricCard title="Knowledge Items" value={data.knowledgeItems} icon={Zap} />
            </Grid>
            
            <div className="border border-border bg-card p-8 text-center text-muted-foreground">
              <p className="font-display tracking-widest uppercase text-sm mb-2">Explore Intelligence Data</p>
              <p className="text-xs">Select a specific area from the sidebar to dive deeper into root causes, regressions, or duplicates.</p>
            </div>
          </div>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">No intelligence data available.</div>
        )}
      </PageContent>
    </div>
  );
}
