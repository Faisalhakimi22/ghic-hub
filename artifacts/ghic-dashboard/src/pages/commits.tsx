import React from 'react';
import { useListCommits, getListCommitsQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, StatusBadge , FeatureUnavailable } from "@/components/ui/swiss";
import { format } from "date-fns";

export default function Commits() {
  const { data, isLoading } = useListCommits({}, { query: { queryKey: getListCommitsQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Commit Intelligence" description="Risk and regression analysis for recent commits" />
      <div className="px-6 pt-6">
        <FeatureUnavailable reason="Commit data lives inside the repository index and is not exposed as a list endpoint." />
      </div>
      <PageContent>
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">SHA</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Message</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Author</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Date</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading commits...</td></tr>
              ) : data?.items?.length ? (
                data.items.map((commit) => (
                  <tr key={commit.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{commit.shortSha}</td>
                    <td className="px-4 py-3 font-medium truncate max-w-md">{commit.message}</td>
                    <td className="px-4 py-3 text-muted-foreground">{commit.author}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{format(new Date(commit.date), 'MMM d, HH:mm')}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={commit.risk === 'high' ? 'danger' : commit.risk === 'medium' ? 'warning' : 'success'} text={commit.risk} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No commits found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageContent>
    </div>
  );
}
