import React from "react";
import { getGetIssueQueryKey, useGetIssue } from "@workspace/api-client-react";
import { ExternalLink } from "lucide-react";
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

function tone(value: string | null | undefined) {
  if (value === "critical" || value === "high" || value === "unavailable")
    return "danger" as const;
  if (value === "available" || value === "complete") return "success" as const;
  return "neutral" as const;
}

export default function IssueDetail() {
  const params = useParams();
  const id = params.id as string;
  const query = useGetIssue(id, {
    query: { enabled: Boolean(id), queryKey: getGetIssueQueryKey(id) },
  });
  const formatDate = useDashboardDate();

  if (query.isLoading)
    return (
      <div className="p-8 animate-pulse text-muted-foreground">
        Loading issue...
      </div>
    );
  if (query.isError)
    return (
      <div className="p-8">
        <DataError error={query.error} title="Issue unavailable" />
      </div>
    );
  if (!query.data)
    return <div className="p-8 text-muted-foreground">Issue not found.</div>;

  const data = query.data;
  const issue = data.issue;
  const chunks = data.evidenceChunks || [];
  const evidenceStatus =
    data.repositoryEvidenceStatus ||
    issue.repositoryEvidenceStatus ||
    "not_recorded";

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={`#${issue.number} ${issue.title || "Title not recorded"}`}
        description={`${issue.repositoryName} | analyzed ${formatDate(issue.analysisTimestamp || issue.updatedAt)}`}
      >
        {issue.priority && (
          <StatusBadge
            status={tone(issue.priority)}
            text={`Priority: ${issue.priority}`}
          />
        )}
        <StatusBadge
          status={issue.status === "closed" ? "success" : "warning"}
          text={`Status: ${issue.status}`}
        />
        {issue.url && (
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer noopener"
            className="p-2 border border-border bg-card hover:bg-muted"
            title="Open GitHub issue"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </PageHeader>

      <PageContent className="flex flex-col gap-8">
        <Grid cols={4}>
          <MetricCard
            compact
            title="Statistical Score"
            value={`${Math.round(issue.statisticalScore * 100)}%`}
          />
          <MetricCard
            compact
            title="Actionability"
            value={issue.actionability}
          />
          <MetricCard
            compact
            title="AI Severity"
            value={issue.severity || "Not recorded"}
          />
          <MetricCard
            compact
            title="Analysis Latency"
            value={
              issue.analysisLatencyMs == null
                ? "Not recorded"
                : `${issue.analysisLatencyMs}ms`
            }
          />
        </Grid>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-8">
          <div className="flex flex-col gap-8 min-w-0">
            <Panel title="Executive Summary">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {data.executiveSummary}
              </p>
            </Panel>

            <Panel title="AI Reasoning">
              {data.reasoning?.length ? (
                <BulletList items={data.reasoning} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No structured reasoning is stored.
                </p>
              )}
            </Panel>

            <Panel title="Recommended Next Step">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {data.investigationPlan || "No recommendation is stored."}
              </p>
            </Panel>

            <UnavailableState
              title="Root-cause intelligence is not enabled"
              reason="GHIC stores the issue analysis and retrieved repository evidence, but Engineering Intelligence is intentionally disabled."
            />
          </div>

          <div className="flex flex-col gap-8 min-w-0">
            <Panel title="Repository Evidence">
              <div className="flex items-center gap-2 mb-3">
                <StatusBadge
                  status={tone(evidenceStatus)}
                  text={evidenceStatus.replace("_", " ")}
                />
              </div>
              {data.repositoryEvidenceNote && (
                <p className="text-xs text-muted-foreground mb-4">
                  {data.repositoryEvidenceNote}
                </p>
              )}
              {data.relevantFiles?.length ? (
                <EvidenceList label="Files" items={data.relevantFiles} />
              ) : null}
              {data.relevantFunctions?.length ? (
                <EvidenceList
                  label="Functions"
                  items={data.relevantFunctions}
                />
              ) : null}
              {chunks.length ? (
                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
                    Retrieved Chunks
                  </p>
                  {chunks.map((chunk, index) => (
                    <div
                      key={`${String(chunk.path || "")}-${index}`}
                      className="border border-border bg-muted/30 p-2 font-mono text-xs break-all"
                    >
                      {String(chunk.path || "Path not recorded")}
                      {chunk.symbol ? `:${String(chunk.symbol)}` : ""}
                      {typeof chunk.score === "number"
                        ? ` | score ${chunk.score.toFixed(3)}`
                        : ""}
                    </div>
                  ))}
                </div>
              ) : null}
              {!data.relevantFiles?.length &&
                !data.relevantFunctions?.length &&
                !chunks.length && (
                  <p className="text-sm text-muted-foreground">
                    No repository files or functions were stored for this
                    analysis.
                  </p>
                )}
            </Panel>

            <Panel title="Missing Information">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {data.missingInformation ||
                  "No missing information was recorded."}
              </p>
            </Panel>

            <Panel title="Suggested Labels">
              {data.suggestedLabels?.length ? (
                <div className="flex flex-wrap gap-2">
                  {data.suggestedLabels.map((label) => (
                    <StatusBadge key={label} status="neutral" text={label} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No labels were suggested.
                </p>
              )}
            </Panel>

            {data.reviewReasons?.length ? (
              <Panel title="Maintainer Review">
                <BulletList items={data.reviewReasons} />
              </Panel>
            ) : null}
          </div>
        </div>
      </PageContent>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-card p-6 min-w-0">
      <h2 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2 mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 flex flex-col gap-2 text-sm">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function EvidenceList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
        {label}
      </p>
      {items.map((item) => (
        <div
          key={item}
          className="text-xs font-mono bg-muted/50 p-2 border border-border break-all"
        >
          {item}
        </div>
      ))}
    </div>
  );
}
