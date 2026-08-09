import { CheckCircle2, Github, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { MARKETING_URL } from '@/lib/firebase';

function gitHubSetupState() {
  const params = new URLSearchParams(window.location.search);
  const fromSetup = params.get('source') === 'github_app_setup';
  const installationId = params.get('installation_id');
  const setupAction = params.get('setup_action');

  return {
    active: fromSetup || Boolean(installationId || setupAction),
    installationId,
    setupAction,
  };
}

/**
 * Sign-in gate for the dashboard.
 *
 * Rendered in place of the app shell when there is no session, rather
 * than as a route the router can be talked out of visiting. See
 * ProtectedApp in App.tsx: the authenticated tree is never mounted for a
 * signed-out visitor, so no page can leak data by rendering before a
 * redirect fires.
 */
export default function Login() {
  const { error, configured, signInWithGitHub, loading, clearError } = useAuth();
  const setup = gitHubSetupState();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-md border border-border bg-card p-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <img
            src="/logo.png"
            alt="GHIC"
            className="h-10 w-10 object-contain"
          />
          <span className="text-[10px] font-display tracking-widest uppercase font-bold text-muted-foreground">
            GHIC Dashboard
          </span>
          <h1 className="text-2xl font-display font-bold tracking-tight uppercase">
            {setup.active ? 'GitHub app installed' : 'Sign in'}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {setup.active
              ? 'GHIC is connected to GitHub. Sign in with the same GitHub account to open the hub.'
              : 'This dashboard shows live repository and triage data. Sign in with the GitHub account you use for GHIC.'}
          </p>
        </div>

        {setup.active && (
          <div className="border border-emerald-500/40 bg-emerald-500/5 p-4 flex flex-col gap-2">
            <span className="flex items-center gap-2 text-[10px] font-display tracking-widest uppercase font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> Installation complete
            </span>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Repository access is installed. One GitHub sign-in creates the browser session
              for this dashboard.
            </p>
          </div>
        )}

        {!configured && (
          <div className="border border-border bg-muted/40 p-4 flex flex-col gap-2">
            <span className="flex items-center gap-2 text-[10px] font-display tracking-widest uppercase font-bold">
              <TriangleAlert className="w-3.5 h-3.5" /> Not configured
            </span>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Firebase credentials are not set on this deployment. Set the{' '}
              <code className="font-mono text-xs">VITE_FIREBASE_*</code> variables to enable
              sign-in.
            </p>
          </div>
        )}

        {error && (
          <div className="border border-destructive/40 bg-destructive/5 p-4 flex flex-col gap-2" role="alert">
            <p className="text-sm leading-relaxed">{error}</p>
            <button
              onClick={clearError}
              className="self-start text-[10px] font-display tracking-widest uppercase font-bold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <button
          onClick={() => void signInWithGitHub()}
          disabled={!configured || loading}
          data-testid="dashboard-signin"
          className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground px-5 py-3 font-display tracking-widest uppercase text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Checking session…
            </>
          ) : (
            <>
              <Github className="w-4 h-4" /> {setup.active ? 'Open hub with GitHub' : 'Continue with GitHub'}
            </>
          )}
        </button>

        <p className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            GHIC reads your public profile and email only. Repository access is granted
            separately when you install the GitHub App.
          </span>
        </p>

        <a
          href={MARKETING_URL}
          className="text-[10px] font-display tracking-widest uppercase font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to ghic
        </a>
      </div>
    </div>
  );
}
