import React from "react";
import {
  getListDuplicateClustersQueryKey,
  useListDuplicateClusters,
} from "@workspace/api-client-react";
import { Link } from "wouter";

import { DataError } from "@/components/data-state";
import { Grid, PageContent, PageHeader } from "@/components/ui/swiss";

export default function Duplicates() {
  const query = useListDuplicateClusters(
    {},
    {
      query: { queryKey: getListDuplicateClustersQueryKey() },
    },
  );

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Duplicate Intelligence"
        description="Duplicate candidates persisted by GHIC analysis"
      />
      <PageContent>
        {query.isLoading ? (
          <div className="h-32 bg-muted animate-pulse border border-border" />
        ) : query.isError ? (
          <DataError
            error={query.error}
            title="Duplicate candidates unavailable"
          />
        ) : query.data?.items.length ? (
          <Grid cols={3} gap={6}>
            {query.data.items.map((cluster) => (
              <div
                key={cluster.id}
                className="border border-border bg-card p-6 flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                    Primary Issue
                  </span>
                  <Link
                    href={`/issues/${cluster.primaryIssue.id}`}
                    className="font-bold text-sm hover:text-primary transition-colors"
                  >
                    #{cluster.primaryIssue.number}{" "}
                    {cluster.primaryIssue.title || "Title not recorded"}
                  </Link>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {cluster.repositoryName}
                  </span>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                    Possible Duplicates
                  </span>
                  {cluster.possibleDuplicates.map((candidate, index) => (
                    <div
                      key={`${candidate.issue.id}-${index}`}
                      className="flex justify-between items-center gap-3 bg-muted/30 p-2 border border-border"
                    >
                      <Link
                        href={`/issues/${candidate.issue.id}`}
                        className="text-xs hover:text-primary transition-colors min-w-0 break-words"
                      >
                        #{candidate.issue.number}{" "}
                        {candidate.issue.title || "Title not recorded"}
                      </Link>
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                        {candidate.similarity == null
                          ? "Score not recorded"
                          : `${Math.round(candidate.similarity * 100)}% match`}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-2 w-full py-2 border border-border bg-muted/30 text-center font-display tracking-widest uppercase text-xs font-bold text-muted-foreground">
                  {cluster.recommendedAction}
                </div>
              </div>
            ))}
          </Grid>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">
            No persisted duplicate candidates.
          </div>
        )}
      </PageContent>
    </div>
  );
}
