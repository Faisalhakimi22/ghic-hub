import React from 'react';
import { useListComponents, getListComponentsQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, StatusBadge } from "@/components/ui/swiss";

export default function Components() {
  const { data, isLoading } = useListComponents({}, { query: { queryKey: getListComponentsQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Components" description="Logical component health and fragility" />
      <PageContent>
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Component</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Repository</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Health</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Risk</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Issues</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Regressions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading components...</td></tr>
              ) : data?.items?.length ? (
                data.items.map((comp) => (
                  <tr key={comp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{comp.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{comp.repositoryName}</td>
                    <td className="px-4 py-3"><span className="font-mono text-xs">{comp.healthScore}</span></td>
                    <td className="px-4 py-3"><span className="font-mono text-xs">{comp.riskScore}</span></td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{comp.issueCount}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{comp.regressionCount}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No components found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageContent>
    </div>
  );
}
