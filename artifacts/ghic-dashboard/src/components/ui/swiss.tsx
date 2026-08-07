import React from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({ title, description, children, className }: { title: React.ReactNode, description?: React.ReactNode, children?: React.ReactNode, className?: string }) {
  return (
    <div className={cn("px-8 py-6 border-b border-border bg-card flex flex-col md:flex-row md:items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-display font-bold tracking-wide uppercase text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && (
        <div className="flex items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

export function PageContent({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("p-8 max-w-[1600px] mx-auto", className)}>
      {children}
    </div>
  );
}

export function Grid({ children, cols = 12, gap = 6, className }: { children: React.ReactNode, cols?: number, gap?: number, className?: string }) {
  return (
    <div className={cn(`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-${cols} gap-${gap}`, className)}>
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
  className 
}: { 
  title: string, 
  value: React.ReactNode, 
  trend?: number, 
  trendLabel?: string, 
  icon?: React.ElementType,
  className?: string
}) {
  return (
    <div className={cn("p-5 border border-border bg-card flex flex-col gap-3", className)}>
      <div className="flex justify-between items-center text-muted-foreground">
        <span className="text-xs font-display tracking-widest uppercase">{title}</span>
        {Icon && <Icon className="w-4 h-4" />}
      </div>
      <div className="flex items-end gap-3">
        <span className="text-4xl font-display font-bold tracking-tight text-foreground leading-none">{value}</span>
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
    <span className={cn("inline-flex items-center gap-1.5 px-1.5 py-0.5 text-[10px] font-display tracking-widest uppercase font-bold border border-border", colors[status] || colors.neutral)}>
      {text}
    </span>
  );
}
