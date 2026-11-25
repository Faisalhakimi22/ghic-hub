/**
 * What a browser error report may contain. Pure, so it is testable without
 * Sentry loaded.
 *
 * Kept: exception type, a shortened and redacted message, the stack (asset
 * URLs), and the page as a route template. Dropped: user, breadcrumbs
 * (clicks, console output and fetch URLs name repositories), request
 * headers, cookies, the query string, and `extra`. Issue and repository ids
 * in the path become `:id`, since a repository name is customer data.
 */

const MAX_MESSAGE = 300;

export function templatePath(pathname: string): string {
  const segments = String(pathname || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => (/^[a-z][a-z-]*$/.test(segment) ? segment : ':id'));
  return `/${segments.join('/')}`;
}

export function redactMessage(message: unknown): string {
  return String(message ?? '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b(?:gh[pousr]_|github_pat_|sk_(?:live|test)_|eyJ)[A-Za-z0-9._-]+/g, '[token]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]')
    .slice(0, MAX_MESSAGE);
}

function templateUrl(raw: unknown): string | undefined {
  try {
    const url = new URL(String(raw));
    return `${url.origin}${templatePath(url.pathname)}`;
  } catch {
    return undefined;
  }
}

type Scrubbable = {
  user?: unknown;
  extra?: unknown;
  breadcrumbs?: unknown;
  request?: { url?: string };
  exception?: { values?: Array<{ value?: string }> };
};

export function scrubBrowserEvent<T extends Scrubbable>(event: T): T {
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  if (event.request) {
    const url = templateUrl(event.request.url);
    event.request = url ? { url } : {};
  }
  for (const value of event.exception?.values ?? []) {
    if (value.value !== undefined) value.value = redactMessage(value.value);
  }
  return event;
}
