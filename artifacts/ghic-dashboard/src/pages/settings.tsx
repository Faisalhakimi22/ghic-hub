import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ShieldAlert } from "lucide-react";

import { DataError } from "@/components/data-state";
import { useTheme } from "@/components/theme-provider";
import { PageContent, PageHeader, StatusBadge } from "@/components/ui/swiss";
import {
  type AccountSettings,
  type DashboardAccount,
  type DashboardOrganization,
  dashboardRequest,
  useCurrentAccount,
  useCurrentOrganization,
} from "@/lib/account";
import { useAuth } from "@/lib/auth";

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

type Member = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: DashboardAccount["role"];
};

const inputClass =
  "border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50";

export default function Settings() {
  const { getToken } = useAuth();
  const { setTheme } = useTheme();
  const queryClient = useQueryClient();
  const me = useCurrentAccount();
  const organization = useCurrentOrganization();
  const members = useQuery({
    queryKey: ["organization", "members"],
    queryFn: () =>
      dashboardRequest<{ members: Member[] }>("organization/members", getToken),
  });
  const [tab, setTab] = React.useState<"account" | "organization">("account");
  const [draft, setDraft] = React.useState<AccountSettings | null>(null);
  const [workspaceName, setWorkspaceName] = React.useState("");

  React.useEffect(() => {
    if (me.data) setDraft(me.data.settings);
  }, [me.data]);
  React.useEffect(() => {
    if (organization.data) setWorkspaceName(organization.data.workspaceName);
  }, [organization.data]);

  const saveAccount = useMutation({
    mutationFn: (settings: AccountSettings) =>
      dashboardRequest<DashboardAccount>("me/settings", getToken, {
        method: "PATCH",
        body: JSON.stringify(settings),
      }),
    onSuccess: (account) => {
      queryClient.setQueryData(["me"], account);
      setDraft(account.settings);
      setTheme(account.settings.theme);
    },
  });
  const saveOrganization = useMutation({
    mutationFn: (name: string) =>
      dashboardRequest<DashboardOrganization>("organization", getToken, {
        method: "PATCH",
        body: JSON.stringify({ workspaceName: name }),
      }),
    onSuccess: (updated) => queryClient.setQueryData(["organization"], updated),
  });
  const setRole = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: Member["role"] }) =>
      dashboardRequest<Member>(
        `organization/members/${encodeURIComponent(uid)}`,
        getToken,
        { method: "PATCH", body: JSON.stringify({ role }) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organization", "members"] }),
  });

  const isOwner = me.data?.role === "owner";
  const isAdmin = me.data?.role === "admin";
  const error =
    me.error ||
    organization.error ||
    members.error ||
    saveAccount.error ||
    saveOrganization.error ||
    setRole.error;
  const busy = saveAccount.isPending || saveOrganization.isPending;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Settings"
        description="Account and workspace preferences"
      >
        <button
          onClick={() =>
            tab === "account"
              ? draft && saveAccount.mutate(draft)
              : saveOrganization.mutate(workspaceName)
          }
          disabled={busy || !draft || (tab === "organization" && !isOwner)}
          className="px-6 py-2 bg-primary text-primary-foreground font-display tracking-widest uppercase text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save changes
        </button>
      </PageHeader>

      <div className="px-4 sm:px-6 lg:px-8 border-b border-border bg-card overflow-x-auto scrollbar-none">
        <div className="flex min-w-max">
          {(["account", "organization"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`px-4 py-3 text-xs font-display tracking-widest uppercase font-bold border-b-2 transition-colors ${tab === item ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <PageContent className="max-w-3xl flex flex-col gap-8">
        {error && <DataError error={error} title="Settings unavailable" />}

        {tab === "account" &&
          !error &&
          (me.isLoading || !me.data || !draft ? (
            <Loading />
          ) : (
            <>
              <Section title="Profile">
                <div className="flex items-center gap-4">
                  {(draft.avatarUrl || me.data.avatarUrl) && (
                    <img
                      src={draft.avatarUrl || me.data.avatarUrl || ""}
                      alt=""
                      className="w-12 h-12 border border-border object-cover"
                    />
                  )}
                  <div className="text-sm">
                    <div className="font-bold">{me.data.email}</div>
                    <div className="text-muted-foreground text-xs mt-1">
                      <StatusBadge status="neutral" text={me.data.role} />
                    </div>
                  </div>
                </div>
                <Field label="Display name">
                  <input
                    className={inputClass}
                    value={draft.displayName || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        displayName: event.target.value || null,
                      })
                    }
                  />
                </Field>
                <Field
                  label="Avatar URL"
                  hint="HTTPS only. Leave blank to use the authenticated GitHub avatar."
                >
                  <input
                    className={inputClass}
                    type="url"
                    value={draft.avatarUrl || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        avatarUrl: event.target.value || null,
                      })
                    }
                  />
                </Field>
              </Section>

              <Section title="Appearance and Locale">
                <Field label="Theme">
                  <select
                    className={inputClass}
                    value={draft.theme}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        theme: event.target.value as AccountSettings["theme"],
                      })
                    }
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </Field>
                <Field label="Timezone" hint="Used for dashboard dates.">
                  <select
                    className={inputClass}
                    value={draft.timezone}
                    onChange={(event) =>
                      setDraft({ ...draft, timezone: event.target.value })
                    }
                  >
                    {TIMEZONES.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone}
                      </option>
                    ))}
                  </select>
                </Field>
              </Section>

              <Section title="Notification Preferences">
                <p className="text-xs text-muted-foreground">
                  Preferences are persisted. Critical alert visibility is active
                  now; email and read-state notification delivery are not
                  enabled.
                </p>
                <Toggle
                  label="Critical service alerts"
                  checked={draft.notificationPreferences.criticalAlerts}
                  onChange={(checked) =>
                    setDraft({
                      ...draft,
                      notificationPreferences: {
                        ...draft.notificationPreferences,
                        criticalAlerts: checked,
                      },
                    })
                  }
                />
                <Toggle
                  label="Regression notifications"
                  checked={draft.notificationPreferences.regressions}
                  onChange={(checked) =>
                    setDraft({
                      ...draft,
                      notificationPreferences: {
                        ...draft.notificationPreferences,
                        regressions: checked,
                      },
                    })
                  }
                />
                <Toggle
                  label="Duplicate candidate notifications"
                  checked={draft.notificationPreferences.duplicates}
                  onChange={(checked) =>
                    setDraft({
                      ...draft,
                      notificationPreferences: {
                        ...draft.notificationPreferences,
                        duplicates: checked,
                      },
                    })
                  }
                />
                <Toggle
                  label="Product update email"
                  checked={draft.emailPreferences.productUpdates}
                  onChange={(checked) =>
                    setDraft({
                      ...draft,
                      emailPreferences: {
                        ...draft.emailPreferences,
                        productUpdates: checked,
                      },
                    })
                  }
                />
                <Toggle
                  label="Weekly digest email"
                  checked={draft.emailPreferences.weeklyDigest}
                  onChange={(checked) =>
                    setDraft({
                      ...draft,
                      emailPreferences: {
                        ...draft.emailPreferences,
                        weeklyDigest: checked,
                      },
                    })
                  }
                />
              </Section>
            </>
          ))}

        {tab === "organization" &&
          !error &&
          (organization.isLoading || members.isLoading || !organization.data ? (
            <Loading />
          ) : (
            <>
              {!isOwner && (
                <div className="border border-border bg-muted/40 p-4 flex items-start gap-3">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Only owners can rename the workspace. Your role is{" "}
                    <strong>{me.data?.role}</strong>.
                  </p>
                </div>
              )}
              <Section title="Workspace">
                <Field label="Workspace name">
                  <input
                    className={inputClass}
                    disabled={!isOwner}
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <Info label="Organization" value={organization.data.name} />
                  <Info
                    label="Current role"
                    value={me.data?.role || "Not recorded"}
                  />
                </div>
              </Section>
              <Section title="Members">
                <div className="divide-y divide-border">
                  {(members.data?.members || []).map((member) => {
                    const editable =
                      isOwner ||
                      (isAdmin && ["member", "viewer"].includes(member.role));
                    const roles: Member["role"][] = isOwner
                      ? ["owner", "admin", "member", "viewer"]
                      : ["member", "viewer"];
                    return (
                      <div
                        key={member.id}
                        className="py-3 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center sm:gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {member.avatarUrl ? (
                            <img
                              src={member.avatarUrl}
                              alt=""
                              className="w-7 h-7 border border-border object-cover"
                            />
                          ) : (
                            <div className="w-7 h-7 border border-border bg-muted" />
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate">
                              {member.name || member.email || member.id}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {member.email}
                            </div>
                          </div>
                        </div>
                        <select
                          className={inputClass}
                          disabled={!editable || setRole.isPending}
                          value={member.role}
                          onChange={(event) =>
                            setRole.mutate({
                              uid: member.id,
                              role: event.target.value as Member["role"],
                            })
                          }
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </Section>
              <p className="text-xs text-muted-foreground">
                Provider keys, model settings, repository indexing, Engineering
                Intelligence, and Automation are deployment configuration and
                cannot be changed from this dashboard.
              </p>
            </>
          ))}
      </PageContent>
    </div>
  );
}

function Loading() {
  return <div className="h-64 bg-muted animate-pulse border border-border" />;
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-card p-4 sm:p-6 flex flex-col gap-5">
      <h2 className="text-sm font-display tracking-widest uppercase font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-display tracking-widest uppercase font-bold text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 py-1.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-primary h-4 w-4"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
        {label}
      </div>
      <div className="font-mono mt-1">{value}</div>
    </div>
  );
}
