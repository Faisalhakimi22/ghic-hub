import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, getGetDashboardOverviewQueryKey, getListAuditLogsQueryKey } from "@workspace/api-client-react";

export type FeedbackDecision = "accepted" | "rejected" | "corrected";
export interface MaintainerFeedback {
  id: string;
  analysisId: string;
  decision: FeedbackDecision;
  classification: string | null;
  reason: string;
  actor: string;
  createdAt: string;
}
export interface FeedbackInput {
  requestId: string;
  analysisId: string;
  decision: FeedbackDecision;
  classification: string | null;
  reason: string;
}
export const feedbackKey = (id: string) => ["issue-feedback", id] as const;
const feedbackUrl = (id: string) => `/api/issues/${encodeURIComponent(id)}/feedback`;

export function useIssueFeedback(id: string) {
  return useQuery({
    queryKey: feedbackKey(id),
    queryFn: () => customFetch<{ items: MaintainerFeedback[]; analysisId: string | null }>(feedbackUrl(id)),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useSaveIssueFeedback(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: FeedbackInput) => customFetch<{ feedback: MaintainerFeedback; replayed: boolean }>(feedbackUrl(id), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: feedbackKey(id) }),
      client.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
      client.invalidateQueries({ queryKey: getListAuditLogsQueryKey() }),
    ]),
  });
}
