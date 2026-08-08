import React from "react";
import {
  getListRegressionsQueryKey,
  useListRegressions,
} from "@workspace/api-client-react";

import { FeatureState } from "@/components/feature-state";
import { PageContent, PageHeader } from "@/components/ui/swiss";

export default function Regressions() {
  const query = useListRegressions(
    {},
    { query: { queryKey: getListRegressionsQueryKey() } },
  );
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Regression Center"
        description="Verified regression records"
      />
      <PageContent>
        <FeatureState
          query={query}
          title="Regression tracking"
          fallbackReason="GHIC does not persist verified regression records."
        />
      </PageContent>
    </div>
  );
}
