import React from 'react';
import { useListIntegrations, getListIntegrationsQueryKey, useToggleIntegration } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid, StatusBadge , FeatureUnavailable } from "@/components/ui/swiss";
import { useQueryClient } from "@tanstack/react-query";
import { Power, Plug, ExternalLink } from "lucide-react";

export default function Integrations() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListIntegrations({ query: { queryKey: getListIntegrationsQueryKey() } });
  
  const toggle = useToggleIntegration({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() })
    }
  });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Integrations" description="Connect external services and webhooks" />
      <div className="px-6 pt-6">
        <FeatureUnavailable reason="No third-party integrations are configured." />
      </div>
      <PageContent>
        {isLoading ? (
          <div className="h-64 bg-muted animate-pulse border border-border" />
        ) : data?.length ? (
          <Grid cols={3} gap={6}>
            {data.map((integration) => (
              <div key={integration.id} className="border border-border bg-card p-6 flex flex-col justify-between gap-6">
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 border border-border bg-muted flex items-center justify-center">
                        <Plug className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-bold text-lg leading-tight">{integration.name}</h3>
                        <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">{integration.type}</span>
                      </div>
                    </div>
                    <StatusBadge 
                      status={integration.status === 'connected' ? 'success' : integration.status === 'error' ? 'danger' : 'neutral'} 
                      text={integration.status} 
                    />
                  </div>
                  
                  {integration.webhookUrl && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">Webhook URL</span>
                      <div className="px-2 py-1.5 bg-muted/30 border border-border font-mono text-[10px] truncate flex items-center justify-between">
                        <span className="truncate">{integration.webhookUrl}</span>
                        <ExternalLink className="w-3 h-3 ml-2 shrink-0" />
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => toggle.mutate({ id: integration.id })}
                  disabled={toggle.isPending}
                  className={`w-full py-2.5 flex justify-center items-center gap-2 font-display tracking-widest uppercase text-xs font-bold transition-colors ${
                    integration.enabled 
                      ? 'border border-border text-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive' 
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {integration.enabled ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            ))}
          </Grid>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground bg-card">No integrations configured.</div>
        )}
      </PageContent>
    </div>
  );
}
