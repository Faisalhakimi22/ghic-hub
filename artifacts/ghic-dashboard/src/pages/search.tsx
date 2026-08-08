import React from "react";
import {
  type SearchResultItem,
  getGlobalSearchQueryKey,
  useGlobalSearch,
} from "@workspace/api-client-react";
import { Loader2, Search as SearchIcon } from "lucide-react";
import { Link } from "wouter";

import { DataError } from "@/components/data-state";
import { PageContent, PageHeader } from "@/components/ui/swiss";

export default function Search() {
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const search = useGlobalSearch(
    { q: debouncedQuery },
    {
      query: {
        enabled: debouncedQuery.length > 2,
        queryKey: getGlobalSearchQueryKey({ q: debouncedQuery }),
      },
    },
  );
  const groups: Array<[string, SearchResultItem[]]> = search.data
    ? [
        ["Repositories", search.data.repositories],
        ["Issues and analyses", search.data.issues],
        ["Indexed code", search.data.code],
      ]
    : [];
  const hasResults = groups.some(([, items]) => items.length > 0);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Global Search"
        description="Search persisted repositories, issue analyses, and indexed code metadata"
      />
      <PageContent className="flex flex-col gap-8 max-w-4xl">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search repositories, issues, file paths, or functions"
            className="w-full pl-12 pr-12 py-4 bg-card border border-border text-foreground focus:outline-none focus:border-primary font-mono text-sm transition-colors"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {search.isLoading && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-primary" />
          )}
        </div>

        {search.isError ? (
          <DataError error={search.error} title="Search unavailable" />
        ) : debouncedQuery.length > 2 ? (
          <div className="flex flex-col gap-6">
            {!search.isLoading &&
              groups.map(([label, items]) =>
                items.length ? (
                  <section key={label} className="flex flex-col gap-3">
                    <h3 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground">
                      {label}
                    </h3>
                    <div className="border border-border bg-card divide-y divide-border">
                      {items.map((item) => (
                        <Link
                          key={item.id}
                          href={item.url || "#"}
                          className="block p-4 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="font-medium break-words">
                                {item.title}
                              </span>
                              {item.description && (
                                <span className="text-sm text-muted-foreground break-words">
                                  {item.description}
                                </span>
                              )}
                              {item.repositoryName && (
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {item.repositoryName}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono bg-muted px-2 py-1 border border-border shrink-0">
                              {item.score == null
                                ? item.matchType || "metadata"
                                : `${Math.round(item.score * 100)}%`}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null,
              )}
            {!search.isLoading && !hasResults && (
              <div className="p-8 border border-border text-center text-muted-foreground bg-card">
                No persisted data matches "{debouncedQuery}".
              </div>
            )}
          </div>
        ) : (
          <div className="p-16 border border-border text-center text-muted-foreground bg-card">
            <SearchIcon className="w-8 h-8 mx-auto mb-4 opacity-20" />
            <p className="font-display tracking-widest uppercase text-sm mb-2">
              Search GHIC Data
            </p>
            <p className="text-xs">Enter at least three characters.</p>
          </div>
        )}
      </PageContent>
    </div>
  );
}
