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
  /** False when the plan tables could not be read; the UI then shows nothing. */
  enforced: boolean;
  issues: UsageMeter;
  repositories: UsageMeter;
  outcomes: Record<string, number>;
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

/** "August 2026", from the `YYYY-MM` period key the server sends. */
export function formatPeriod(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period || '');
  if (!match) return period || '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
