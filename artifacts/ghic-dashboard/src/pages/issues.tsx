import React from "react";
import {
  getListIssuesQueryKey,
  useListIssues,
} from "@workspace/api-client-react";
import { Search } from "lucide-react";
import { Link } from "wouter";

import { DataError } from "@/components/data-state";
import { PageContent, PageHeader, StatusBadge } from "@/components/ui/swiss";
import { useDashboardDate } from "@/lib/account";

function tone(value: string | null | undefined) {
  if (value === "critical" || value === "high" || value === "unavailable")
    return "danger" as const;
  if (value === "available" || value === "complete" || value === "analyzed")
    return "success" as const;
  return "neutral" as const;
}

export default function Issues() {
  const [search, setSearch] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const params = {
    search: search || undefined,
    priority: priority || undefined,
    limit: 100,
  };
  const query = useListIssues(params, {
    query: { queryKey: getListIssuesQueryKey(params) },
  });
  const formatDate = useDashboardDate();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Issue Explorer"
        description="Persisted GHIC predictions and completed analyses"
      />
      <PageContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search issue titles or repositories"
              className="w-full border border-border bg-card py-2 pl-10 pr-3 text-sm focus:outline-none focus:border-primary"
            />
          </label>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All AI priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {query.isError ? (
          <DataError error={query.error} title="Issues unavailable" />
        ) : (
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {[
                    "Issue",
                    "Repository",
                    "Classification",
                    "Statistical Score",
                    "AI Priority",
                    "Repository Evidence",
                    "Analyzed",
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
                      colSpan={7}
                      className="px-4 py-8 text-center text-muted-foreground animate-pulse"
                    >
                      Loading issues...
                    </td>
                  </tr>
                ) : query.data?.items.length ? (
                  query.data.items.map((issue) => (
                    <tr
                      key={issue.id}
                      className="hover:bg-muted/30 transition-colors group"
                    >
                      <td className="px-4 py-3 min-w-64">
                        <Link
                          href={`/issues/${issue.id}`}
                          className="font-bold group-hover:text-primary transition-colors"
                        >
                          #{issue.number} {issue.title || "Title not recorded"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {issue.repositoryName}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {issue.classification}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {Math.round(issue.statisticalScore * 100)}%
                      </td>
                      <td className="px-4 py-3">
                        {issue.priority ? (
                          <StatusBadge
                            status={tone(issue.priority)}
                            text={issue.priority}
                          />
                        ) : (
                          <span className="text-muted-foreground">
                            Not analyzed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={tone(issue.repositoryEvidenceStatus)}
                          text={issue.repositoryEvidenceStatus.replace(
                            "_",
                            " ",
                          )}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">
                        {formatDate(issue.analysisTimestamp || issue.updatedAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No persisted issues match the current filters.
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
