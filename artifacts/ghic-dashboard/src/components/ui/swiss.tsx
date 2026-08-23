import React from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({ title, description, children, className }: { title: React.ReactNode, description?: React.ReactNode, children?: React.ReactNode, className?: string }) {
  return (
    <div className={cn("px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 border-b border-border bg-card flex flex-col md:flex-row md:items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-1 min-w-0">
        <h1 className="text-xl sm:text-2xl font-display font-bold tracking-wide uppercase text-foreground break-words [overflow-wrap:anywhere]">{title}</h1>
        {description && <p className="text-sm text-muted-foreground break-words">{description}</p>}
      </div>
      {children && (
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          {children}
        </div>
      )}
    </div>
  );
}

export function PageContent({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto", className)}>
      {children}
    </div>
  );
}

export function Grid({ children, cols = 12, gap = 6, className }: { children: React.ReactNode, cols?: number, gap?: number, className?: string }) {
  const columnClasses: Record<number, string> = {
    2: 'xl:grid-cols-2',
    3: 'xl:grid-cols-3',
    4: 'xl:grid-cols-4',
    5: 'xl:grid-cols-5',
    12: 'xl:grid-cols-12',
  };
  const gapClasses: Record<number, string> = {
    2: 'gap-2',
    3: 'gap-3',
    4: 'gap-4',
    6: 'gap-6',
    8: 'gap-8',
  };
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2', columnClasses[cols] || columnClasses[12], gapClasses[gap] || gapClasses[6], className)}>
      {children}
    </div>
  );
}

export function MetricCard({ 
  title, 
  value, 
  trend, 
  trendLabel, 
  icon: Icon,
  compact,
  className 
}: { 
  title: string, 
  value: React.ReactNode, 
  trend?: number, 
  trendLabel?: string, 
  icon?: React.ElementType,
  compact?: boolean,
  className?: string
}) {
  if (compact) {
    return (
      <div className={cn("px-3 py-2.5 border border-border bg-card flex flex-col gap-1 min-w-0", className)}>
        <div className="flex justify-between items-center gap-1 text-muted-foreground">
          <span className="text-[10px] font-display tracking-widest uppercase truncate">{title}</span>
          {Icon && <Icon className="w-3 h-3 shrink-0" />}
        </div>
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-xl font-display font-bold tracking-tight text-foreground leading-tight min-w-0 break-words [overflow-wrap:anywhere]">{value}</span>
          {trend !== undefined && (
            <span className={cn("text-[10px] font-bold", trend > 0 ? "text-destructive" : "text-primary")}>
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("p-4 sm:p-5 border border-border bg-card flex flex-col gap-3 min-w-0", className)}>
      <div className="flex justify-between items-center text-muted-foreground">
        <span className="text-xs font-display tracking-widest uppercase">{title}</span>
        {Icon && <Icon className="w-4 h-4" />}
      </div>
      <div className="flex items-end gap-3 min-w-0">
        <span className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground leading-none min-w-0 break-words [overflow-wrap:anywhere]">{value}</span>
        {trend !== undefined && (
          <div className="flex flex-col mb-0.5">
            <span className={cn("text-xs font-bold", trend > 0 ? "text-destructive" : "text-primary")}>
              {trend > 0 ? '+' : ''}{trend}%
            </span>
            {trendLabel && <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{trendLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusBadge({ status, text }: { status: 'success' | 'warning' | 'danger' | 'neutral', text: string }) {
  const colors = {
    success: 'bg-primary text-primary-foreground',
    warning: 'bg-amber-500 text-white',
    danger: 'bg-destructive text-destructive-foreground',
    neutral: 'bg-muted text-muted-foreground'
  };

  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 px-1.5 py-0.5 text-[10px] font-display tracking-widest uppercase font-bold border border-border whitespace-normal break-words", colors[status] || colors.neutral)}>
      {text}
    </span>
  );
}

/** Shown on pages that do not have a durable GHIC data source yet. */
export function FeatureUnavailable({ reason }: { reason?: string }) {
  return (
    <div className="border border-dashed border-border bg-muted/30 p-4 sm:p-6 flex flex-col gap-2">
      <span className="text-[10px] font-display tracking-widest uppercase font-bold text-muted-foreground">
        Not available yet
      </span>
      <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
        {reason ||
          'This view has no data source in GHIC yet. It is intentionally empty rather than showing sample data.'}
      </p>
    </div>
  );
}
