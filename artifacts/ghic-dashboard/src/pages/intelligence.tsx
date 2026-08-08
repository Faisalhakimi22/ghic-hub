import React from "react";
import {
  getGetIntelligenceSummaryQueryKey,
  useGetIntelligenceSummary,
} from "@workspace/api-client-react";

import { FeatureState } from "@/components/feature-state";
import { PageContent, PageHeader } from "@/components/ui/swiss";

export default function Intelligence() {
  const query = useGetIntelligenceSummary(
    {},
    { query: { queryKey: getGetIntelligenceSummaryQueryKey() } },
  );
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Engineering Intelligence"
        description="Cross-repository engineering analysis"
      />
      <PageContent>
        <FeatureState
          query={query}
          title="Engineering Intelligence"
          fallbackReason="Engineering Intelligence is intentionally disabled; repository retrieval remains active."
        />
      </PageContent>
    </div>
  );
}
