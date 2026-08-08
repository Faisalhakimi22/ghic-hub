import React from "react";
import {
  getListPullRequestsQueryKey,
  useListPullRequests,
} from "@workspace/api-client-react";

import { FeatureState } from "@/components/feature-state";
import { PageContent, PageHeader } from "@/components/ui/swiss";

export default function PullRequests() {
  const query = useListPullRequests(
    {},
    { query: { queryKey: getListPullRequestsQueryKey() } },
  );
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Pull Requests"
        description="Persisted pull request analysis"
      />
      <PageContent>
        <FeatureState
          query={query}
          title="Pull request intelligence"
          fallbackReason="Pull request list metadata is not persisted by the current repository index."
        />
      </PageContent>
    </div>
  );
}
