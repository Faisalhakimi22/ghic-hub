import React from 'react';
import { CreditCard, ExternalLink, TriangleAlert } from 'lucide-react';

import {
  billingNotice,
  formatDate,
  useBilling,
  useBillingPortal,
  useRefreshAfterCheckout,
  useStartCheckout,
} from '@/lib/billing';

/**
 * Plan and payment for the workspace.
 *
 * Nothing here is a gate. The buttons ask the server for a Stripe-hosted URL
 * and navigate; the plan moves only when Stripe's signed webhook arrives.
 * Hiding a button has never stopped a request, and the two places that
 * actually enforce a limit are both server-side.
 *
 * Reading this requires the admin role and changing it requires owner, so a
 * 403 is an ordinary outcome for most members rather than an error worth
 * shouting about.
 */
export function BillingPanel() {
  const { data, isSuccess, isError, error } = useBilling();
  const checkout = useStartCheckout();
  const portal = useBillingPortal();
  const refresh = useRefreshAfterCheckout();

  // Stripe redirects back the moment the card is charged, which can beat its
  // own webhook. Refetching on return is what closes that gap.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const forbidden = (error as { status?: number } | null)?.status === 403;
  if (isError && forbidden) return null;
  if (!isSuccess || !data) return null;

  const notice = billingNotice(data);
  const busy = checkout.isPending || portal.isPending;
  const failure = checkout.error || portal.error;

  return (
    <div className="border border-border bg-card p-5 sm:p-6 flex flex-col gap-5 min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
            Plan &amp; billing
          </span>
          <h2 className="font-display font-bold tracking-tight uppercase text-lg">
            {data.plan}
          </h2>
        </div>
        {data.subscribed && data.currentPeriodEnd && (
          <span className="text-[11px] text-muted-foreground pt-1">
            {data.cancelAtPeriodEnd ? 'Ends' : 'Renews'}{' '}
            {formatDate(data.currentPeriodEnd)}
          </span>
        )}
      </div>

      {notice && (
        <div className="flex items-start gap-2.5 border border-amber-500/40 bg-amber-500/5 p-3">
          <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed min-w-0">{notice}</p>
        </div>
      )}

      {failure && (
        <div className="flex items-start gap-2.5 border border-destructive/40 bg-destructive/5 p-3">
          <TriangleAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed min-w-0">
            {/* Deliberately vague: the provider's own message can name
                prices, accounts and internal state. */}
            Billing could not be reached. Nothing was charged — please try
            again.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {data.subscribed ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => portal.mutate()}
            className="inline-flex items-center gap-2 border-2 border-foreground px-4 py-2 text-[11px] font-display tracking-widest uppercase font-bold disabled:opacity-50"
          >
            <CreditCard className="w-3.5 h-3.5" />
            {portal.isPending ? 'Opening…' : 'Manage billing'}
            <ExternalLink className="w-3 h-3" />
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => checkout.mutate('pro')}
            className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2 text-[11px] font-display tracking-widest uppercase font-bold disabled:opacity-50"
          >
            <CreditCard className="w-3.5 h-3.5" />
            {checkout.isPending ? 'Opening…' : 'Upgrade to Pro'}
          </button>
        )}
        <span className="text-[11px] text-muted-foreground">
          {data.subscribed
            ? 'Change card, download invoices or cancel — handled by Stripe.'
            : 'Secure checkout hosted by Stripe. Cancel any time.'}
        </span>
      </div>

      {data.history.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-4">
          <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
            Plan history
          </span>
          <ul className="flex flex-col gap-1">
            {data.history.slice(0, 5).map((entry) => (
              <li
                key={entry.eventId}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="text-muted-foreground truncate">
                  {entry.fromPlan ?? 'none'} → <strong>{entry.toPlan}</strong>
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums text-[11px]">
                  {formatDate(entry.receivedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
