import React from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  AlertCircle,
  BarChart2,
  Box,
  CheckSquare,
  Code,
  Copy,
  FolderGit2,
  GitCommit,
  GitPullRequest,
  History,
  LayoutDashboard,
  Menu,
  PlayCircle,
  Search,
  Settings,
  ShieldAlert,
  Users,
  Zap,
  Bell,
  Plug,
} from "lucide-react";
import { ThemeToggle } from "../theme-toggle";
import { useAuth } from "@/lib/auth";
import { LogOut } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  type DashboardAccount,
  useCurrentAccount,
  useCurrentOrganization,
} from "@/lib/account";

const NAVIGATION = [
  {
    group: "Overview",
    items: [
      { name: "Dashboard", path: "/", icon: LayoutDashboard },
      { name: "Search", path: "/search", icon: Search },
      { name: "Notifications", path: "/notifications", icon: Bell },
    ],
  },
  {
    group: "Code",
    items: [
      { name: "Repositories", path: "/repositories", icon: FolderGit2 },
      { name: "Commits", path: "/commits", icon: GitCommit },
      { name: "Pull Requests", path: "/pull-requests", icon: GitPullRequest },
      { name: "Releases", path: "/releases", icon: PlayCircle },
      { name: "Components", path: "/components", icon: Box },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { name: "Issues", path: "/issues", icon: AlertCircle },
      { name: "Intelligence", path: "/intelligence", icon: Zap },
      { name: "Analytics", path: "/analytics", icon: BarChart2 },
      { name: "Duplicates", path: "/duplicates", icon: Copy },
      { name: "Regressions", path: "/regressions", icon: History },
      { name: "Automation", path: "/automation", icon: CheckSquare },
    ],
  },
  {
    group: "System",
    items: [
      { name: "Integrations", path: "/integrations", icon: Plug },
      { name: "Organization", path: "/organization", icon: Users },
      { name: "Settings", path: "/settings", icon: Settings },
      { name: "Audit Logs", path: "/audit-logs", icon: ShieldAlert },
      { name: "System Health", path: "/system-health", icon: Activity },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileNavigationOpen, setMobileNavigationOpen] = React.useState(false);
  const account = useCurrentAccount();
  const organization = useCurrentOrganization();
  const { setTheme } = useTheme();

  React.useEffect(() => {
    if (account.data?.settings.theme) setTheme(account.data.settings.theme);
  }, [account.data?.settings.theme, setTheme]);

  React.useEffect(() => {
    setMobileNavigationOpen(false);
  }, [location]);

  return (
    <div className="h-svh w-full flex overflow-hidden bg-background text-foreground selection:bg-primary/30">
      {/* Sidebar Rail */}
      <aside className="hidden w-56 shrink-0 border-r border-border md:flex flex-col justify-between bg-card relative z-10">
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-6">
          <div className="px-4 mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/logo.png"
                alt="GHIC"
                className="h-6 w-6 shrink-0 object-contain"
              />
              <span className="font-display font-bold tracking-widest uppercase text-sm">
                GHIC
              </span>
            </div>
            <ThemeToggle />
          </div>

          <AccountStrip account={account.data} />

          <NavigationGroups location={location} />
        </div>

        <AccountFooter
          account={account.data}
          workspace={organization.data?.workspaceName}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-14 shrink-0 border-b border-border bg-card px-3 flex items-center justify-between md:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet
              open={mobileNavigationOpen}
              onOpenChange={setMobileNavigationOpen}
            >
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open navigation"
                  className="h-9 w-9 shrink-0 border border-border inline-flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Menu className="h-4 w-4" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[88vw] max-w-[320px] p-0 gap-0 bg-card flex flex-col"
              >
                <SheetTitle className="sr-only">GHIC navigation</SheetTitle>
                <div className="flex-1 min-h-0 overflow-y-auto py-4 flex flex-col gap-6">
                  <div className="px-4 pr-12 flex items-center gap-2">
                    <img
                      src="/logo.png"
                      alt="GHIC"
                      className="h-6 w-6 shrink-0 object-contain"
                    />
                    <span className="font-display font-bold tracking-widest uppercase text-sm">
                      GHIC
                    </span>
                  </div>
                  <AccountStrip account={account.data} />
                  <NavigationGroups
                    location={location}
                    onNavigate={() => setMobileNavigationOpen(false)}
                  />
                </div>
                <AccountFooter
                  account={account.data}
                  workspace={organization.data?.workspaceName}
                />
              </SheetContent>
            </Sheet>
            <img
              src="/logo.png"
              alt=""
              className="h-6 w-6 shrink-0 object-contain"
            />
            <span className="font-display font-bold tracking-widest uppercase text-sm truncate">
              GHIC
            </span>
          </div>
          <ThemeToggle />
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavigationGroups({
  location,
  onNavigate,
}: {
  location: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {NAVIGATION.map((group) => (
        <div key={group.group} className="flex flex-col">
          <span className="px-4 text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-2">
            {group.group}
          </span>
          <nav className="flex flex-col">
            {group.items.map((item) => {
              const isActive =
                item.path === "/"
                  ? location === "/"
                  : location.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={onNavigate}
                  className={`min-h-10 md:min-h-0 flex items-center gap-3 px-4 py-2 md:py-1.5 text-sm transition-colors ${
                    isActive
                      ? "text-primary bg-primary/5 border-r-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-r-2 border-transparent"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );
}

/**
 * Who is signed in, and the way out.
 *
 * A dashboard with no visible sign-out is a problem on any shared or
 * borrowed machine: the session persists across reloads by design, so
 * without this the only exit is clearing site data.
 */
function AccountStrip({ account }: { account?: DashboardAccount }) {
  const { user, signOut } = useAuth();
  if (!user) return null;
  const avatar =
    account?.settings.avatarUrl || account?.avatarUrl || user.photoURL;
  const label =
    account?.settings.displayName ||
    account?.name ||
    user.displayName ||
    user.email;
  return (
    <div className="px-4 flex items-center gap-2 min-w-0">
      {avatar ? (
        <img
          src={avatar}
          alt=""
          className="w-6 h-6 border border-border object-cover shrink-0"
        />
      ) : (
        <div className="w-6 h-6 border border-border bg-muted shrink-0" />
      )}
      <span
        className="text-xs truncate flex-1 min-w-0"
        title={user.email || undefined}
      >
        {label}
      </span>
      <button
        onClick={() => void signOut()}
        title="Sign out"
        aria-label="Sign out"
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}

function AccountFooter({
  account,
  workspace,
}: {
  account?: DashboardAccount;
  workspace?: string;
}) {
  const { user } = useAuth();
  if (!user) return null;
  const label =
    account?.settings.displayName ||
    account?.name ||
    user.displayName ||
    user.email ||
    "Signed in";
  const avatar =
    account?.settings.avatarUrl || account?.avatarUrl || user.photoURL;
  const initials = label
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="p-4 border-t border-border flex items-center gap-3 min-w-0">
      {avatar ? (
        <img
          src={avatar}
          alt=""
          className="w-8 h-8 border border-border object-cover shrink-0"
        />
      ) : (
        <div className="w-8 h-8 bg-muted flex items-center justify-center text-xs font-display font-bold shrink-0">
          {initials}
        </div>
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-bold leading-tight truncate">
          {label}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground leading-tight truncate">
          {workspace || "GHIC Workspace"}
          {account?.role ? ` | ${account.role}` : ""}
        </span>
      </div>
    </div>
  );
}
