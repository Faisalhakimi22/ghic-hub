import React from "react";
import {
  useListIntegrations,
  getListIntegrationsQueryKey,
} from "@workspace/api-client-react";
import {
  PageHeader,
  PageContent,
  Grid,
  StatusBadge,
} from "@/components/ui/swiss";
import { Plug, ExternalLink } from "lucide-react";
import { DataError } from "@/components/data-state";

export default function Integrations() {
  const { data, isLoading, isError, error } = useListIntegrations({
    query: { queryKey: getListIntegrationsQueryKey() },
  });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Integrations"
        description="Configured GHIC service connections"
      />
      <PageContent>
        {isLoading ? (
          <div className="h-64 bg-muted animate-pulse border border-border" />
        ) : isError ? (
          <DataError error={error} title="Integration status unavailable" />
        ) : data?.length ? (
          <Grid cols={3} gap={6}>
            {data.map((integration) => (
              <div
                key={integration.id}
                className="border border-border bg-card p-6 flex flex-col justify-between gap-6"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 border border-border bg-muted flex items-center justify-center">
                        <Plug className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-bold text-lg leading-tight">
                          {integration.name}
                        </h3>
                        <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                          {integration.type}
                        </span>
                      </div>
                    </div>
                    <StatusBadge
                      status={
                        integration.status === "connected"
                          ? "success"
                          : integration.status === "error"
                            ? "danger"
                            : "neutral"
                      }
                      text={integration.status}
                    />
                  </div>

                  {integration.webhookUrl && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                        Webhook URL
                      </span>
                      <div className="px-2 py-1.5 bg-muted/30 border border-border font-mono text-[10px] truncate flex items-center justify-between">
                        <span className="truncate">
                          {integration.webhookUrl}
                        </span>
                        <ExternalLink className="w-3 h-3 ml-2 shrink-0" />
                      </div>
                    </div>
                  )}
                </div>
                {integration.errorMessage && (
                  <p className="text-xs text-muted-foreground border border-border bg-muted/30 p-3">
                    {integration.errorMessage}
                  </p>
                )}
              </div>
            ))}
          </Grid>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground bg-card">
            No integrations configured.
          </div>
        )}
      </PageContent>
    </div>
  );
}
