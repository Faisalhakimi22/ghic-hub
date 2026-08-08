import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  DashboardAccount as ApiDashboardAccount,
  DashboardAccountSettings,
  Organization,
} from "@workspace/api-client-react";

import { useAuth } from "@/lib/auth";

export type AccountSettings = DashboardAccountSettings;
export type DashboardAccount = ApiDashboardAccount;
export type DashboardOrganization = Organization;

export async function dashboardRequest<T>(
  path: string,
  getToken: () => Promise<string | null>,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const response = await fetch(`/api/${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || `HTTP ${response.status}`,
    ) as Error & {
      status: number;
      code?: string;
      data?: unknown;
    };
    error.status = response.status;
    error.code = data.code;
    error.data = data;
    throw error;
  }
  return data as T;
}

export function useCurrentAccount() {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ["me"],
    enabled: Boolean(user),
    staleTime: 60_000,
    queryFn: () => dashboardRequest<DashboardAccount>("me", getToken),
  });
}

export function useCurrentOrganization() {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ["organization"],
    enabled: Boolean(user),
    staleTime: 60_000,
    queryFn: () =>
      dashboardRequest<DashboardOrganization>("organization", getToken),
  });
}

export function useDashboardDate() {
  const account = useCurrentAccount();
  const timezone = account.data?.settings.timezone || "UTC";
  return useCallback(
    (
      value: string | Date | null | undefined,
      options?: Intl.DateTimeFormatOptions,
    ) => {
      if (!value) return "Not recorded";
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return "Not recorded";
      return new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        ...options,
      }).format(date);
    },
    [timezone],
  );
}
