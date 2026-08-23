import React from "react";
import {
  getGetOrganizationQueryKey,
  getListMembersQueryKey,
  useGetOrganization,
  useListMembers,
} from "@workspace/api-client-react";
import { Box, Shield, Users } from "lucide-react";

import { DataError } from "@/components/data-state";
import {
  Grid,
  MetricCard,
  PageContent,
  PageHeader,
  StatusBadge,
} from "@/components/ui/swiss";
import { useDashboardDate } from "@/lib/account";

export default function Organization() {
  const organization = useGetOrganization({
    query: { queryKey: getGetOrganizationQueryKey() },
  });
  const members = useListMembers(
    {},
    { query: { queryKey: getListMembersQueryKey() } },
  );
  const formatDate = useDashboardDate();
  const error = organization.error || members.error;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Organization"
        description="Authenticated GHIC workspace membership"
      />
      <PageContent className="flex flex-col gap-8">
        {error ? (
          <DataError error={error} title="Organization unavailable" />
        ) : (
          <>
            {organization.isLoading ? (
              <div className="h-32 bg-muted animate-pulse border border-border" />
            ) : (
              organization.data && (
                <Grid cols={3}>
                  <MetricCard
                    compact
                    title="Workspace"
                    value={
                      organization.data.workspaceName || organization.data.name
                    }
                    icon={Shield}
                  />
                  <MetricCard
                    compact
                    title="Members"
                    value={organization.data.memberCount}
                    icon={Users}
                  />
                  <MetricCard
                    compact
                    title="Repositories"
                    value={organization.data.repositoryCount}
                    icon={Box}
                  />
                </Grid>
              )
            )}

            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-display tracking-widest uppercase font-bold text-muted-foreground border-b border-border pb-2">
                Members
              </h2>
              <div className="border border-border bg-card overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm text-left">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      {["User", "Email", "Role", "Joined"].map((label) => (
                        <th
                          key={label}
                          className="px-4 py-3 font-display tracking-widest uppercase text-[10px] text-muted-foreground font-bold"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {members.isLoading ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-muted-foreground animate-pulse"
                        >
                          Loading members...
                        </td>
                      </tr>
                    ) : members.data?.items.length ? (
                      members.data.items.map((member) => (
                        <tr
                          key={member.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {member.avatarUrl ? (
                                <img
                                  src={member.avatarUrl}
                                  alt=""
                                  className="w-7 h-7 border border-border object-cover"
                                />
                              ) : (
                                <div className="w-7 h-7 border border-border bg-muted" />
                              )}
                              <span className="font-bold">
                                {member.name || member.login}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                            {member.email || "Not recorded"}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              status={
                                member.role === "owner"
                                  ? "success"
                                  : member.role === "admin"
                                    ? "warning"
                                    : "neutral"
                              }
                              text={member.role}
                            />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                            {formatDate(member.joinedAt, {
                              hour: undefined,
                              minute: undefined,
                            })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-muted-foreground"
                        >
                          No workspace members.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </PageContent>
    </div>
  );
}
