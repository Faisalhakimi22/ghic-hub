import React from 'react';
import { useGetOrganization, getGetOrganizationQueryKey, useListMembers, getListMembersQueryKey } from "@workspace/api-client-react";
import { PageHeader, PageContent, Grid, MetricCard, StatusBadge , FeatureUnavailable } from "@/components/ui/swiss";
import { Users, Box, Shield } from "lucide-react";
import { format } from "date-fns";

export default function Organization() {
  const { data: org, isLoading: orgLoading } = useGetOrganization({ query: { queryKey: getGetOrganizationQueryKey() } });
  const { data: members, isLoading: membersLoading } = useListMembers({}, { query: { queryKey: getListMembersQueryKey() } });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Organization" description="Manage team members and roles" />
      <div className="px-6 pt-6">
        <FeatureUnavailable reason="GHIC has no multi-tenant organisation model — it authenticates with a single shared token." />
      </div>
      <PageContent className="flex flex-col gap-8">
        
        {orgLoading ? (
          <div className="h-32 bg-muted animate-pulse border border-border" />
        ) : org ? (
          <Grid cols={3}>
            <MetricCard title="Organization Plan" value={org.plan.toUpperCase()} icon={Shield} />
            <MetricCard title="Total Members" value={org.memberCount} icon={Users} />
            <MetricCard title="Repositories" value={org.repositoryCount} icon={Box} />
          </Grid>
        ) : null}

        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2">Members</h2>
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">User</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Email</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Role</th>
                  <th className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {membersLoading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading members...</td></tr>
                ) : members?.items?.length ? (
                  members.items.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-muted flex items-center justify-center text-[10px] font-display font-bold">
                            {member.login.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="font-bold">{member.name || member.login}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{member.email || '-'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={member.role === 'admin' ? 'danger' : 'neutral'} text={member.role} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {format(new Date(member.joinedAt), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No members found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PageContent>
    </div>
  );
}
