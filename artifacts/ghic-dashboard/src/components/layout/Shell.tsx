import React from 'react';
import { Link, useLocation } from 'wouter';
import { 
  Activity, 
  AlertCircle, 
  BarChart2, 
  Box, 
  CheckSquare, 
  Code, 
  Copy, 
  Cpu, 
  FolderGit2, 
  GitCommit, 
  GitPullRequest, 
  History, 
  LayoutDashboard, 
  PlayCircle, 
  Search, 
  Settings, 
  ShieldAlert, 
  Users, 
  Zap,
  Bell,
  Plug
} from 'lucide-react';
import { ThemeToggle } from '../theme-toggle';

const NAVIGATION = [
  { group: 'Overview', items: [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Search', path: '/search', icon: Search },
    { name: 'Notifications', path: '/notifications', icon: Bell },
  ]},
  { group: 'Code', items: [
    { name: 'Repositories', path: '/repositories', icon: FolderGit2 },
    { name: 'Commits', path: '/commits', icon: GitCommit },
    { name: 'Pull Requests', path: '/pull-requests', icon: GitPullRequest },
    { name: 'Releases', path: '/releases', icon: PlayCircle },
    { name: 'Components', path: '/components', icon: Box },
  ]},
  { group: 'Intelligence', items: [
    { name: 'Issues', path: '/issues', icon: AlertCircle },
    { name: 'Intelligence', path: '/intelligence', icon: Zap },
    { name: 'Analytics', path: '/analytics', icon: BarChart2 },
    { name: 'Duplicates', path: '/duplicates', icon: Copy },
    { name: 'Regressions', path: '/regressions', icon: History },
    { name: 'Automation', path: '/automation', icon: CheckSquare },
  ]},
  { group: 'System', items: [
    { name: 'Integrations', path: '/integrations', icon: Plug },
    { name: 'Organization', path: '/organization', icon: Users },
    { name: 'Settings', path: '/settings', icon: Settings },
    { name: 'Audit Logs', path: '/audit-logs', icon: ShieldAlert },
    { name: 'System Health', path: '/system-health', icon: Activity },
  ]}
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen w-full flex bg-background text-foreground selection:bg-primary/30">
      
      {/* Sidebar Rail */}
      <aside className="w-56 shrink-0 border-r border-border flex flex-col justify-between bg-card relative z-10">
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-6">
          <div className="px-4 mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <Cpu className="w-5 h-5" />
              <span className="font-display font-bold tracking-widest uppercase text-sm">GHIC</span>
            </div>
            <ThemeToggle />
          </div>

          <div className="flex flex-col gap-6">
            {NAVIGATION.map((group, idx) => (
              <div key={idx} className="flex flex-col">
                <span className="px-4 text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-2">
                  {group.group}
                </span>
                <nav className="flex flex-col">
                  {group.items.map(item => {
                    const isActive = item.path === '/' 
                      ? location === '/' 
                      : location.startsWith(item.path);

                    return (
                      <Link 
                        key={item.path} 
                        href={item.path}
                        className={`flex items-center gap-3 px-4 py-1.5 text-sm transition-colors ${
                          isActive 
                            ? 'text-primary bg-primary/5 border-r-2 border-primary' 
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-r-2 border-transparent'
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span className="font-medium">{item.name}</span>
                      </Link>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>
        </div>
        
        {/* User profile minimal */}
        <div className="p-4 border-t border-border flex items-center gap-3">
          <div className="w-8 h-8 bg-muted rounded-none flex items-center justify-center text-xs font-display font-bold">
            AD
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold leading-tight">Admin User</span>
            <span className="text-[10px] font-mono text-muted-foreground leading-tight">admin@ghic.io</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Navbar / Header could go here if needed, but we'll put page headers inside pages to match Swiss Grid */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

    </div>
  );
}
