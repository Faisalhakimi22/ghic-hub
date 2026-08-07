import React from 'react';
import { useListAutomationSuggestions, getListAutomationSuggestionsQueryKey, useApproveAutomationSuggestion, useRejectAutomationSuggestion } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid, StatusBadge } from "@/components/ui/swiss";
import { Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Automation() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListAutomationSuggestions({}, { query: { queryKey: getListAutomationSuggestionsQueryKey() } });
  
  const approve = useApproveAutomationSuggestion({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAutomationSuggestionsQueryKey() })
    }
  });

  const reject = useRejectAutomationSuggestion({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAutomationSuggestionsQueryKey() })
    }
  });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Automation Center" description="Review and approve AI-generated actions" />
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
                
                {suggestion.status === 'pending' ? (
                  <div className="flex border-t border-border">
                    <button 
                      onClick={() => reject.mutate({ id: suggestion.id })}
                      disabled={reject.isPending}
                      className="flex-1 py-3 flex justify-center items-center gap-2 hover:bg-muted/50 transition-colors border-r border-border text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                      <span className="font-display uppercase tracking-widest text-[10px] font-bold">Reject</span>
                    </button>
                    <button 
                      onClick={() => approve.mutate({ id: suggestion.id })}
                      disabled={approve.isPending}
                      className="flex-1 py-3 flex justify-center items-center gap-2 hover:bg-primary/10 transition-colors text-primary"
                    >
                      <Check className="w-4 h-4" />
                      <span className="font-display uppercase tracking-widest text-[10px] font-bold">Approve</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 border-t border-border text-center text-xs font-display uppercase tracking-widest font-bold text-muted-foreground">
                    {suggestion.status}
                  </div>
                )}
              </div>
            ))}
          </Grid>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">No automation suggestions available.</div>
        )}
      </PageContent>
    </div>
  );
}
