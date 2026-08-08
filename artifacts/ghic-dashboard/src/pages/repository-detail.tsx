import React from "react";
import {
  getGetRepositoryQueryKey,
  useGetRepository,
} from "@workspace/api-client-react";
import { useParams } from "wouter";

import { DataError, UnavailableState } from "@/components/data-state";
import {
  Grid,
  MetricCard,
  PageContent,
  PageHeader,
  StatusBadge,
} from "@/components/ui/swiss";
import { useDashboardDate } from "@/lib/account";

function value(input: unknown) {
  return input === null || input === undefined || input === ""
    ? "Not recorded"
    : String(input);
}

function statusTone(status: string) {
  if (["ready", "active", "healthy", "installed"].includes(status))
    return "success" as const;
  if (["failed", "degraded"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

export default function RepositoryDetail() {
  const params = useParams();
  const id = params.id as string;
  const query = useGetRepository(id, {
    query: { enabled: Boolean(id), queryKey: getGetRepositoryQueryKey(id) },
  });
  const formatDate = useDashboardDate();
  const [activeTab, setActiveTab] = React.useState("overview");
  const tabs = ["overview", "index metadata", "components", "operations"];

  if (query.isLoading) {
    return (
      <div className="p-8 animate-pulse text-muted-foreground">
        Loading repository...
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="p-8">
        <DataError error={query.error} title="Repository unavailable" />
      </div>
    );
  }
  if (!query.data)
    return (
      <div className="p-8 text-muted-foreground">Repository not found.</div>
    );

  const repo = query.data;
  const retrievalRate =
    repo.retrievalHitRate == null
      ? "Not measured"
      : `${Math.round(repo.retrievalHitRate * 100)}%`;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={repo.fullName}
        description={
          repo.description ||
          "Repository intelligence status and indexed metadata"
        }
      >
        <a
          href={repo.url}
          target="_blank"
          rel="noreferrer noopener"
          className="px-4 py-1.5 text-xs font-display tracking-widest uppercase font-bold border border-border bg-card hover:bg-muted transition-colors"
        >
          Open GitHub
        </a>
      </PageHeader>

      <div className="px-8 border-b border-border bg-card overflow-x-auto scrollbar-none">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-xs font-display tracking-widest uppercase font-bold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <PageContent>
        {activeTab === "overview" && (
          <div className="flex flex-col gap-8">
            <Grid cols={4}>
              <MetricCard compact title="Index Health" value={repo.health} />
              <MetricCard
                compact
                title="Files Indexed"
                value={repo.fileCount}
              />
              <MetricCard
                compact
                title="Chunks Indexed"
                value={repo.chunkCount}
              />
              <MetricCard
                compact
                title="Retrieval Hit Rate"
                value={retrievalRate}
              />
            </Grid>

            <Grid cols={2} gap={8}>
              <div className="border border-border bg-card p-6 flex flex-col gap-4">
                <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">
                  Repository Info
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <Info label="Owner" value={repo.owner} />
                  <Info
                    label="Visibility"
                    value={repo.visibility.replace("_", " ")}
                  />
                  <Info label="Language" value={value(repo.language)} />
                  <Info label="Frameworks" value={value(repo.framework)} />
                  <Info
                    label="Default Branch"
                    value={value(repo.defaultBranch)}
                  />
                  <Info
                    label="Last Indexed"
                    value={formatDate(repo.lastIndexedAt)}
                  />
                </div>
              </div>

              <div className="border border-border bg-card p-6 flex flex-col gap-4">
                <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">
                  Runtime Status
                </h3>
                <StatusRow label="Index" value={repo.indexStatus} />
                <StatusRow
                  label="Repository Intelligence"
                  value={repo.repositoryIntelligenceStatus}
                />
                <StatusRow
                  label="Engineering Intelligence"
                  value={repo.engineeringIntelligenceStatus}
                />
                <StatusRow
                  label="GitHub Installation"
                  value={repo.installationStatus}
                />
                <StatusRow label="Webhook" value={repo.webhookStatus} />
              </div>
            </Grid>
          </div>
        )}

        {activeTab === "index metadata" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="border border-border bg-card p-6 flex flex-col gap-4">
              <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">
                Embedding Index
              </h3>
              <Info label="Provider" value={value(repo.embeddingProvider)} />
              <Info label="Model" value={value(repo.embeddingModel)} />
              <Info
                label="Dimensions"
                value={value(repo.embeddingDimensions)}
              />
              <Info label="Vector Backend" value={value(repo.vectorBackend)} />
              <Info
                label="Indexed Commit"
                value={value(repo.indexedCommitSha)}
                breakAll
              />
            </div>
            <div className="border border-border bg-card p-6 flex flex-col gap-4">
              <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">
                Indexed Summary
              </h3>
              {repo.architectureSummary ? (
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {repo.architectureSummary}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No architecture summary is stored for this repository.
                </p>
              )}
              {repo.countMismatch && (
                <p className="text-sm border border-destructive/40 bg-destructive/5 p-3">
                  Stored repository counts do not match the current vector rows.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === "components" && (
          <UnavailableState
            title="Component intelligence is unavailable"
            reason="Component health requires Engineering Intelligence, which is intentionally disabled."
          />
        )}

        {activeTab === "operations" && (
          <div className="border border-border bg-card p-6 flex flex-col gap-4">
            <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">
              Operational Status
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The dashboard is read-only for repository indexing. It does not
              queue, rebuild, or modify repository vectors.
            </p>
            {repo.operationalMessage ? (
              <div className="border border-destructive/40 bg-destructive/5 p-4 text-sm">
                {repo.operationalMessage}
              </div>
            ) : (
              <p className="text-sm">No active indexing error is recorded.</p>
            )}
          </div>
        )}
      </PageContent>
    </div>
  );
}

function Info({
  label,
  value: text,
  breakAll = false,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] text-muted-foreground font-display tracking-widest uppercase">
        {label}
      </span>
      <span
        className={`font-mono text-sm ${breakAll ? "break-all" : "break-words"}`}
      >
        {text}
      </span>
    </div>
  );
}

function StatusRow({ label, value: text }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-4 text-sm border-b border-border pb-3 last:border-0 last:pb-0">
      <span className="font-medium">{label}</span>
      <StatusBadge status={statusTone(text)} text={text.replace("_", " ")} />
    </div>
  );
}
