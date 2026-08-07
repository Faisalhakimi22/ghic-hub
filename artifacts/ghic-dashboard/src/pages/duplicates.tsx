import React from 'react';
import { useListDuplicateClusters, getListDuplicateClustersQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid } from "@/components/ui/swiss";
import { Link } from "wouter";

export default function Duplicates() {
  const { data, isLoading } = useListDuplicateClusters({}, { query: { queryKey: getListDuplicateClustersQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Duplicate Intelligence" description="Identify and merge duplicate issues" />
      <PageContent>
        {isLoading ? (
          <div className="h-32 bg-muted animate-pulse border border-border" />
        ) : data?.items?.length ? (
          <Grid cols={3} gap={6}>
            {data.items.map((cluster) => (
              <div key={cluster.id} className="border border-border bg-card p-6 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">Primary Issue</span>
                    <Link href={`/issues/${cluster.primaryIssue.id}`} className="font-bold text-sm hover:text-primary transition-colors">
                      #{cluster.primaryIssue.number} {cluster.primaryIssue.title}
                    </Link>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">Duplicates</span>
                  {cluster.possibleDuplicates.map((dup, i) => (
                    <div key={i} className="flex justify-between items-center bg-muted/30 p-2 border border-border">
                      <Link href={`/issues/${dup.issue.id}`} className="text-xs hover:text-primary transition-colors">
                        #{dup.issue.number} {dup.issue.title}
                      </Link>
                      <span className="font-mono text-[10px] bg-primary/10 text-primary px-1">{Math.round(dup.similarity * 100)}% Match</span>
                    </div>
                  ))}
                </div>

                <button className="mt-2 w-full py-2 bg-primary text-primary-foreground font-display tracking-widest uppercase text-xs font-bold hover:bg-primary/90 transition-colors">
                  {cluster.recommendedAction}
                </button>
              </div>
            ))}
          </Grid>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">No duplicate clusters found.</div>
        )}
      </PageContent>
    </div>
  );
}
