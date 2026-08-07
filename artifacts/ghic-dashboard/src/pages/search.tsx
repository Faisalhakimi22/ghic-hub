import React, { useState, useEffect } from 'react';
import { useGlobalSearch, getGlobalSearchQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent } from "@/components/ui/swiss";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { Link } from "wouter";

export default function Search() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 500);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useGlobalSearch(
    { q: debouncedQuery },
    { query: { enabled: debouncedQuery.length > 2, queryKey: getGlobalSearchQueryKey({ q: debouncedQuery }) } }
  );

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Global Search" description="Search repositories and recent scored issues" />
      <PageContent className="flex flex-col gap-8 max-w-4xl">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search issues, commits, PRs, or repositories... (min 3 chars)"
            className="w-full pl-12 pr-4 py-4 bg-card border border-border text-foreground focus:outline-none focus:border-primary font-mono text-sm transition-colors"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {isLoading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-primary" />}
        </div>

        {debouncedQuery.length > 2 ? (
          <div className="flex flex-col gap-6">
            {!isLoading && data && (
              <>
                {Object.entries(data).map(([key, items]) => {
                  if (!Array.isArray(items) || items.length === 0) return null;
                  return (
                    <div key={key} className="flex flex-col gap-3">
                      <h3 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground">{key}</h3>
                      <div className="border border-border bg-card divide-y divide-border">
                        {items.map((item: any) => (
                          <Link 
                            key={item.id} 
                            href={item.url || '#'}
                            className="block p-4 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{item.title}</span>
                                {item.description && <span className="text-sm text-muted-foreground line-clamp-1">{item.description}</span>}
                              </div>
                              <span className="text-[10px] font-mono bg-muted px-2 py-1 border border-border shrink-0">
                                Match: {Math.round(item.score * 100)}%
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {Object.values(data).every(items => !Array.isArray(items) || items.length === 0) && (
                  <div className="p-8 border border-border text-center text-muted-foreground bg-card">No results found for "{debouncedQuery}".</div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="p-16 border border-border text-center text-muted-foreground bg-card">
            <SearchIcon className="w-8 h-8 mx-auto mb-4 opacity-20" />
            <p className="font-display tracking-widest uppercase text-sm mb-2">Search Engineering Data</p>
            <p className="text-xs">Enter a search term to find relevant issues, code, and insights.</p>
          </div>
        )}
      </PageContent>
    </div>
  );
}
