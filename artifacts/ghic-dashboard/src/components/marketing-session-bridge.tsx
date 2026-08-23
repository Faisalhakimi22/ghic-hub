import { useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { MARKETING_URL } from '@/lib/firebase';

const MESSAGE_TYPE = 'ghic:hub-connection';
const POLL_INTERVAL_MS = 15_000;

type ConnectionResponse = {
  installations?: Array<{ status?: string }>;
};

function allowedParentOrigin(): string | null {
  const requested = new URLSearchParams(window.location.search).get('origin');
  if (!requested) return null;

  const allowed = new Set([new URL(MARKETING_URL).origin]);
  if (import.meta.env.DEV) {
    allowed.add('http://localhost:5173');
    allowed.add('http://127.0.0.1:5173');
  }

  return allowed.has(requested) ? requested : null;
}

/**
 * Reports the Hub-origin session and persisted GitHub connection state to
 * the marketing site. The message deliberately contains no account,
 * workspace, installation, or repository identifiers.
 */
export function MarketingSessionBridge() {
  const { user, loading, getToken } = useAuth();

  const publish = useCallback((authenticated: boolean, connected: boolean) => {
    const targetOrigin = allowedParentOrigin();
    if (!targetOrigin || window.parent === window) return;
    window.parent.postMessage(
      { type: MESSAGE_TYPE, version: 1, authenticated, connected },
      targetOrigin,
    );
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      publish(false, false);
      return;
    }

    let cancelled = false;

    const checkConnection = async () => {
      const token = await getToken();
      if (cancelled) return;
      if (!token) {
        publish(false, false);
        return;
      }

      try {
        const response = await fetch('/api/github/connection', {
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          publish(response.status !== 401, false);
          return;
        }

        const connection = (await response.json()) as ConnectionResponse;
        const connected = Boolean(
          connection.installations?.some(
            (installation) => installation.status === 'connected',
          ),
        );
        if (!cancelled) publish(true, connected);
      } catch {
        if (!cancelled) publish(true, false);
      }
    };

    void checkConnection();
    const interval = window.setInterval(checkConnection, POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkConnection();
    };
    window.addEventListener('focus', checkConnection);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', checkConnection);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [getToken, loading, publish, user]);

  return null;
}
