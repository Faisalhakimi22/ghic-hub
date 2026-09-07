/**
 * What the workspace pays, and how to change it.
 *
 * Every mutation here returns a URL and nothing else. The browser never
 * upgrades anything -- it asks the server for a Stripe-hosted page and goes
 * there. The plan itself only moves when Stripe's signed webhook says money
 * changed hands, so closing the tab mid-checkout, or loading the success URL
 * by hand, grants nothing.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

import { usageKey } from './usage';

export interface BillingHistoryEntry {
  eventId: string;
  type: string;
  fromPlan: string | null;
  toPlan: string | null;
  receivedAt: string;
}

export interface WorkspaceBilling {
  /** The plan actually enforced. The subscription explains it, never sets it. */
  plan: string;
  subscribed: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
  history: BillingHistoryEntry[];
}

export const billingKey = ['workspace', 'billing'] as const;

export function useBilling(enabled = true) {
  return useQuery<WorkspaceBilling>({
    queryKey: billingKey,
    queryFn: () => customFetch<WorkspaceBilling>('/api/billing'),
    // Billing is read by admins and owners only; a member gets a 403 and
    // there is no point asking again on every mount.
    retry: false,
    staleTime: 60_000,
    enabled,
  });
}

function goTo(url: string | undefined) {
  if (!url) throw new Error('The billing provider did not return a URL.');
  window.location.assign(url);
}

/** Start a hosted checkout for a plan. Resolves by navigating away. */
export function useStartCheckout() {
  return useMutation({
    mutationFn: async (plan: string = 'pro') => {
      const result = await customFetch<{ url: string }>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan }),
        headers: { 'content-type': 'application/json' },
      });
      goTo(result.url);
      return result;
    },
  });
}

/** Open Stripe's billing portal, where a customer can cancel or change card. */
export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const result = await customFetch<{ url: string }>('/api/billing/portal', {
        method: 'POST',
      });
      goTo(result.url);
      return result;
    },
  });
}

/**
 * Refresh plan-dependent views after returning from checkout.
 *
 * Stripe redirects back the instant the payment is taken, which can be
 * before its webhook has reached us. The refetch is what closes that gap;
 * until it lands the customer briefly sees the plan they had, which is
 * honest -- it is what the server would still enforce at that moment.
 */
export function useRefreshAfterCheckout() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: billingKey });
    void client.invalidateQueries({ queryKey: usageKey });
  };
}

/** A subscription state a customer would want explained. */
export function billingNotice(billing: WorkspaceBilling | undefined): string | null {
  if (!billing?.subscribed) return null;
  if (billing.status === 'past_due') {
    return 'The last payment did not go through. Analysis continues while Stripe retries the card.';
  }
  if (billing.cancelAtPeriodEnd && billing.currentPeriodEnd) {
    return `This plan ends on ${formatDate(billing.currentPeriodEnd)} and will not renew.`;
  }
  if (billing.status === 'canceled') {
    return 'This subscription has ended. The workspace is on the free plan.';
  }
  return null;
}

export function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
