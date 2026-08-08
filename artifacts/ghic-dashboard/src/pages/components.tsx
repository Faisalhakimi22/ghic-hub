import React from "react";
import {
  getListComponentsQueryKey,
  useListComponents,
} from "@workspace/api-client-react";

import { FeatureState } from "@/components/feature-state";
import { PageContent, PageHeader } from "@/components/ui/swiss";

export default function Components() {
  const query = useListComponents(
    {},
    { query: { queryKey: getListComponentsQueryKey() } },
  );
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Components"
        description="Logical component health and fragility"
      />
      <PageContent>
        <FeatureState
          query={query}
          title="Component intelligence"
          fallbackReason="Component health requires Engineering Intelligence, which is intentionally disabled."
        />
      </PageContent>
    </div>
  );
}
