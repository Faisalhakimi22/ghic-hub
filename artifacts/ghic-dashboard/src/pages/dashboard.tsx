import React from 'react';
import { useGetDashboardStats, getGetDashboardStatsQueryKey, useGetDashboardRecentActivity, getGetDashboardRecentActivityQueryKey, useGetDashboardAlerts, getGetDashboardAlertsQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid, StatusBadge } from "@/components/ui/swiss";
import { AlertCircle, Activity, Bug, Copy, Box, Cpu, FileWarning, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

function BentoCard({
  label,
  value,
  trend,
  icon: Icon,
  variant = "default",
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  trend?: number;
  icon?: React.ElementType;
  variant?: "default" | "dark" | "accent";
  className?: string;
}) {
  const base = "p-5 flex flex-col justify-between min-h-[148px] relative";
  const variants = {
    default: "bg-card border border-border text-foreground",
    dark:    "bg-foreground text-background border border-foreground",
    accent:  "bg-primary text-primary-foreground border border-primary",
  };
  const labelColor = {
    default: "text-muted-foreground",
    dark:    "text-background/60",
    accent:  "text-primary-foreground/70",
  };
  const trendColor = {
    default: (t: number) => t > 0 ? "text-destructive" : "text-primary",
    dark:    (_: number) => "text-background/80",
    accent:  (_: number) => "text-primary-foreground/90",
  };

  return (
    <div className={`${base} ${variants[variant]} ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-display tracking-widest uppercase ${labelColor[variant]}`}>{label}</span>
        {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${labelColor[variant]}`} />}
      </div>
      <div>
        <div className="font-display font-bold leading-none tracking-tight" style={{ fontSize: "clamp(2.25rem, 3.5vw, 3rem)" }}>
          {/* null means GHIC does not track this metric, or the call that
              would have fetched it failed. Rendering an em dash says so;
              a blank card reads as broken and a zero reads as measured. */}
          {value === null || value === undefined ? (
            <span className="opacity-40" title="Not tracked by GHIC">&mdash;</span>
          ) : (
            value
          )}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-[11px] font-bold ${trendColor[variant](trend)}`}>
            {trend > 0
              ? <ArrowUpRight className="w-3 h-3" />
              : <ArrowDownRight className="w-3 h-3" />}
            {trend > 0 ? "+" : ""}{trend}% vs last period
          </div>
        )}
      </div>
    </div>
  );
}

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
            {/* Row 1 — 4 primary KPIs */}
            <div className="grid grid-cols-4 gap-3">
              <BentoCard label="Health Score"    value={stats.repositoryHealthScore}   icon={Activity}     variant="default" />
              <BentoCard label="Risk Score"       value={stats.engineeringRiskScore}  icon={AlertCircle}  variant="dark"    />
              <BentoCard label="Open Issues"      value={stats.openIssues}  icon={Bug}          variant="accent"  />
              <BentoCard label="Analyses Today"   value={stats.aiAnalysesToday}                   icon={Cpu}          variant="default" />
            </div>
            {/* Row 2 — 5 secondary KPIs */}
            <div className="grid grid-cols-5 gap-3">
              <BentoCard label="Repos Connected"  value={stats.repositoriesConnected}             icon={Box}          variant="default" />
              <BentoCard label="Issues Today"     value={stats.issuesToday}                                           variant="dark"    />
              <BentoCard label="Resolved Today"   value={stats.resolvedToday}                                         variant="default" />
              <BentoCard label="Regressions"      value={stats.regressions}   icon={FileWarning}  variant="default" />
              <BentoCard label="Duplicates"       value={stats.duplicateCandidates}               icon={Copy}         variant="default" />
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
