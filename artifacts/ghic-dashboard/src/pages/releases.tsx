import React from 'react';
import { useListReleases, getListReleasesQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, StatusBadge , FeatureUnavailable } from "@/components/ui/swiss";
import { format } from "date-fns";

export default function Releases() {
  const { data, isLoading } = useListReleases({}, { query: { queryKey: getListReleasesQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Releases" description="Release health and rollback risk tracking" />
      <div className="px-6 pt-6">
        <FeatureUnavailable reason="Release data is not exposed as a list endpoint." />
      </div>
      <PageContent>
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Version</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Repository</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Date</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Health</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Regressions</th>
                <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Rollback Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading releases...</td></tr>
              ) : data?.items?.length ? (
                data.items.map((release) => (
                  <tr key={release.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold">{release.version}</td>
                    <td className="px-4 py-3 text-muted-foreground">{release.repositoryName}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{format(new Date(release.releaseDate), 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3"><StatusBadge status={release.health === 'good' ? 'success' : 'warning'} text={release.health} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{release.regressionCount}</td>
                    <td className="px-4 py-3"><StatusBadge status={release.rollbackRisk === 'high' ? 'danger' : 'neutral'} text={release.rollbackRisk} /></td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No releases found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageContent>
    </div>
  );
}
