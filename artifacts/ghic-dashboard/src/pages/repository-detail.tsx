import React from 'react';
import { useParams } from 'wouter';
import { useGetRepository, getGetRepositoryQueryKey, useListComponents, getListComponentsQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, MetricCard, Grid, StatusBadge } from "@/components/ui/swiss";
import { format } from "date-fns";

function value(v: unknown) {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

export default function RepositoryDetail() {
  const params = useParams();
  const id = params.id as string;
  const { data: repo, isLoading } = useGetRepository(id, { query: { enabled: !!id, queryKey: getGetRepositoryQueryKey(id) } });
  const { data: components, isLoading: componentsLoading } = useListComponents(
    { repositoryId: id },
    { query: { enabled: !!id, queryKey: getListComponentsQueryKey({ repositoryId: id }) } },
  );

  const [activeTab, setActiveTab] = React.useState('overview');
  const tabs = ['overview', 'architecture', 'components', 'operations'];

  if (isLoading) return <div className="p-8 animate-pulse text-muted-foreground">Loading repository...</div>;
  if (!repo) return <div className="p-8 text-muted-foreground">Repository not found</div>;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={repo.fullName}
        description={repo.description || 'Repository intelligence status and indexed metadata'}
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
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-xs font-display tracking-widest uppercase font-bold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <PageContent>
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-8">
            <Grid cols={4}>
              <MetricCard title="Health Score" value={value(repo.healthScore)} />
              <MetricCard title="Risk Score" value={value(repo.riskScore)} />
              <MetricCard title="Files Indexed" value={value((repo as any).fileCount)} />
              <MetricCard title="Chunks Indexed" value={value((repo as any).chunkCount)} />
            </Grid>

            <Grid cols={2} gap={8}>
              <div className="border border-border bg-card p-6 flex flex-col gap-4">
                <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">Repository Info</h3>
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">Language</span>
                    <span className="font-mono">{repo.language || '—'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">Frameworks</span>
                    <span className="font-mono">{repo.framework || '—'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">Default Branch</span>
                    <span className="font-mono">{repo.defaultBranch}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">Last Indexed</span>
                    <span className="font-mono">{repo.lastIndexedAt ? format(new Date(repo.lastIndexedAt), 'MMM d, yyyy HH:mm') : '—'}</span>
                  </div>
                </div>
              </div>

              <div className="border border-border bg-card p-6 flex flex-col gap-4">
                <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">Intelligence Status</h3>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center text-sm border-b border-border pb-3">
                    <span className="font-medium">Index Status</span>
                    <StatusBadge status={repo.indexStatus === 'ready' || repo.indexStatus === 'updating' ? 'success' : repo.indexStatus === 'failed' ? 'danger' : 'neutral'} text={repo.indexStatus} />
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-border pb-3">
                    <span className="font-medium">Repository Intelligence</span>
                    <StatusBadge status={repo.repositoryIntelligenceStatus === 'active' ? 'success' : 'neutral'} text={repo.repositoryIntelligenceStatus} />
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-border pb-3">
                    <span className="font-medium">Webhook Status</span>
                    <StatusBadge status={repo.webhookStatus === 'healthy' ? 'success' : 'danger'} text={repo.webhookStatus} />
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">Installation</span>
                    <StatusBadge status="success" text={repo.installationStatus} />
                  </div>
                </div>
              </div>
            </Grid>
          </div>
        )}

        {activeTab === 'architecture' && (
          <div className="border border-border bg-card p-6 flex flex-col gap-4">
            <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">Indexed Summary</h3>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {(repo as any).architectureSummary || repo.description || 'No architecture summary has been indexed for this repository yet.'}
            </p>
            {(repo as any).indexedCommitSha && (
              <p className="text-xs font-mono text-muted-foreground">Indexed commit: {(repo as any).indexedCommitSha}</p>
            )}
          </div>
        )}

        {activeTab === 'components' && (
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Component</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Health</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Issues</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Regressions</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Commits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {componentsLoading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading components...</td></tr>
                ) : components?.items?.length ? (
                  components.items.map((component) => (
                    <tr key={component.id}>
                      <td className="px-4 py-3 font-medium">{component.name}</td>
                      <td className="px-4 py-3"><StatusBadge status={component.health === 'healthy' ? 'success' : component.health === 'fragile' ? 'danger' : 'neutral'} text={component.health} /></td>
                      <td className="px-4 py-3 font-mono text-xs">{component.issueCount}</td>
                      <td className="px-4 py-3 font-mono text-xs">{component.regressionCount}</td>
                      <td className="px-4 py-3 font-mono text-xs">{component.recentCommits}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No component data is indexed for this repository.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'operations' && (
          <div className="border border-border bg-card p-6 flex flex-col gap-4">
            <h3 className="text-sm font-display tracking-widest uppercase font-bold border-b border-border pb-2">Operational Controls</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              GHIC does not expose public sync or reindex actions from the dashboard. Repository indexing is queued by the backend when webhooks observe repositories, and manual reindexing is an operator task on the GHIC service.
            </p>
            {(repo as any).lastError && (
              <div className="border border-destructive/40 bg-destructive/5 p-4 text-sm">
                {(repo as any).lastError}
              </div>
            )}
          </div>
        )}
      </PageContent>
    </div>
  );
}
