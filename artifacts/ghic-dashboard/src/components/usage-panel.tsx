import React from 'react';
import { AlertTriangle, FolderGit2, ScanSearch } from 'lucide-react';

import {
  formatPeriod,
  meterLevel,
  meterPercent,
  useUsage,
  type MeterLevel,
  type UsageMeter,
} from '@/lib/usage';
import { MARKETING_URL } from '@/lib/firebase';

const BAR: Record<MeterLevel, string> = {
  unlimited: 'bg-muted-foreground/30',
  ok: 'bg-foreground',
  warning: 'bg-amber-500',
  exhausted: 'bg-destructive',
};

function Meter({
  label,
  meter,
  icon: Icon,
  unit,
}: {
  label: string;
  meter: UsageMeter;
  icon: React.ElementType;
  unit: string;
}) {
  const level = meterLevel(meter);
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-display tracking-widest uppercase text-muted-foreground">
          <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
        </span>
        <span className="font-display text-sm font-bold tabular-nums">
          {meter.used.toLocaleString()}
          {/* Unlimited is not a number, so it is not rendered as one. A
              plan showing "12 / 0" because null became zero is the single
              worst thing this panel could say. */}
          <span className="text-muted-foreground font-normal">
            {meter.limit === null
              ? ' used'
              : ` / ${meter.limit.toLocaleString()}`}
          </span>
        </span>
      </div>
      <div className="h-1.5 w-full bg-muted overflow-hidden">
        <div
          className={`h-full ${BAR[level]}`}
          style={{ width: `${meterPercent(meter)}%` }}
        />
      </div>
      <span className="text-[11px] text-muted-foreground">
        {meter.limit === null
          ? `Unlimited ${unit} on this plan`
          : level === 'exhausted'
            ? `No ${unit} remaining`
            : `${(meter.remaining ?? 0).toLocaleString()} ${unit} remaining`}
      </span>
    </div>
  );
}

/**
 * Why the repository count stopped moving.
 *
 * Sits on the repositories page rather than only in the install callback,
 * because somebody who reached their limit last week and comes back to add
 * another repository has no other way to find out what happened.
 */
export function RepositoryLimitNotice() {
  const { data, isSuccess } = useUsage();
  if (!isSuccess || !data?.enforced) return null;
  if (meterLevel(data.repositories) !== 'exhausted') return null;

  return (
    <div className="border border-amber-500/40 bg-amber-500/5 p-4 flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-[10px] font-display tracking-widest uppercase font-bold">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        Repository limit reached
      </span>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
        The <strong>{data.plan}</strong> plan connects{' '}
        {data.repositories.limit} repositor
        {data.repositories.limit === 1 ? 'y' : 'ies'}, and{' '}
        {data.repositories.used} {data.repositories.used === 1 ? 'is' : 'are'}{' '}
        connected. Selecting more on GitHub will not add them here — GHIC
        keeps what you already have and does not take up the rest.
      </p>
      <a
        href={`${MARKETING_URL}/#pricing`}
        target="_blank"
        rel="noreferrer"
        className="self-start text-[11px] font-display tracking-widest uppercase font-bold underline underline-offset-4 hover:no-underline"
      >
        Compare plans
      </a>
    </div>
  );
}

/**
 * What this workspace has used, and what happens when it runs out.
 *
 * Deliberately not a gate. Everything here is reported by the server after
 * the fact; hiding a button in the browser has never stopped a request, and
 * the two places that actually refuse work are both server-side.
 */
export function UsagePanel() {
  const { data, isSuccess } = useUsage();

  // Nothing renders until the numbers are real. A panel that flashes
  // "0 / 500" while loading tells the customer they have used nothing,
  // which is a claim about their bill.
  if (!isSuccess || !data?.enforced) return null;

  const issues = meterLevel(data.issues);
  const repositories = meterLevel(data.repositories);
  const stalled = issues === 'exhausted';

  return (
    <div className="border border-border bg-card p-5 sm:p-6 flex flex-col gap-5 min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
            Plan usage
          </span>
          <h2 className="font-display font-bold tracking-tight uppercase text-lg">
            {data.plan}
          </h2>
        </div>
        <span className="text-[11px] text-muted-foreground pt-1">
          {formatPeriod(data.period)}
        </span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Meter
          label="Issues analysed"
          meter={data.issues}
          icon={ScanSearch}
          unit="analyses"
        />
        <Meter
          label="Repositories"
          meter={data.repositories}
          icon={FolderGit2}
          unit="repositories"
        />
      </div>

      {stalled && (
        <div className="flex items-start gap-2.5 border border-destructive/40 bg-destructive/5 p-3">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed min-w-0">
            <p className="font-bold">
              Analysis is paused for {formatPeriod(data.period)}.
            </p>
            <p className="text-muted-foreground">
              New issues are still received and nothing is lost. Analysis
              resumes automatically when the period resets, or immediately on
              a larger plan.
            </p>
          </div>
        </div>
      )}

      {(stalled || issues === 'warning' || repositories === 'exhausted') && (
        <a
          href={`${MARKETING_URL}/#pricing`}
          target="_blank"
          rel="noreferrer"
          className="self-start text-[11px] font-display tracking-widest uppercase font-bold underline underline-offset-4 hover:no-underline"
        >
          Compare plans
        </a>
      )}
    </div>
  );
}
