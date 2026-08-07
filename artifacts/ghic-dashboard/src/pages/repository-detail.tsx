import React from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetRepository, getGetRepositoryQueryKey, useSyncRepository, useReindexRepository } from "@workspace/api-client-react";
import { PageHeader, PageContent, MetricCard, Grid, StatusBadge } from "@/components/ui/swiss";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export default function RepositoryDetail() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const { data: repo, isLoading } = useGetRepository(id, { query: { enabled: !!id, queryKey: getGetRepositoryQueryKey(id) } });

  const sync = useSyncRepository({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetRepositoryQueryKey(id) })
    }
  });

  const reindex = useReindexRepository({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetRepositoryQueryKey(id) })
    }
  });

  const [activeTab, setActiveTab] = React.useState('overview');
  const tabs = ['overview', 'architecture', 'issues', 'commits', 'pull-requests', 'releases', 'analytics', 'components', 'settings'];

  if (isLoading) return <div className="p-8 animate-pulse text-muted-foreground">Loading repository...</div>;
  if (!repo) return <div className="p-8 text-muted-foreground">Repository not found</div>;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader 
        title={repo.fullName} 
        description={repo.description || 'No description provided'} 
      >
        <div className="flex gap-2">
          <button 
            onClick={() => sync.mutate({ id })}
            disabled={sync.isPending}
            className="px-4 py-1.5 text-xs font-display tracking-widest uppercase font-bold border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
          >
            {sync.isPending ? 'Syncing...' : 'Sync'}
          </button>
          <button 
            onClick={() => reindex.mutate({ id })}
            disabled={reindex.isPending}
            className="px-4 py-1.5 text-xs font-display tracking-widest uppercase font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {reindex.isPending ? 'Reindexing...' : 'Reindex'}
          </button>
        </div>
      </PageHeader>
      
      {/* Tabs */}
      <div className="px-8 border-b border-border bg-card overflow-x-auto scrollbar-none">
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-xs font-display tracking-widest uppercase font-bold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      <PageContent>
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-8">
            <Grid cols={4}>
              <MetricCard title="Health Score" value={repo.healthScore} />
              <MetricCard title="Risk Score" value={repo.riskScore} />
              <MetricCard title="Open Issues" value={repo.openIssues} />
              <MetricCard title="Contributors" value={repo.contributors} />
            </Grid>

            <Grid cols={2} gap={8}>
              <div className="border border-border bg-card p-6 flex flex-col gap-4">
                <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">Repository Info</h3>
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">Language</span>
                    <span className="font-mono">{repo.language || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">Framework</span>
                    <span className="font-mono">{repo.framework || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">Default Branch</span>
                    <span className="font-mono">{repo.defaultBranch}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">Size</span>
                    <span className="font-mono">{Math.round(repo.sizeKb / 1024)} MB</span>
                  </div>
                </div>
              </div>

              <div className="border border-border bg-card p-6 flex flex-col gap-4">
                <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">Intelligence Status</h3>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center text-sm border-b border-border pb-3">
                    <span className="font-medium">Index Status</span>
                    <StatusBadge status={repo.indexStatus === 'completed' ? 'success' : 'warning'} text={repo.indexStatus} />
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-border pb-3">
                    <span className="font-medium">Repository Intelligence</span>
                    <StatusBadge status={repo.repositoryIntelligenceStatus === 'active' ? 'success' : 'neutral'} text={repo.repositoryIntelligenceStatus} />
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-border pb-3">
                    <span className="font-medium">Engineering Intelligence</span>
                    <StatusBadge status={repo.engineeringIntelligenceStatus === 'active' ? 'success' : 'neutral'} text={repo.engineeringIntelligenceStatus} />
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">Webhook Status</span>
                    <StatusBadge status={repo.webhookStatus === 'healthy' ? 'success' : 'danger'} text={repo.webhookStatus} />
                  </div>
                </div>
              </div>
            </Grid>
          </div>
        )}
        
        {activeTab !== 'overview' && (
          <div className="p-16 border border-border text-center text-muted-foreground bg-card">
            <p className="font-display tracking-widest uppercase text-sm mb-2">{activeTab.replace('-', ' ')} Explorer</p>
            <p className="text-xs">Select a specific repository component to view detailed insights.</p>
          </div>
        )}
      </PageContent>
    </div>
  );
}
