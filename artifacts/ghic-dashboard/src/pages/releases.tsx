import React from "react";
import {
  getListReleasesQueryKey,
  useListReleases,
} from "@workspace/api-client-react";

import { FeatureState } from "@/components/feature-state";
import { PageContent, PageHeader } from "@/components/ui/swiss";

export default function Releases() {
  const query = useListReleases(
    {},
    { query: { queryKey: getListReleasesQueryKey() } },
  );
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Releases" description="Persisted release analysis" />
      <PageContent>
        <FeatureState
          query={query}
          title="Release intelligence"
          fallbackReason="Release list metadata is not persisted by the current repository index."
        />
      </PageContent>
    </div>
  );
}
