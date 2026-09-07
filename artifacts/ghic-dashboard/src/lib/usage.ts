/**
 * Plan usage for the signed-in workspace.
 *
 * Read-only, and read from the server. The browser is told what it has used
 * so it can say so; it is never the thing that decides whether a limit was
 * reached. Both enforcement points are server-side -- the repository gate in
 * `completeGitHubInstallation`, the issue gate in the Python backend -- and
 * neither consults anything this file returns.
 */
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

export interface UsageMeter {
  used: number;
  /** `null` means unlimited, and is not the same as `0`. */
  limit: number | null;
  remaining: number | null;
}

export interface WorkspaceUsage {
  plan: string;
  period: string;
  /** Verified by the server; an unreadable plan returns an error, not a plan. */
  enforced: boolean;
  issues: UsageMeter;
  repositories: UsageMeter;
  outcomes: Record<string, number>;
  /**
   * Prediction records still held for this period.
   *
   * Below `used` when a repository has been disconnected: uninstalling the
   * App deletes its analysis records but deliberately never touches usage,
   * because work already delivered is not refunded when somebody
   * disconnects a repository afterwards.
   */
  analysesRetained?: number;
}

export const usageKey = ['workspace', 'usage'] as const;

export function useUsage() {
  return useQuery<WorkspaceUsage>({
    queryKey: usageKey,
    queryFn: () => customFetch<WorkspaceUsage>('/api/usage'),
    // Usage moves when webhooks arrive, not when the user clicks. A minute
    // of staleness is invisible; polling harder would cost a database round
    // trip per dashboard tab per few seconds.
    staleTime: 60_000,
  });
}

export type MeterLevel = 'unlimited' | 'ok' | 'warning' | 'exhausted';

/**
 * How close to the limit a meter is.
 *
 * The warning threshold is deliberately high. Telling somebody at 50% that
 * they are running out is how a limit notice becomes something people learn
 * to ignore before it matters.
 */
export function meterLevel(meter: UsageMeter | undefined): MeterLevel {
  if (!meter || meter.limit === null) return 'unlimited';
  if (meter.used >= meter.limit) return 'exhausted';
  if (meter.used >= meter.limit * 0.8) return 'warning';
  return 'ok';
}

export function meterPercent(meter: UsageMeter | undefined): number {
  if (!meter || meter.limit === null || meter.limit <= 0) return 0;
  return Math.min(100, Math.round((meter.used / meter.limit) * 100));
}

/** Human-readable UTC month or day from the server's period key. */
export function formatPeriod(period: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period || '');
  if (day) {
    const date = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const match = /^(\d{4})-(\d{2})$/.exec(period || '');
  if (!match) return period || '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * How many analyses were counted but no longer have a record.
 *
 * Zero in the ordinary case, so the caller can stay silent. Only a purge
 * makes this non-zero, and it is the difference a customer would otherwise
 * read as "charged for something that never happened".
 */
export function removedAnalyses(usage: WorkspaceUsage | undefined): number {
  if (!usage || usage.analysesRetained == null) return 0;
  return Math.max(0, usage.issues.used - usage.analysesRetained);
}
