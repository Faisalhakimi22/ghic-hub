import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, PageContent, StatusBadge } from '@/components/ui/swiss';
import { useAuth } from '@/lib/auth';
import { Loader2, Save, ShieldAlert } from 'lucide-react';

/**
 * Account and workspace settings.
 *
 * Only settings GHIC actually persists appear here. Deployment
 * configuration — API tokens, thresholds, model choice, feature flags —
 * is set with environment variables on the server and is deliberately
 * absent: it is changed by someone with deploy access, not by an admin
 * role, and rendering it as an editable form would imply otherwise.
 *
 * Organisation fields are read-only unless the signed-in user is an
 * owner. The server enforces the same rule (requireRole in api/index.mjs);
 * this only avoids showing controls that would be rejected.
 */

const TIMEZONES = [
  'UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York',
  'America/Los_Angeles', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Tokyo',
  'Australia/Sydney',
];

async function api<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const { token, ...rest } = init || {};
  const res = await fetch(`/api/${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rest.headers || {}),
    },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

const inputClass =
  'border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50';

function Toggle({
  checked, onChange, label, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-3 py-1.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary h-4 w-4"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

export default function Settings() {
  const { user, getToken } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<'account' | 'organization'>('account');

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => api<any>('me', { token: (await getToken()) || undefined }),
  });
  const org = useQuery({
    queryKey: ['organization'],
    queryFn: async () => api<any>('organization', { token: (await getToken()) || undefined }),
  });
  const members = useQuery({
    queryKey: ['organization', 'members'],
    queryFn: async () =>
      api<any>('organization/members', { token: (await getToken()) || undefined }),
  });

  const [draft, setDraft] = React.useState<any>(null);
  const [orgDraft, setOrgDraft] = React.useState<any>(null);
  React.useEffect(() => { if (me.data && !draft) setDraft(me.data.settings); }, [me.data]);
  React.useEffect(() => { if (org.data && !orgDraft) setOrgDraft(org.data); }, [org.data]);

  const saveUser = useMutation({
    mutationFn: async (patch: any) =>
      api<any>('me/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
        token: (await getToken()) || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const saveOrg = useMutation({
    mutationFn: async (patch: any) =>
      api<any>('organization', {
        method: 'PATCH',
        body: JSON.stringify(patch),
        token: (await getToken()) || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organization'] }),
  });

  const setRole = useMutation({
    mutationFn: async ({ uid, role }: { uid: string; role: string }) =>
      api<any>(`organization/members/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
        token: (await getToken()) || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organization', 'members'] }),
  });

  const isOwner = me.data?.role === 'owner';
  const busy = saveUser.isPending || saveOrg.isPending;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Settings" description="Account and workspace preferences">
        <button
          onClick={() =>
            tab === 'account'
              ? saveUser.mutate(draft)
              : saveOrg.mutate(orgDraft)
          }
          disabled={busy || (tab === 'organization' && !isOwner)}
          className="px-6 py-2 bg-primary text-primary-foreground font-display tracking-widest uppercase text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save changes
        </button>
      </PageHeader>

      <div className="px-8 border-b border-border bg-card">
        <div className="flex">
          {(['account', 'organization'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-xs font-display tracking-widest uppercase font-bold border-b-2 transition-colors ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <PageContent className="max-w-3xl flex flex-col gap-8">
        {(saveUser.error || saveOrg.error || setRole.error) && (
          <div className="border border-destructive/40 bg-destructive/5 p-3 text-sm">
            {String((saveUser.error || saveOrg.error || setRole.error as any)?.message)}
          </div>
        )}

        {tab === 'account' && (
          me.isLoading || !draft ? (
            <div className="h-64 bg-muted animate-pulse border border-border" />
          ) : (
            <>
              <div className="border border-border bg-card p-6 flex flex-col gap-5">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold">Profile</h2>
                <div className="flex items-center gap-4">
                  {(draft.avatarUrl || me.data.avatarUrl) && (
                    <img
                      src={draft.avatarUrl || me.data.avatarUrl}
                      alt=""
                      className="w-12 h-12 border border-border object-cover"
                    />
                  )}
                  <div className="text-sm">
                    <div className="font-bold">{me.data.email}</div>
                    <div className="text-muted-foreground text-xs">
                      Role: <StatusBadge status="neutral" text={me.data.role} />
                    </div>
                  </div>
                </div>
                <Field label="Display name" hint="Shown in the dashboard. Defaults to your GitHub name.">
                  <input
                    className={inputClass}
                    value={draft.displayName ?? me.data.name ?? ''}
                    onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  />
                </Field>
                <Field label="Avatar URL" hint="Leave blank to use your GitHub avatar.">
                  <input
                    className={inputClass}
                    value={draft.avatarUrl ?? ''}
                    placeholder={me.data.avatarUrl || ''}
                    onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value || null })}
                  />
                </Field>
              </div>

              <div className="border border-border bg-card p-6 flex flex-col gap-5">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold">Appearance & locale</h2>
                <Field label="Theme">
                  <select
                    className={inputClass}
                    value={draft.theme ?? 'system'}
                    onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </Field>
                <Field label="Timezone" hint="Used for dates shown in the dashboard.">
                  <select
                    className={inputClass}
                    value={draft.timezone ?? 'UTC'}
                    onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                  >
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </Field>
              </div>

              <div className="border border-border bg-card p-6 flex flex-col gap-3">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold">Email</h2>
                <p className="text-xs text-muted-foreground">
                  Stored as your preference. GHIC does not currently send email, so nothing is
                  delivered until that ships.
                </p>
                <Toggle
                  label="Product updates"
                  checked={Boolean(draft.emailPreferences?.productUpdates)}
                  onChange={(v) => setDraft({ ...draft, emailPreferences: { ...draft.emailPreferences, productUpdates: v } })}
                />
                <Toggle
                  label="Weekly engineering digest"
                  checked={Boolean(draft.emailPreferences?.weeklyDigest)}
                  onChange={(v) => setDraft({ ...draft, emailPreferences: { ...draft.emailPreferences, weeklyDigest: v } })}
                />
              </div>

              <div className="border border-border bg-card p-6 flex flex-col gap-3">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold">Notifications</h2>
                <p className="text-xs text-muted-foreground">
                  Controls which alerts appear on your dashboard.
                </p>
                {([
                  ['criticalAlerts', 'Critical service alerts'],
                  ['regressions', 'Regression detections'],
                  ['duplicates', 'Duplicate candidates'],
                ] as const).map(([key, label]) => (
                  <Toggle
                    key={key}
                    label={label}
                    checked={Boolean(draft.notificationPreferences?.[key])}
                    onChange={(v) =>
                      setDraft({ ...draft, notificationPreferences: { ...draft.notificationPreferences, [key]: v } })
                    }
                  />
                ))}
              </div>
            </>
          )
        )}

        {tab === 'organization' && (
          org.isLoading || !orgDraft ? (
            <div className="h-64 bg-muted animate-pulse border border-border" />
          ) : (
            <>
              {!isOwner && (
                <div className="border border-border bg-muted/40 p-4 flex items-start gap-3">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Only owners can change workspace settings. You are signed in as{' '}
                    <strong>{me.data?.role}</strong>, so these are read-only.
                  </p>
                </div>
              )}

              <div className="border border-border bg-card p-6 flex flex-col gap-5">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold">Workspace</h2>
                <Field label="Workspace name">
                  <input
                    className={inputClass}
                    disabled={!isOwner}
                    value={orgDraft.workspaceName ?? ''}
                    onChange={(e) => setOrgDraft({ ...orgDraft, workspaceName: e.target.value })}
                  />
                </Field>
              </div>

              <div className="border border-border bg-card p-6 flex flex-col gap-3">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold">Members</h2>
                {members.isLoading ? (
                  <div className="h-24 bg-muted animate-pulse" />
                ) : (
                  <div className="divide-y divide-border">
                    {(members.data?.members || []).map((m: any) => (
                      <div key={m.id} className="py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {m.avatarUrl && <img src={m.avatarUrl} alt="" className="w-7 h-7 border border-border" />}
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate">{m.name || m.email || m.id}</div>
                            <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                          </div>
                        </div>
                        <select
                          className={inputClass}
                          disabled={!isOwner || setRole.isPending}
                          value={m.role}
                          onChange={(e) => setRole.mutate({ uid: m.id, role: e.target.value })}
                        >
                          {['owner', 'admin', 'member', 'viewer'].map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-border bg-card p-6 flex flex-col gap-5">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold">Repository preferences</h2>
                <Toggle
                  label="Queue indexing automatically for new repositories"
                  disabled={!isOwner}
                  checked={Boolean(orgDraft.repositoryPreferences?.autoIndex)}
                  onChange={(v) =>
                    setOrgDraft({ ...orgDraft, repositoryPreferences: { ...orgDraft.repositoryPreferences, autoIndex: v } })
                  }
                />
                <Field
                  label="Default actionability threshold"
                  hint="Preference only. The live threshold is set server-side per deployment."
                >
                  <input
                    type="number" min={0} max={1} step={0.05}
                    className={inputClass}
                    disabled={!isOwner}
                    value={orgDraft.repositoryPreferences?.defaultThreshold ?? 0.5}
                    onChange={(e) =>
                      setOrgDraft({
                        ...orgDraft,
                        repositoryPreferences: {
                          ...orgDraft.repositoryPreferences,
                          defaultThreshold: Number(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
              </div>

              <div className="border border-border bg-card p-6 flex flex-col gap-5">
                <h2 className="text-sm font-display tracking-widest uppercase font-bold">AI & comments</h2>
                <Toggle
                  label="AI analysis on new issues"
                  disabled={!isOwner}
                  checked={Boolean(orgDraft.aiPreferences?.analysisEnabled)}
                  onChange={(v) => setOrgDraft({ ...orgDraft, aiPreferences: { ...orgDraft.aiPreferences, analysisEnabled: v } })}
                />
                <Toggle
                  label="Include repository code evidence"
                  disabled={!isOwner}
                  checked={Boolean(orgDraft.aiPreferences?.repositoryEvidence)}
                  onChange={(v) => setOrgDraft({ ...orgDraft, aiPreferences: { ...orgDraft.aiPreferences, repositoryEvidence: v } })}
                />
                <Field
                  label="Default comment behaviour"
                  hint="Preference only. GHIC never applies labels or closes issues on its own."
                >
                  <select
                    className={inputClass}
                    disabled={!isOwner}
                    value={orgDraft.defaultCommentBehaviour ?? 'comment_only'}
                    onChange={(e) => setOrgDraft({ ...orgDraft, defaultCommentBehaviour: e.target.value })}
                  >
                    <option value="comment_only">Comment only</option>
                    <option value="comment_and_suggest_labels">Comment and suggest labels</option>
                    <option value="silent">Analyse silently (no comment)</option>
                  </select>
                </Field>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Deployment configuration — API tokens, provider keys, model selection and
                feature flags — is set with environment variables on the server and cannot be
                changed from this dashboard by any role.
              </p>
            </>
          )
        )}
      </PageContent>
    </div>
  );
}
