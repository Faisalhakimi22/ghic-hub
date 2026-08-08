import React from "react";
import {
  getListCommitsQueryKey,
  useListCommits,
} from "@workspace/api-client-react";

import { FeatureState } from "@/components/feature-state";
import { PageContent, PageHeader } from "@/components/ui/swiss";

export default function Commits() {
  const query = useListCommits(
    {},
    { query: { queryKey: getListCommitsQueryKey() } },
  );
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Commit Intelligence"
        description="Persisted commit analysis"
      />
      <PageContent>
        <FeatureState
          query={query}
          title="Commit intelligence"
          fallbackReason="Commit list metadata is not persisted by the current repository index."
        />
      </PageContent>
    </div>
  );
}
