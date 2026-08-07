import React from 'react';
import { useListRepositories, getListRepositoriesQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, StatusBadge } from "@/components/ui/swiss";
import { Link } from "wouter";
import { format } from "date-fns";

function score(value: number | null | undefined) {
  return typeof value === 'number' ? value : '—';
}

function scoreClass(value: number | null | undefined, highGood = true) {
  if (typeof value !== 'number') return 'text-muted-foreground';
  if (highGood) return value >= 80 ? 'text-primary' : value >= 50 ? 'text-amber-500' : 'text-destructive';
  return value >= 70 ? 'text-destructive' : value >= 30 ? 'text-amber-500' : 'text-primary';
}

export default function Repositories() {
  const { data, isLoading } = useListRepositories({}, { query: { queryKey: getListRepositoriesQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader 
        title="Repositories" 
        description="Manage connected GitHub repositories" 
      />
      
      <PageContent>
        <div className="border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Repository</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Health</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Risk</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Language</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Open Issues</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Index Status</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading repositories...</td>
                  </tr>
                ) : data?.items?.length ? (
                  data.items.map((repo) => (
                    <tr key={repo.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/repositories/${repo.id}`} className="font-bold text-foreground group-hover:text-primary transition-colors">
                          {repo.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono ${scoreClass(repo.healthScore)}`}>
                          {score(repo.healthScore)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono ${scoreClass(repo.riskScore, false)}`}>
                          {score(repo.riskScore)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{repo.language || '-'}</td>
                      <td className="px-4 py-3 font-mono">{repo.openIssues}</td>
                      <td className="px-4 py-3">
                        <StatusBadge 
                          status={repo.indexStatus === 'ready' || repo.indexStatus === 'updating' ? 'success' : repo.indexStatus === 'failed' ? 'danger' : 'neutral'} 
                          text={repo.indexStatus} 
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {format(new Date(repo.updatedAt), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No repositories found. Connect GitHub to get started.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PageContent>
    </div>
  );
}
