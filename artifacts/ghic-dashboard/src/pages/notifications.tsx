import React from 'react';
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, StatusBadge } from "@/components/ui/swiss";
import { format } from "date-fns";

export default function Notifications() {
  const { data, isLoading } = useListNotifications({}, { query: { queryKey: getListNotificationsQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Notifications" description="Operational alerts derived from live GHIC health" />
      <PageContent className="max-w-4xl">
        {isLoading ? (
          <div className="h-64 bg-muted animate-pulse border border-border" />
        ) : data?.items?.length ? (
          <div className="border border-border bg-card divide-y divide-border">
            {data.items.map((notif) => (
              <div key={notif.id} className={`p-4 flex flex-col gap-3 transition-colors ${!notif.read ? 'bg-primary/5' : ''}`}>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge 
                        status={notif.severity === 'critical' || notif.severity === 'high' ? 'danger' : notif.severity === 'medium' ? 'warning' : 'neutral'} 
                        text={notif.severity} 
                      />
                      <span className="font-bold">{notif.title}</span>
                      {!notif.read && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{notif.description}</p>
                    {notif.repositoryName && (
                      <span className="text-[10px] font-mono text-muted-foreground mt-1">Repo: {notif.repositoryName}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground font-mono">{format(new Date(notif.timestamp), 'MMM d, HH:mm')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground bg-card">No notifications. You're all caught up!</div>
        )}
      </PageContent>
    </div>
  );
}
