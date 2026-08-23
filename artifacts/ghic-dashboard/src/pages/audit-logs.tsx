import React from "react";
import {
  getListAuditLogsQueryKey,
  useListAuditLogs,
} from "@workspace/api-client-react";

import { DataError } from "@/components/data-state";
import { PageContent, PageHeader, StatusBadge } from "@/components/ui/swiss";
import { useDashboardDate } from "@/lib/account";

export default function AuditLogs() {
  const query = useListAuditLogs(
    {},
    { query: { queryKey: getListAuditLogsQueryKey() } },
  );
  const formatDate = useDashboardDate();
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Audit Logs"
        description="Persisted GHIC processing events"
      />
      <PageContent>
        {query.isError ? (
          <DataError
            error={query.error}
            title="Processing events unavailable"
          />
        ) : (
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {[
                    "Timestamp",
                    "Actor",
                    "Action",
                    "Repository",
                    "Result",
                    "Time",
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {query.isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground animate-pulse"
                    >
                      Loading events...
                    </td>
                  </tr>
                ) : query.data?.items.length ? (
                  query.data.items.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="px-4 py-3 font-medium">{log.user}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {log.action.replaceAll("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {log.repositoryName || "Not recorded"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={
                            log.result === "success" ? "success" : "danger"
                          }
                          text={log.result}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {log.executionTimeMs == null
                          ? "Not recorded"
                          : `${log.executionTimeMs}ms`}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No persisted processing events.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>
    </div>
  );
}
