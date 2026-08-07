import React from 'react';
import { useListRegressions, getListRegressionsQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, StatusBadge } from "@/components/ui/swiss";
import { Link } from "wouter";

export default function Regressions() {
  const { data, isLoading } = useListRegressions({}, { query: { queryKey: getListRegressionsQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Regression Center" description="Track issues that reintroduced past bugs" />
      <PageContent>
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Issue</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Repository</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Confidence</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Related Commit</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading regressions...</td></tr>
              ) : data?.items?.length ? (
                data.items.map((reg) => (
                  <tr key={reg.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/issues/${reg.issue.id}`} className="hover:text-primary transition-colors">#{reg.issue.number}</Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{reg.repositoryName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-destructive">{Math.round(reg.confidence * 100)}%</td>
                    <td className="px-4 py-3 font-mono text-xs">{reg.relatedCommitSha?.substring(0, 7) || '-'}</td>
                    <td className="px-4 py-3"><StatusBadge status={reg.investigationStatus === 'resolved' ? 'success' : 'warning'} text={reg.investigationStatus} /></td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No regressions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageContent>
    </div>
  );
}
