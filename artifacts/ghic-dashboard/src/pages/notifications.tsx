import React from "react";
import {
  getListNotificationsQueryKey,
  useListNotifications,
} from "@workspace/api-client-react";

import { FeatureState } from "@/components/feature-state";
import { PageContent, PageHeader } from "@/components/ui/swiss";

export default function Notifications() {
  const query = useListNotifications(
    {},
    { query: { queryKey: getListNotificationsQueryKey() } },
  );
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Notifications"
        description="Persisted notification feed"
      />
      <PageContent className="max-w-4xl">
        <FeatureState
          query={query}
          title="Notifications"
          fallbackReason="GHIC has no persisted notification or read-state feed. Current operational alerts remain available on the dashboard."
        />
      </PageContent>
    </div>
  );
}
