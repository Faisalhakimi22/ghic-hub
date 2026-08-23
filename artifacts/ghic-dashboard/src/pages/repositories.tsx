import React from "react";
import {
  getListRepositoriesQueryKey,
  useListRepositories,
} from "@workspace/api-client-react";
import { Github, RefreshCw, Search } from "lucide-react";
import { Link } from "wouter";

import { ConnectGitHubPanel } from '@/components/connect-github';
import { DataError } from "@/components/data-state";
import { PageContent, PageHeader, StatusBadge } from "@/components/ui/swiss";
import { useCurrentAccount, useDashboardDate } from "@/lib/account";
import {
  useGitHubConnection,
  useCreateInstallationIntent,
  useDisconnectInstallation,
  useRefreshInstallation,
} from "@/lib/github-connection";

export default function Repositories() {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const params = {
    search: search || undefined,
    status: status || undefined,
    limit: 100,
  };
  const query = useListRepositories(params, {
    query: { queryKey: getListRepositoriesQueryKey(params) },
  });
  const formatDate = useDashboardDate();
  const account = useCurrentAccount();
  const canManageGitHub = ["owner", "admin"].includes(account.data?.role || "");
  const connection = useGitHubConnection();
  const refresh = useRefreshInstallation();
  const disconnect = useDisconnectInstallation();
  const createIntent = useCreateInstallationIntent();

  const startGitHubInstall = async () => {
    const intent = await createIntent.mutateAsync();
    window.location.assign(intent.installUrl);
  };

  const installations = connection.data?.installations ?? [];
  const nothingConnected =
    connection.isSuccess &&
    installations.every((installation) => installation.status !== "connected") &&
    !query.isLoading &&
    (query.data?.items.length ?? 0) === 0;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Repositories"
        description="Repositories connected through the GHIC GitHub App"
      />
      <PageContent className="flex flex-col gap-4">
        <GitHubConnectionBar
          configured={connection.data?.configured ?? false}
          canManage={canManageGitHub}
          installations={installations}
          onConnect={() => void startGitHubInstall()}
          onRefresh={(id) => refresh.mutate(id)}
          onDisconnect={(id) => disconnect.mutate(id)}
          refreshing={refresh.isPending}
          disconnecting={disconnect.isPending}
          refreshError={refresh.error?.message ?? disconnect.error?.message ?? createIntent.error?.message ?? null}
          connecting={createIntent.isPending}
        />

        {nothingConnected ? (
          <ConnectGitHubPanel
            configured={connection.data?.configured ?? false}
            canManage={canManageGitHub}
            onConnect={() => void startGitHubInstall()}
            connecting={createIntent.isPending}
            error={createIntent.error?.message ?? null}
          />
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tracked repositories"
              className="w-full border border-border bg-card py-2 pl-10 pr-3 text-sm focus:outline-none focus:border-primary"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All index states</option>
            <option value="ready">Ready</option>
            <option value="failed">Failed</option>
            <option value="indexing">Indexing</option>
            <option value="not_indexed">Not indexed</option>
          </select>
        </div>

        {query.isError ? (
          <DataError error={query.error} title="Repositories unavailable" />
        ) : (
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {[
                    "Repository",
                    "Access",
                    "Health",
                    "Visibility",
                    "Language",
                    "Indexed Data",
                    "Index Status",
                    "Last Indexed",
                  ].map((label) => (
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
                {query.isLoading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-muted-foreground animate-pulse"
                    >
                      Loading repositories...
                    </td>
                  </tr>
                ) : query.data?.items.length ? (
                  query.data.items.map((repository) => (
                    <tr
                      key={repository.id}
                      className="hover:bg-muted/30 transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/repositories/${repository.id}`}
                          className="font-bold group-hover:text-primary transition-colors"
                        >
                          {repository.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={
                            repository.githubAccessStatus === "connected"
                              ? "success"
                              : repository.githubAccessStatus === "removed" ||
                                  repository.githubAccessStatus === "unauthorized"
                                ? "neutral"
                                : "danger"
                          }
                          text={repository.githubAccessStatus || "unauthorized"}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={
                            repository.health === "healthy"
                              ? "success"
                              : repository.health === "failed" ||
                                  repository.health === "degraded"
                                ? "danger"
                                : "neutral"
                          }
                          text={repository.health}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {repository.visibility.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {repository.language || "Not recorded"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {repository.fileCount} files / {repository.chunkCount}{" "}
                        chunks
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={
                            repository.indexStatus === "ready"
                              ? "success"
                              : repository.indexStatus === "failed"
                                ? "danger"
                                : "neutral"
                          }
                          text={repository.indexStatus}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">
                        {formatDate(repository.lastIndexedAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No repositories match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>
    </div>
  );
}

/**
 * Where an installation is chosen.
 *
 * The action opens GitHub's own installation page, which is the only place
 * repository access can be granted. Nothing here asks the user to type an
 * owner or repository name: the selection they make on GitHub is what GHIC
 * reads back, so the two can never disagree.
 */
function GitHubConnectionBar({
  configured,
  canManage,
  installations,
  onConnect,
  onRefresh,
  onDisconnect,
  refreshing,
  disconnecting,
  refreshError,
  connecting,
}: {
  configured: boolean;
  canManage: boolean;
  installations: Array<{
    installationId: number;
    accountLogin: string;
    accountType: string;
    repositorySelection: string | null;
    repositoryCount: number;
    status: string;
  }>;
  onConnect: () => void;
  onRefresh: (installationId: number) => void;
  onDisconnect: (installationId: number) => void;
  refreshing: boolean;
  disconnecting: boolean;
  refreshError: string | null;
  connecting: boolean;
}) {
  if (!installations.length) return null;

  return (
    <div className="border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="flex items-center gap-2 text-[10px] font-display tracking-widest uppercase font-bold text-muted-foreground">
          <Github className="w-3.5 h-3.5" /> GitHub App
        </span>
        {configured && canManage ? (
          <button
            onClick={onConnect}
            disabled={connecting}
            className="text-[10px] font-display tracking-widest uppercase font-bold underline hover:text-primary"
          >
            {connecting ? "Opening GitHub..." : "Manage repository access on GitHub"}
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {installations.map((installation) => (
          <div
            key={installation.installationId}
            className="flex items-center justify-between gap-3 flex-wrap text-sm"
          >
            <span>
              <span className="font-bold">{installation.accountLogin}</span>{" "}
              <span className="text-muted-foreground">
                {installation.accountType.toLowerCase()} ·{" "}
                {installation.repositoryCount} repositor
                {installation.repositoryCount === 1 ? "y" : "ies"}
                {installation.repositorySelection === "all"
                  ? " · all repositories"
                  : " · selected repositories"}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <StatusBadge
                status={installation.status === "connected" ? "success" : "danger"}
                text={installation.status}
              />
              {canManage ? (
                <button
                  onClick={() => onRefresh(installation.installationId)}
                  disabled={refreshing || disconnecting || installation.status === "disconnected"}
                  className="flex items-center gap-2 border border-border px-3 py-1.5 text-[10px] font-display tracking-widest uppercase font-bold hover:bg-muted disabled:opacity-40"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
                  />
                  Re-sync
                </button>
              ) : null}
              {canManage && installation.status === "connected" ? (
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Disconnect GHIC from this installation? GitHub authorization will remain unchanged.",
                      )
                    ) {
                      onDisconnect(installation.installationId);
                    }
                  }}
                  disabled={refreshing || disconnecting}
                  className="border border-border px-3 py-1.5 text-[10px] font-display tracking-widest uppercase font-bold hover:bg-muted disabled:opacity-40"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {refreshError ? (
        <p className="text-xs text-destructive">{refreshError}</p>
      ) : null}
    </div>
  );
}
