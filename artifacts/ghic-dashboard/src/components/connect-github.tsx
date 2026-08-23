import React from 'react';
import { Github } from 'lucide-react';

import {
  useCreateInstallationIntent,
  useGitHubConnection,
} from '@/lib/github-connection';
import { useCurrentAccount } from '@/lib/account';

/**
 * The one place the product asks for a GitHub connection.
 *
 * It lived inside the repositories page, which meant a new account signed in,
 * landed on an empty dashboard, and had to guess that the way to start was a
 * nav item called Repositories. The panel itself was always fine; it was just
 * somewhere nobody looks first.
 */
export function ConnectGitHubPanel({
  configured,
  canManage,
  onConnect,
  connecting,
  error,
  heading = 'Connect GitHub',
  blurb = 'Install the GHIC GitHub App and choose which repositories it can read. GHIC records the selection you make on GitHub — there is nothing to type here.',
}: {
  configured: boolean;
  canManage: boolean;
  onConnect: () => void;
  connecting: boolean;
  error: string | null;
  heading?: string;
  blurb?: string;
}) {
  return (
    <div className="border border-border bg-card p-5 sm:p-8 flex flex-col items-start gap-4 min-w-0">
      <span className="flex items-center gap-2 text-[10px] font-display tracking-widest uppercase font-bold text-muted-foreground">
        <Github className="w-3.5 h-3.5" /> Not connected
      </span>
      <h2 className="text-xl font-display font-bold tracking-tight uppercase">
        {heading}
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
        {blurb}
      </p>
      {configured && canManage ? (
        <button
          onClick={onConnect}
          disabled={connecting}
          data-testid="connect-github"
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-3 font-display tracking-widest uppercase text-xs font-bold hover:bg-primary/90"
        >
          <Github className="w-4 h-4" />{' '}
          {connecting ? 'Opening GitHub...' : 'Install GHIC on GitHub'}
        </button>
      ) : configured ? (
        <p className="text-xs text-muted-foreground border border-border bg-muted/30 p-3 max-w-prose">
          Ask a workspace admin or owner to connect the GitHub App.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground border border-border bg-muted/30 p-3 max-w-prose">
          The GitHub App credentials are not configured on this deployment, so
          installation cannot be verified. Set <code>GHIC_APP_ID</code> and{' '}
          <code>GHIC_PRIVATE_KEY</code> to enable it.
        </p>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** True only when we positively know nothing is connected. */
export function useNothingConnected() {
  const connection = useGitHubConnection();
  const installations = connection.data?.installations ?? [];
  return {
    connection,
    // Deliberately not `!isLoading`: a failed connection request must not be
    // read as "no installation". That mistake is what made the repositories
    // page render no panel at all when the endpoint was returning 500.
    nothingConnected:
      connection.isSuccess &&
      !installations.some((installation) => installation.status === 'connected'),
  };
}

/** Self-contained panel: owns its own data and the install handoff. */
export function ConnectGitHub({
  heading,
  blurb,
}: {
  heading?: string;
  blurb?: string;
}) {
  const { connection } = useNothingConnected();
  const account = useCurrentAccount();
  const createIntent = useCreateInstallationIntent();

  return (
    <ConnectGitHubPanel
      configured={connection.data?.configured ?? false}
      canManage={['owner', 'admin'].includes(account.data?.role || '')}
      connecting={createIntent.isPending}
      error={createIntent.error?.message ?? null}
      heading={heading}
      blurb={blurb}
      onConnect={() => {
        void createIntent.mutateAsync().then(({ installUrl }) => {
          window.location.assign(installUrl);
        });
      }}
    />
  );
}
