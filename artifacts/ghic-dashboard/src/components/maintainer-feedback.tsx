import { useState } from "react";
import { Check, Loader2, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCurrentAccount, useDashboardDate } from "@/lib/account";
import { useIssueFeedback, useSaveIssueFeedback, type FeedbackDecision } from "@/lib/issue-feedback";

const decisions = [
  { value: "accepted", label: "Accept", icon: ThumbsUp },
  { value: "rejected", label: "Reject", icon: ThumbsDown },
  { value: "corrected", label: "Correct classification", icon: Pencil },
] as const;
const classifications = ["bug", "feature", "question", "docs", "duplicate", "performance", "security", "other"];
const decisionLabels = { accepted: "Recommendation accepted", rejected: "Recommendation rejected", corrected: "Classification corrected" };

export function MaintainerFeedback({ id, analysisId, onReload }: {
  id: string; analysisId: string | null; onReload: () => void;
}) {
  const account = useCurrentAccount();
  const history = useIssueFeedback(id);
  const save = useSaveIssueFeedback(id);
  const formatDate = useDashboardDate();
  const [decision, setDecision] = useState<FeedbackDecision>("accepted");
  const [classification, setClassification] = useState("");
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const role = account.data?.role;
  const canReview = role === "owner" || role === "admin";
  const changed = history.data && history.data.analysisId !== analysisId;
  const ready = Boolean(analysisId && history.data && !changed && !save.isPending && !history.isError);

  function edited() {
    setRequestId(crypto.randomUUID());
    save.reset();
  }

  return (
    <div className="min-w-0 space-y-5">
      {canReview && analysisId && !changed && (
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          save.mutate({ requestId, analysisId, decision, classification: decision === "corrected" ? classification : null, reason },
            { onError: () => { void history.refetch(); } });
        }}>
          <fieldset disabled={!ready} className="min-w-0 space-y-3 disabled:opacity-60">
            <legend className="text-sm font-medium mb-2">Decision</legend>
            <div className="flex flex-wrap gap-2">
              {decisions.map(({ value, label, icon: Icon }) => (
                <label key={value} className="relative cursor-pointer">
                  <input type="radio" name={`decision-${id}`} value={value} checked={decision === value}
                    onChange={() => { setDecision(value); edited(); }} className="peer sr-only" />
                  <span className="flex min-h-10 items-center gap-2 border border-border px-3 py-2 text-xs peer-checked:bg-accent peer-checked:text-accent-foreground peer-checked:border-foreground/40 peer-focus-visible:outline peer-focus-visible:outline-2">
                    <Icon className="h-4 w-4 shrink-0" />{label}
                  </span>
                </label>
              ))}
            </div>
            {decision === "corrected" && (
              <label className="block text-sm">Correct classification
                <select required value={classification} onChange={(event) => { setClassification(event.target.value); edited(); }}
                  className="mt-2 block w-full border border-border bg-background p-2 text-sm">
                  <option value="">Select classification</option>
                  {classifications.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            )}
            <label className="block text-sm">Reason <span className="text-muted-foreground">(optional)</span>
              <textarea rows={3} maxLength={1000} value={reason} onChange={(event) => { setReason(event.target.value); edited(); }}
                className="mt-2 block w-full resize-y border border-border bg-background p-2 text-sm" />
            </label>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!ready || save.isSuccess || (decision === "corrected" && !classification)}
              className="inline-flex min-h-10 items-center gap-2 bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {save.isPending ? "Saving..." : "Save decision"}
            </button>
            {save.isSuccess && <span role="status" className="text-sm text-muted-foreground">Decision recorded</span>}
          </div>
          {save.isError && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
        </form>
      )}
      {changed && <div className="flex flex-wrap items-center gap-3 text-sm">
        <p>The analysis changed. Reload before reviewing.</p>
        <button onClick={onReload} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 py-2"><RefreshCw className="h-4 w-4" />Reload issue</button>
      </div>}
      {!analysisId && <p className="text-sm text-muted-foreground">No completed analysis to review.</p>}
      {!canReview && analysisId && <p className="text-sm text-muted-foreground">An owner or admin can record a decision.</p>}
      {history.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading decisions...</p>}
      {history.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        <p>Decisions could not be loaded.</p>
        <button onClick={() => void history.refetch()} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 py-2"><RefreshCw className="h-4 w-4" />Retry</button>
      </div>}
      {history.data && !history.data.items.length && <p className="text-sm text-muted-foreground">No maintainer decisions yet.</p>}
      {history.data && history.data.items.length > 0 && <ol aria-label="Maintainer decisions" className="divide-y divide-border border-t border-border">
        {history.data.items.map((item) => <li key={item.id} className="space-y-2 py-4 break-words">
          <p className="text-sm font-medium">{decisionLabels[item.decision]}{item.classification ? `: ${item.classification}` : ""}</p>
          <p className="text-xs text-muted-foreground">{item.actor} | {formatDate(item.createdAt)}{item.analysisId !== analysisId ? " | Earlier analysis" : ""}</p>
          {item.reason && <p className="whitespace-pre-wrap text-sm">{item.reason}</p>}
        </li>)}
      </ol>}
    </div>
  );
}
