import React from "react";
import {
  getGetSystemHealthQueryKey,
  useGetSystemHealth,
} from "@workspace/api-client-react";
import {
  Activity,
  Brain,
  Clock,
  Database,
  GitBranch,
  Server,
} from "lucide-react";

import { DataError } from "@/components/data-state";
import {
  Grid,
  MetricCard,
  PageContent,
  PageHeader,
  StatusBadge,
} from "@/components/ui/swiss";
import { useDashboardDate } from "@/lib/account";

function value(input: number | null | undefined, suffix = "") {
  return input == null ? "Not measured" : `${input}${suffix}`;
}
function tone(status: string) {
  if (status === "healthy") return "success" as const;
  if (status === "degraded" || status === "error") return "danger" as const;
  if (status === "not_configured") return "warning" as const;
  return "neutral" as const;
}

export default function SystemHealth() {
  const query = useGetSystemHealth({
    query: { queryKey: getGetSystemHealthQueryKey() },
  });
  const formatDate = useDashboardDate();
  const data = query.data;
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="System Health"
        description="Live GHIC runtime and persisted index compatibility"
      >
        {data && (
          <StatusBadge status={tone(data.overall)} text={data.overall} />
        )}
      </PageHeader>
      <PageContent className="flex flex-col gap-8">
        {query.isLoading ? (
          <div className="h-64 bg-muted animate-pulse border border-border" />
        ) : query.isError ? (
          <DataError error={query.error} title="System health unavailable" />
        ) : data ? (
          <>
            <Grid cols={4}>
              <MetricCard
                compact
                title="Failed Jobs / 24h"
                value={value(data.failedJobsLast24h)}
                icon={Activity}
              />
              <MetricCard
                compact
                title="Average Analysis"
                value={value(data.processingLatencyMs, "ms")}
                icon={Clock}
              />
              <MetricCard
                compact
                title="Automatic Indexing"
                value={
                  data.autoIndex == null
                    ? "Not reported"
                    : data.autoIndex
                      ? "Enabled"
                      : "Disabled"
                }
                icon={GitBranch}
              />
              <MetricCard
                compact
                title="Runtime Version"
                value={data.version || "Not reported"}
                icon={Server}
              />
            </Grid>
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2">
                Service Status
              </h2>
              <Grid cols={3} gap={4}>
                <Service
                  icon={Database}
                  label="PostgreSQL"
                  status={data.databaseStatus}
                />
                <Service
                  icon={Database}
                  label="Vector Store"
                  status={data.vectorStoreStatus}
                />
                <Service
                  icon={Brain}
                  label="Embeddings"
                  status={data.embeddingProviderStatus}
                />
                <Service
                  icon={Brain}
                  label="LLM Provider"
                  status={data.llmProviderStatus}
                />
                <Service
                  icon={Activity}
                  label="Repository Intelligence"
                  status={data.repositoryIntelligenceStatus}
                />
                <Service
                  icon={Activity}
                  label="Engineering Intelligence"
                  status={data.engineeringIntelligenceStatus}
                />
                <Service
                  icon={Activity}
                  label="Automation"
                  status={data.automationStatus}
                />
                <Service
                  icon={Activity}
                  label="Durable Queue"
                  status={data.queueStatus}
                />
                <Service
                  icon={GitBranch}
                  label="GitHub API"
                  status={data.githubApiStatus}
                />
              </Grid>
            </div>
            <div className="border border-border bg-card p-4 grid grid-cols-1 xl:grid-cols-2 gap-3 text-xs font-mono">
              <div className="break-all">
                <span className="text-muted-foreground">
                  Embedding signature:{" "}
                </span>
                {data.embeddingSignature || "Not reported"}
              </div>
              <div>
                <span className="text-muted-foreground">
                  Automatic indexing:{" "}
                </span>
                {data.autoIndex == null
                  ? "Not reported"
                  : data.autoIndex
                    ? "enabled"
                    : "disabled"}
              </div>
            </div>
            <div className="text-right text-[10px] text-muted-foreground font-mono">
              Last checked: {formatDate(data.lastCheckedAt)}
            </div>
          </>
        ) : null}
      </PageContent>
    </div>
  );
}

function Service({
  icon: Icon,
  label,
  status,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  status: string;
}) {
  return (
    <div className="border border-border bg-card p-5 flex justify-between items-center gap-3">
      <div className="flex items-center gap-2 font-bold">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <StatusBadge status={tone(status)} text={status.replace("_", " ")} />
    </div>
  );
}
