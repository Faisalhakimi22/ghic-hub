import React from 'react';
import { useGetDashboardStats, getGetDashboardStatsQueryKey, useGetDashboardRecentActivity, getGetDashboardRecentActivityQueryKey, useGetDashboardAlerts, getGetDashboardAlertsQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid, MetricCard, StatusBadge } from "@/components/ui/swiss";
import { GitPullRequest, AlertCircle, Activity, Bug, Copy, Box, Cpu, FileWarning, PlayCircle } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ query: { queryKey: getGetDashboardStatsQueryKey() } });
  const { data: activity, isLoading: activityLoading } = useGetDashboardRecentActivity({ query: { queryKey: getGetDashboardRecentActivityQueryKey() } });
  const { data: alerts, isLoading: alertsLoading } = useGetDashboardAlerts({ query: { queryKey: getGetDashboardAlertsQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader 
        title="Dashboard" 
        description="Engineering Intelligence Overview" 
      />
      
      <PageContent className="flex flex-col gap-8 w-full">
        {statsLoading ? (
          <div className="h-32 bg-muted animate-pulse border border-border" />
        ) : stats ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2">Key Metrics</h2>
            <div className="grid grid-cols-9 gap-0 border border-border">
              <MetricCard compact title="Health Score" value={stats.repositoryHealthScore} trend={2} icon={Activity} className="border-0 border-r border-border" />
              <MetricCard compact title="Risk Score" value={stats.engineeringRiskScore} trend={-5} icon={AlertCircle} className="border-0 border-r border-border" />
              <MetricCard compact title="Repos" value={stats.repositoriesConnected} icon={Box} className="border-0 border-r border-border" />
              <MetricCard compact title="Open Issues" value={stats.openIssues} trend={12} icon={Bug} className="border-0 border-r border-border" />
              <MetricCard compact title="Analyses Today" value={stats.aiAnalysesToday} icon={Cpu} className="border-0 border-r border-border" />
              <MetricCard compact title="Issues Today" value={stats.issuesToday} className="border-0 border-r border-border" />
              <MetricCard compact title="Resolved Today" value={stats.resolvedToday} className="border-0 border-r border-border" />
              <MetricCard compact title="Regressions" value={stats.regressions} trend={1} icon={FileWarning} className="border-0 border-r border-border" />
              <MetricCard compact title="Duplicates" value={stats.duplicateCandidates} icon={Copy} className="border-0" />
            </div>
          </div>
        ) : (
          <div className="p-8 border border-border text-center text-muted-foreground">Failed to load stats</div>
        )}

        <Grid cols={2} gap={8} className="mt-4">
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2 flex items-center justify-between">
              <span>Recent Activity</span>
              <Link href="/audit-logs" className="text-[10px] text-primary hover:underline">View All</Link>
            </h2>
            {activityLoading ? (
              <div className="h-64 bg-muted animate-pulse border border-border" />
            ) : activity && activity.length > 0 ? (
              <div className="border border-border bg-card flex flex-col">
                {activity.map((item, idx) => (
                  <div key={item.id} className={`p-4 flex flex-col gap-2 ${idx !== activity.length - 1 ? 'border-b border-border' : ''}`}>
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm">
                        <span className="font-bold mr-2">{item.actor}</span>
                        <span className="text-muted-foreground">{item.message}</span>
                      </p>
                      <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                        {format(new Date(item.timestamp), 'MMM d, HH:mm')}
                      </span>
                    </div>
                    {item.repositoryName && (
                      <div className="text-xs font-mono text-muted-foreground">
                        repo: {item.repositoryName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 border border-border text-center text-muted-foreground">No recent activity</div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2 flex items-center justify-between">
              <span>Active Alerts</span>
              <Link href="/notifications" className="text-[10px] text-primary hover:underline">View All</Link>
            </h2>
            {alertsLoading ? (
              <div className="h-64 bg-muted animate-pulse border border-border" />
            ) : alerts && alerts.length > 0 ? (
              <div className="border border-border bg-card flex flex-col">
                {alerts.map((alert, idx) => (
                  <div key={alert.id} className={`p-4 flex flex-col gap-2 ${idx !== alerts.length - 1 ? 'border-b border-border' : ''}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <StatusBadge 
                          status={alert.severity === 'critical' || alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'neutral'} 
                          text={alert.severity} 
                        />
                        <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">{alert.type}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {format(new Date(alert.timestamp), 'MMM d, HH:mm')}
                      </span>
                    </div>
                    <p className="text-sm font-bold mt-1">{alert.title}</p>
                    <p className="text-sm text-muted-foreground">{alert.description}</p>
                    {alert.repositoryName && (
                      <div className="text-xs font-mono text-muted-foreground mt-1">
                        repo: {alert.repositoryName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 border border-border text-center text-muted-foreground">No active alerts</div>
            )}
          </div>
        </Grid>
      </PageContent>
    </div>
  );
}
