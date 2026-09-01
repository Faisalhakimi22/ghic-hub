import React from 'react';
import { CheckCircle2, Github, Loader2, TriangleAlert } from 'lucide-react';

import {
  GITHUB_INITIATED_INSTALLATION,
  clearSetupParams,
  readApiErrorCode,
  readSetupParams,
  useCompleteInstallation,
  useCreateInstallationIntent,
  type InstallationResult,
} from '@/lib/github-connection';

/**
 * The post-install landing step.
 *
 * GitHub redirects to the App's Setup URL, the marketing site forwards the
 * query string here, and this is where those parameters stop being a
 * message to the user and start being a server-verified fact: it posts the
 * installation id to GHIC, which re-reads it from GitHub before writing
 * anything.
 *
 * It runs exactly once per page load. The parameters are stripped as soon
 * as the request is sent, so a refresh cannot replay the callback, and the
 * effect is guarded by a ref because React mounts effects twice in
 * development StrictMode and the second run would otherwise fire a second
 * request.
 */
export function GitHubSetupCallback({
  children,
}: {
  children: React.ReactNode;
}) {
  const [params] = React.useState(() => readSetupParams());
  const [done, setDone] = React.useState(!params.present);
  const [result, setResult] = React.useState<InstallationResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const complete = useCompleteInstallation();
  const createIntent = useCreateInstallationIntent();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (!params.present || started.current) return;
    started.current = true;

    clearSetupParams();
    complete
      .mutateAsync({
        installationId: params.installationId,
        setupAction: params.setupAction,
        state: params.state,
      })
      .then(setResult)
      .catch((caught: unknown) => {
        setErrorCode(readApiErrorCode(caught));
        setError(
          caught instanceof Error
            ? caught.message
            : 'GHIC could not verify the GitHub App installation.',
        );
      });
    // `complete` is a stable mutation object; the ref guard is what makes
    // this run once, not the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (done && !result) return <>{children}</>;

  if (!done && !result && !error) {
    return (
      <Panel
        icon={<Loader2 className="w-4 h-4 animate-spin" />}
        title="Connecting GitHub"
        body="GHIC is verifying the installation with GitHub and recording which repositories you selected."
      />
    );
  }

  // Installing from GitHub's own App page is a normal thing to do, and it
  // lands here without a state through no fault of the user. Refusing to link
  // is right; presenting it as a failure is not, because one click finishes
  // the job.
  if (errorCode === GITHUB_INITIATED_INSTALLATION) {
    return (
      <Panel
        icon={<Github className="w-4 h-4" />}
        title="Almost connected"
        body="GHIC is installed on GitHub. Linking it to your workspace takes one more step, so that only you can connect an installation you started."
        action={
          <div className="flex flex-col gap-3">
            <button
              disabled={createIntent.isPending}
              onClick={() => {
                createIntent
                  .mutateAsync()
                  .then(({ installUrl }) => {
                    window.location.assign(installUrl);
                  })
                  .catch((caught: unknown) => {
                    setErrorCode(null);
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : 'GHIC could not start the connection.',
                    );
                  });
              }}
              className="w-full bg-primary text-primary-foreground px-5 py-3 font-display tracking-widest uppercase text-xs font-bold hover:bg-primary/90 disabled:opacity-60"
            >
              {createIntent.isPending ? 'Connecting…' : 'Connect to workspace'}
            </button>
            <button
              onClick={() => {
                window.location.assign('/repositories');
              }}
              className="w-full border border-border px-5 py-3 font-display tracking-widest uppercase text-xs font-bold hover:bg-muted"
            >
              Not now
            </button>
          </div>
        }
      />
    );
  }

  if (error) {
    return (
      <Panel
        icon={<TriangleAlert className="w-4 h-4" />}
        title="GitHub connection failed"
        body={error}
        action={
          <button
            onClick={() => {
              window.location.assign('/repositories');
            }}
            className="w-full bg-primary text-primary-foreground px-5 py-3 font-display tracking-widest uppercase text-xs font-bold hover:bg-primary/90"
          >
            Continue to the hub
          </button>
        }
      />
    );
  }

  const pending = result?.setupAction === 'request';
  const cancelled = result?.cancelled === true;
  return (
    <Panel
      icon={
        pending || cancelled ? (
          <Github className="w-4 h-4" />
        ) : (
          <CheckCircle2 className="w-4 h-4" />
        )
      }
      title={
        pending
          ? 'Approval requested'
          : cancelled
            ? 'GitHub connection cancelled'
            : 'GitHub connected'
      }
      body={
        pending
          ? 'An organization owner has to approve the GHIC installation. Repositories appear here once they do.'
          : cancelled
            ? 'No GitHub installation was connected. You can retry whenever you are ready.'
            : `${result?.repositoryCount ?? 0} repositor${
                result?.repositoryCount === 1 ? 'y' : 'ies'
              } connected${
                result?.accountLogin ? ` from ${result.accountLogin}` : ''
              }. Indexing status appears as GHIC processes them.`
      }
      notice={
        result?.limitReached ? <PlanLimitNotice result={result} /> : null
      }
      action={
        <button
          onClick={() => {
            window.location.assign('/repositories');
          }}
          className="w-full bg-primary text-primary-foreground px-5 py-3 font-display tracking-widest uppercase text-xs font-bold hover:bg-primary/90"
        >
          View repositories
        </button>
      }
    />
  );
}

/**
 * What GitHub granted but the plan did not take up.
 *
 * Named rather than counted. "3 repositories were not connected" leaves the
 * user to work out which three, and the one they care about is exactly the
 * one they will assume was included.
 */
function PlanLimitNotice({ result }: { result: InstallationResult }) {
  const refused = result.refusedRepositories ?? [];
  if (!refused.length) return null;
  return (
    <div className="border border-amber-500/40 bg-amber-500/5 p-3 flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-[10px] font-display tracking-widest uppercase font-bold">
        <TriangleAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        Plan limit reached
      </span>
      <p className="text-xs text-muted-foreground leading-relaxed">
        The <strong>{result.plan}</strong> plan connects{' '}
        {result.repositoryLimit} repositor
        {result.repositoryLimit === 1 ? 'y' : 'ies'}. GHIC kept your existing
        selection and did not connect:
      </p>
      <ul className="text-xs font-mono flex flex-col gap-0.5 max-h-32 overflow-y-auto">
        {refused.map((name) => (
          <li key={name} className="truncate">
            {name}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Nothing was removed from GitHub. Connect them by upgrading, or by
        disconnecting a repository you no longer need.
      </p>
    </div>
  );
}

function Panel({
  icon,
  title,
  body,
  notice,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  notice?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-4 py-6 sm:px-6">
      <div className="w-full max-w-md border border-border bg-card p-5 sm:p-8 flex flex-col gap-5">
        <span className="flex items-center gap-2 text-[10px] font-display tracking-widest uppercase font-bold text-muted-foreground">
          {icon} GitHub App
        </span>
        <h1 className="text-2xl font-display font-bold tracking-tight uppercase">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        {notice}
        {action}
      </div>
    </div>
  );
}
