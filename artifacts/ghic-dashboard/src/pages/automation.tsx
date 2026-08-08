import React from "react";
import {
  getListAutomationSuggestionsQueryKey,
  useListAutomationSuggestions,
} from "@workspace/api-client-react";

import { FeatureState } from "@/components/feature-state";
import { PageContent, PageHeader } from "@/components/ui/swiss";

export default function Automation() {
  const query = useListAutomationSuggestions(
    {},
    { query: { queryKey: getListAutomationSuggestionsQueryKey() } },
  );
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Automation Center" description="Automation status" />
      <PageContent>
        <FeatureState
          query={query}
          title="Automation"
          fallbackReason="Automation is intentionally disabled in production."
        />
      </PageContent>
    </div>
  );
}
