import React from 'react';
import { useListIssues, getListIssuesQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, StatusBadge } from "@/components/ui/swiss";
import { Link } from "wouter";

export default function Issues() {
  const { data, isLoading } = useListIssues({}, { query: { queryKey: getListIssuesQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Issue Explorer" description="Advanced filterable issue intelligence" />
      <PageContent>
        <div className="border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Issue</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Repository</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Title</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Priority</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">AI Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading issues...</td></tr>
                ) : data?.items?.length ? (
                  data.items.map((issue) => (
                    <tr key={issue.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/issues/${issue.id}`} className="hover:text-primary transition-colors">#{issue.number}</Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{issue.repositoryName}</td>
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/issues/${issue.id}`} className="group-hover:text-primary transition-colors">{issue.title}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={issue.priority === 'high' || issue.priority === 'critical' ? 'danger' : 'neutral'} text={issue.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={issue.aiStatus === 'analyzed' ? 'success' : 'warning'} text={issue.aiStatus} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No issues found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PageContent>
    </div>
  );
}
