import React from 'react';
import { useGetSystemHealth, getGetSystemHealthQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid, MetricCard, StatusBadge } from "@/components/ui/swiss";
import { Activity, Clock, CheckCircle2, Server, Database, Brain, GitBranch } from "lucide-react";
import { format } from "date-fns";


/** Null metrics render as an em dash rather than "null%". */
function fmt(value: number | null | undefined, suffix = ''): string {
  return value === null || value === undefined ? '—' : `${value}${suffix}`;
}

export default function SystemHealth() {
  const { data, isLoading } = useGetSystemHealth({ query: { queryKey: getGetSystemHealthQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader 
        title="System Health" 
        description="Platform operations and backend service status" 
      >
        {data && (
          <div className="flex items-center gap-2 border border-border px-3 py-1.5 bg-card">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${data.overall === 'healthy' ? 'bg-primary' : 'bg-destructive'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${data.overall === 'healthy' ? 'bg-primary' : 'bg-destructive'}`}></span>
            </span>
            <span className="text-xs font-display tracking-widest uppercase font-bold text-muted-foreground">
              {data.overall === 'healthy' ? 'System Operational' : 'Degraded Performance'}
            </span>
          </div>
        )}
      </PageHeader>
      
      <PageContent className="flex flex-col gap-8">
        {isLoading ? (
          <div className="h-64 bg-muted animate-pulse border border-border" />
        ) : data ? (
          <>
            {/* GHIC does not measure uptime, queue depth, or GitHub rate
                limit, so those arrive as null. Interpolating them straight
                into a template rendered "null%" and "NaN%" -- worse than
                an em dash, because it looks like a broken measurement
                rather than an absent one. */}
            <Grid cols={4}>
              <MetricCard title="Uptime" value={fmt(data.uptimePercent, '%')} icon={CheckCircle2} />
              <MetricCard title="Queue Length" value={fmt(data.queueLength)} icon={Activity} />
              <MetricCard title="Latency" value={fmt(data.processingLatencyMs, 'ms')} icon={Clock} />
              <MetricCard
                title="API Limit"
                value={
                  data.githubApiRateLimit
                    ? `${Math.round((data.githubApiRateLimitRemaining / data.githubApiRateLimit) * 100)}%`
                    : '—'
                }
                icon={Server}
              />
            </Grid>

            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2">Service Status</h2>
              <Grid cols={3} gap={4}>
                <div className="border border-border bg-card p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 font-bold"><Database className="w-4 h-4" /> Database</div>
                    <StatusBadge status={data.databaseStatus === 'healthy' ? 'success' : 'danger'} text={data.databaseStatus} />
                  </div>
                </div>
                <div className="border border-border bg-card p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 font-bold"><Brain className="w-4 h-4" /> LLM Provider</div>
                    <StatusBadge status={data.llmProviderStatus === 'healthy' ? 'success' : 'danger'} text={data.llmProviderStatus} />
                  </div>
                </div>
                <div className="border border-border bg-card p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 font-bold"><Brain className="w-4 h-4" /> Embeddings</div>
                    <StatusBadge status={data.embeddingProviderStatus === 'healthy' ? 'success' : 'danger'} text={data.embeddingProviderStatus} />
                  </div>
                </div>
                <div className="border border-border bg-card p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 font-bold"><Database className="w-4 h-4" /> Vector Store</div>
                    <StatusBadge status={data.vectorStoreStatus === 'healthy' ? 'success' : 'danger'} text={data.vectorStoreStatus} />
                  </div>
                </div>
                <div className="border border-border bg-card p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 font-bold"><GitBranch className="w-4 h-4" /> GitHub API</div>
                    <StatusBadge status={data.githubApiStatus === 'healthy' ? 'success' : 'danger'} text={data.githubApiStatus} />
                  </div>
                </div>
                <div className="border border-border bg-card p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 font-bold"><Activity className="w-4 h-4" /> Webhooks</div>
                    <StatusBadge status={data.webhookStatus === 'healthy' ? 'success' : 'danger'} text={data.webhookStatus} />
                  </div>
                </div>
              </Grid>
            </div>
            
            <div className="text-right text-[10px] text-muted-foreground font-mono">
              Last checked: {format(new Date(data.lastCheckedAt), 'yyyy-MM-dd HH:mm:ss')}
            </div>
          </>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">Failed to load system health.</div>
        )}
      </PageContent>
    </div>
  );
}
