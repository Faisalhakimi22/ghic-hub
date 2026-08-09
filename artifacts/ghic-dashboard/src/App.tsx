import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { ThemeProvider } from "@/components/theme-provider";
import { Shell } from "@/components/layout/Shell";
import { AuthProvider, useAuth } from "@/lib/auth";
import Login from "@/pages/login";
import { DataError } from "@/components/data-state";
import { GitHubSetupCallback } from "@/components/github-setup-callback";
import { useCurrentAccount } from "@/lib/account";

// Pages
import Dashboard from "@/pages/dashboard";
import Repositories from "@/pages/repositories";
import RepositoryDetail from "@/pages/repository-detail";
import Issues from "@/pages/issues";
import IssueDetail from "@/pages/issue-detail";
import Intelligence from "@/pages/intelligence";
import Analytics from "@/pages/analytics";
import Commits from "@/pages/commits";
import PullRequests from "@/pages/pull-requests";
import Releases from "@/pages/releases";
import Components from "@/pages/components";
import Duplicates from "@/pages/duplicates";
import Regressions from "@/pages/regressions";
import Automation from "@/pages/automation";
import Search from "@/pages/search";
import Notifications from "@/pages/notifications";
import Integrations from "@/pages/integrations";
import Organization from "@/pages/organization";
import Settings from "@/pages/settings";
import AuditLogs from "@/pages/audit-logs";
import SystemHealth from "@/pages/system-health";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />

        <Route path="/repositories" component={Repositories} />
        <Route path="/repositories/:id" component={RepositoryDetail} />

        <Route path="/issues" component={Issues} />
        <Route path="/issues/:id" component={IssueDetail} />

        <Route path="/intelligence" component={Intelligence} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/commits" component={Commits} />
        <Route path="/pull-requests" component={PullRequests} />
        <Route path="/releases" component={Releases} />
        <Route path="/components" component={Components} />
        <Route path="/duplicates" component={Duplicates} />
        <Route path="/regressions" component={Regressions} />
        <Route path="/automation" component={Automation} />
        <Route path="/search" component={Search} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/integrations" component={Integrations} />
        <Route path="/organization" component={Organization} />
        <Route path="/settings" component={Settings} />
        <Route path="/audit-logs" component={AuditLogs} />
        <Route path="/system-health" component={SystemHealth} />

        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

/**
 * The gate.
 *
 * Deliberately swaps the whole tree rather than redirecting from inside
 * the shell: a signed-out visitor never mounts Router, so no page mounts,
 * no query fires, and nothing can render data in the frame before a
 * redirect takes effect. Route-level guards leak exactly that way.
 *
 * The API is authenticated independently (see api/_lib/auth.mjs) — this
 * gate is for the experience, not the security boundary. Removing it
 * would expose no data, because every endpoint verifies its own token.
 */
function ProtectedApp() {
  const { user, loading, signOut } = useAuth();
  const account = useCurrentAccount();

  if (loading || (user && account.isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-pulse bg-muted"
          aria-label="Loading session"
        />
      </div>
    );
  }

  if (!user) return <Login />;

  if (account.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-xl flex flex-col gap-3">
          <DataError
            error={account.error}
            title="Workspace access unavailable"
          />
          <button
            onClick={() => void signOut()}
            className="self-end px-4 py-2 border border-border bg-card text-xs font-display tracking-widest uppercase font-bold hover:bg-muted"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Mounted inside the gate so the installation callback is posted with a
  // verified session. GitHub redirects to the hub root, so this has to sit
  // above the router rather than on any one page.
  return (
    <GitHubSetupCallback>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </GitHubSetupCallback>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="ghic-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ProtectedApp />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
