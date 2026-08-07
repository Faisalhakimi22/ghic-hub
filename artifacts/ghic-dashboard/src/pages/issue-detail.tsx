import React from 'react';
import { useParams } from 'wouter';
import { useGetIssue, getGetIssueQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid, StatusBadge } from "@/components/ui/swiss";

export default function IssueDetail() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading } = useGetIssue(id, { query: { enabled: !!id, queryKey: getGetIssueQueryKey(id) } });

  if (isLoading) return <div className="p-8 animate-pulse text-muted-foreground">Loading issue...</div>;
  if (!data) return <div className="p-8 text-muted-foreground">Issue not found</div>;

  const { issue, executiveSummary, rootCauseAnalysis, relevantFiles, suggestedTests } = data;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader 
        title={`#${issue.number} ${issue.title}`} 
        description={`${issue.repositoryName} • Created ${new Date(issue.createdAt).toLocaleDateString()}`}
      >
        <StatusBadge status={issue.priority === 'high' ? 'danger' : 'neutral'} text={`Priority: ${issue.priority}`} />
        <StatusBadge status={issue.status === 'open' ? 'warning' : 'success'} text={`Status: ${issue.status}`} />
      </PageHeader>
      
      <PageContent className="flex flex-col gap-8">
        <Grid cols={3} gap={8}>
          <div className="col-span-2 flex flex-col gap-8">
            <div className="border border-border bg-card p-6">
              <h2 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2 mb-4">Executive Summary</h2>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{executiveSummary || 'No summary available.'}</p>
            </div>
            
            <div className="border border-border bg-card p-6">
              <h2 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2 mb-4">Root Cause Analysis</h2>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{rootCauseAnalysis || 'Analysis pending.'}</p>
            </div>
          </div>
          
          <div className="flex flex-col gap-8">
            <div className="border border-border bg-card p-6">
              <h2 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2 mb-4">Relevant Files</h2>
              {relevantFiles?.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {relevantFiles.map((file, i) => (
                    <li key={i} className="text-xs font-mono bg-muted/50 p-2 border border-border break-all">{file}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No specific files identified.</p>
              )}
            </div>
            
            <div className="border border-border bg-card p-6">
              <h2 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2 mb-4">Suggested Tests</h2>
              {suggestedTests?.length > 0 ? (
                <ul className="flex flex-col gap-2 list-disc pl-4 text-sm">
                  {suggestedTests.map((test, i) => (
                    <li key={i}>{test}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No tests suggested.</p>
              )}
            </div>
          </div>
        </Grid>
      </PageContent>
    </div>
  );
}
