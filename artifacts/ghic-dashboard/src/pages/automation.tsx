import React from 'react';
import { useListAutomationSuggestions, getListAutomationSuggestionsQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid, StatusBadge } from "@/components/ui/swiss";

export default function Automation() {
  const { data, isLoading } = useListAutomationSuggestions({}, { query: { queryKey: getListAutomationSuggestionsQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Automation Center" description="Read-only advisory automation output" />
      <PageContent>
        {isLoading ? (
          <div className="h-32 bg-muted animate-pulse border border-border" />
        ) : data?.items?.length ? (
          <Grid cols={3} gap={6}>
            {data.items.map((suggestion) => (
              <div key={suggestion.id} className="border border-border bg-card flex flex-col justify-between">
                <div className="p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <StatusBadge status="neutral" text={suggestion.type} />
                    <span className="font-mono text-[10px] text-muted-foreground">{Math.round(suggestion.confidence * 100)}% Conf</span>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-bold truncate">{suggestion.issueTitle || 'Global Suggestion'}</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">{suggestion.repositoryName}</p>
                  </div>
                  
                  <div className="p-3 bg-muted/30 border border-border text-sm font-mono whitespace-pre-wrap h-24 overflow-y-auto">
                    {suggestion.content}
                  </div>
                </div>
                <div className="p-3 border-t border-border text-center text-xs font-display uppercase tracking-widest font-bold text-muted-foreground">
                  {suggestion.status}
                </div>
              </div>
            ))}
          </Grid>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">No advisory automation output has been recorded yet.</div>
        )}
      </PageContent>
    </div>
  );
}
