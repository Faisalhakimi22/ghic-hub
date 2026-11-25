import { scrubBrowserEvent } from './monitoring-scrub';

/**
 * Browser error reporting. Off unless VITE_SENTRY_DSN is set at build time.
 *
 * The SDK is imported lazily into its own chunk (see vite.config.ts), so a
 * deploy without a DSN never downloads it, and one with a DSN does not
 * delay first paint for it. The cost is that an error thrown in the first
 * few hundred milliseconds, before the chunk arrives, is not reported.
 *
 * Errors only: no tracing, no session replay, no release-health sessions,
 * no breadcrumbs. What survives in a report is decided by
 * scrubBrowserEvent.
 */
export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  import('./sentry-client')
    .then(({ init }) => {
      init({
        dsn,
        environment: import.meta.env.MODE,
        sendDefaultPii: false,
        maxBreadcrumbs: 0,
        sendClientReports: false,
        integrations: (defaults) =>
          defaults.filter((integration) => integration.name !== 'BrowserSession'),
        beforeSend: (event) => scrubBrowserEvent(event),
      });
    })
    .catch(() => {
      // Monitoring must never break the dashboard.
    });
}
