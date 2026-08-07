import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';
import { Shell } from '@/components/layout/Shell';

// Pages
import Dashboard from '@/pages/dashboard';
import Repositories from '@/pages/repositories';
import RepositoryDetail from '@/pages/repository-detail';
import Issues from '@/pages/issues';
import IssueDetail from '@/pages/issue-detail';
import Intelligence from '@/pages/intelligence';
import Analytics from '@/pages/analytics';
import Commits from '@/pages/commits';
import PullRequests from '@/pages/pull-requests';
import Releases from '@/pages/releases';
import Components from '@/pages/components';
import Duplicates from '@/pages/duplicates';
import Regressions from '@/pages/regressions';
import Automation from '@/pages/automation';
import Search from '@/pages/search';
import Notifications from '@/pages/notifications';
import Integrations from '@/pages/integrations';
import Organization from '@/pages/organization';
import Settings from '@/pages/settings';
import AuditLogs from '@/pages/audit-logs';
import SystemHealth from '@/pages/system-health';
import NotFound from '@/pages/not-found';

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

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="ghic-theme">
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
