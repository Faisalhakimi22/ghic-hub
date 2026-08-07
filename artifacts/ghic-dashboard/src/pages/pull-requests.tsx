import React from 'react';
import { useListPullRequests, getListPullRequestsQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, StatusBadge , FeatureUnavailable } from "@/components/ui/swiss";

export default function PullRequests() {
  const { data, isLoading } = useListPullRequests({}, { query: { queryKey: getListPullRequestsQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Pull Requests" description="AI review complexity and risk assessment" />
      <div className="px-6 pt-6">
        <FeatureUnavailable reason="Pull request data is not exposed as a list endpoint." />
      </div>
      <PageContent>
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">PR</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Title</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Author</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Status</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Risk</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Complexity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading pull requests...</td></tr>
              ) : data?.items?.length ? (
                data.items.map((pr) => (
                  <tr key={pr.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">#{pr.number}</td>
                    <td className="px-4 py-3 font-medium">{pr.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{pr.author}</td>
                    <td className="px-4 py-3"><StatusBadge status={pr.status === 'open' ? 'warning' : 'neutral'} text={pr.status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={pr.risk === 'high' ? 'danger' : 'neutral'} text={pr.risk} /></td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{pr.reviewComplexity}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No pull requests found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageContent>
    </div>
  );
}
