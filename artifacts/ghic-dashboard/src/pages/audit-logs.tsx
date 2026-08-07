import React from 'react';
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, StatusBadge , FeatureUnavailable } from "@/components/ui/swiss";
import { format } from "date-fns";

export default function AuditLogs() {
  const { data, isLoading } = useListAuditLogs({}, { query: { queryKey: getListAuditLogsQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Audit Logs" description="Platform execution and access logs" />
      <div className="px-6 pt-6">
        <FeatureUnavailable reason="GHIC does not keep an audit log." />
      </div>
      <PageContent>
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Timestamp</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">User</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Action</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Repository</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Result</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Time (ms)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading logs...</td></tr>
              ) : data?.items?.length ? (
                data.items.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                    </td>
                    <td className="px-4 py-3 font-medium">{log.user}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">{log.repositoryName || '-'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={log.result === 'success' ? 'success' : 'danger'} text={log.result} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{log.executionTimeMs || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No audit logs found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageContent>
    </div>
  );
}
