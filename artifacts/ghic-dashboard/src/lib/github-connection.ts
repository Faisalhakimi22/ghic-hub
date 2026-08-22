/**
 * GitHub App connection state for the hub.
 *
 * The browser never names a repository. It sends at most an installation
 * id -- the one GitHub put in the Setup URL redirect -- and the server
 * re-reads that installation from GitHub with the App's own credentials
 * before believing anything about it. Repository names, visibility and
 * ownership all come back from that server-side read, so a tampered
 * `installation_id` in the address bar can only ever produce a 403.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

export interface ConnectedInstallation {
  installationId: number;
  accountLogin: string;
  accountType: string;
  repositorySelection: string | null;
  repositoryCount: number;
  connectedAt: string | null;
  status: 'connected' | 'disconnected' | 'revoked' | 'suspended' | string;
  statusReason?: string | null;
  statusChangedAt?: string | null;
}

export interface GitHubConnection {
  configured: boolean;
  installUrl: string;
  installations: ConnectedInstallation[];
}

export interface InstallationResult {
  ok: boolean;
  cancelled?: boolean;
  revoked?: boolean;
  installationId?: number;
  accountLogin?: string | null;
  repositoryCount?: number;
  setupAction?: string;
}

export interface InstallationIntent {
  ok: boolean;
  installUrl: string;
  expiresAt: string;
}

export const githubConnectionKey = ['github', 'connection'] as const;

export function useGitHubConnection() {
  return useQuery<GitHubConnection>({
    queryKey: githubConnectionKey,
    queryFn: () => customFetch<GitHubConnection>('/api/github/connection'),
  });
}

export function useCreateInstallationIntent() {
  return useMutation<InstallationIntent, Error, void>({
    mutationFn: () =>
      customFetch<InstallationIntent>('/api/github/installations/intent', {
        method: 'POST',
      }),
  });
}

/**
 * Query parameters GitHub appends to the Setup URL.
 *
 * `setup_action=install` (or `update`) carries an installation id;
 * `setup_action=request` means the user asked an org owner to approve and
 * nothing is installed yet. A user who backs out of the installation
 * screen never reaches this at all -- GitHub simply does not redirect --
 * so the absent-parameters case is the cancellation case.
 */
export function readSetupParams(search: string = window.location.search) {
  const params = new URLSearchParams(search);
  const installationId = params.get('installation_id');
  const setupAction = params.get('setup_action');
  const state = params.get('state');
  return {
    present: Boolean(installationId || setupAction || state),
    installationId,
    setupAction,
    state,
    fromSetup: params.get('source') === 'github_app_setup',
  };
}

/** Strip the setup parameters so a reload cannot replay the callback. */
export function clearSetupParams() {
  const url = new URL(window.location.href);
  for (const key of ['installation_id', 'setup_action', 'source', 'state', 'code']) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

export function useCompleteInstallation() {
  const queryClient = useQueryClient();
  return useMutation<
    InstallationResult,
    Error,
    { installationId: string | number | null; setupAction: string | null; state: string | null }
  >({
    mutationFn: (input) =>
      customFetch<InstallationResult>('/api/github/installations', {
        method: 'POST',
        body: JSON.stringify({
          installationId: input.installationId,
          setupAction: input.setupAction,
          state: input.state,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: githubConnectionKey });
      void queryClient.invalidateQueries({ queryKey: ['listRepositories'] });
    },
  });
}

export function useRefreshInstallation() {
  const queryClient = useQueryClient();
  return useMutation<InstallationResult, Error, number>({
    mutationFn: (installationId) =>
      customFetch<InstallationResult>(
        `/api/github/installations/${installationId}/refresh`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: githubConnectionKey });
      void queryClient.invalidateQueries({ queryKey: ['listRepositories'] });
    },
  });
}

export function useDisconnectInstallation() {
  const queryClient = useQueryClient();
  return useMutation<InstallationResult, Error, number>({
    mutationFn: (installationId) =>
      customFetch<InstallationResult>(
        `/api/github/installations/${installationId}/disconnect`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: githubConnectionKey });
      void queryClient.invalidateQueries({ queryKey: ['listRepositories'] });
    },
  });
}
