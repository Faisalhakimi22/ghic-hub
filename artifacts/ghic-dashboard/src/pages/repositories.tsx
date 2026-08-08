import React from "react";
import {
  getListRepositoriesQueryKey,
  useListRepositories,
} from "@workspace/api-client-react";
import { Search } from "lucide-react";
import { Link } from "wouter";

import { DataError } from "@/components/data-state";
import { PageContent, PageHeader, StatusBadge } from "@/components/ui/swiss";
import { useDashboardDate } from "@/lib/account";

export default function Repositories() {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const params = {
    search: search || undefined,
    status: status || undefined,
    limit: 100,
  };
  const query = useListRepositories(params, {
    query: { queryKey: getListRepositoriesQueryKey(params) },
  });
  const formatDate = useDashboardDate();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Repositories"
        description="Persisted GHIC repository indexes"
      />
      <PageContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tracked repositories"
              className="w-full border border-border bg-card py-2 pl-10 pr-3 text-sm focus:outline-none focus:border-primary"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All index states</option>
            <option value="ready">Ready</option>
            <option value="failed">Failed</option>
            <option value="indexing">Indexing</option>
            <option value="not_indexed">Not indexed</option>
          </select>
        </div>

        {query.isError ? (
          <DataError error={query.error} title="Repositories unavailable" />
        ) : (
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {[
                    "Repository",
                    "Health",
                    "Visibility",
                    "Language",
                    "Indexed Data",
                    "Index Status",
                    "Last Indexed",
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
                      Loading repositories...
                    </td>
                  </tr>
                ) : query.data?.items.length ? (
                  query.data.items.map((repository) => (
                    <tr
                      key={repository.id}
                      className="hover:bg-muted/30 transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/repositories/${repository.id}`}
                          className="font-bold group-hover:text-primary transition-colors"
                        >
                          {repository.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={
                            repository.health === "healthy"
                              ? "success"
                              : repository.health === "failed" ||
                                  repository.health === "degraded"
                                ? "danger"
                                : "neutral"
                          }
                          text={repository.health}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {repository.visibility.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {repository.language || "Not recorded"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {repository.fileCount} files / {repository.chunkCount}{" "}
                        chunks
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={
                            repository.indexStatus === "ready"
                              ? "success"
                              : repository.indexStatus === "failed"
                                ? "danger"
                                : "neutral"
                          }
                          text={repository.indexStatus}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">
                        {formatDate(repository.lastIndexedAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No repositories match the current filters.
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
