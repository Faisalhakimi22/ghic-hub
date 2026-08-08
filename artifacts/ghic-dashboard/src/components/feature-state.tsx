import { DataError, UnavailableState } from "@/components/data-state";

type QueryState = {
  data?: unknown;
  error?: unknown;
  isError: boolean;
  isLoading: boolean;
};

export function FeatureState({
  query,
  title,
  fallbackReason,
}: {
  query: QueryState;
  title: string;
  fallbackReason: string;
}) {
  if (query.isLoading)
    return <div className="h-32 bg-muted animate-pulse border border-border" />;
  if (query.isError)
    return <DataError error={query.error} title={`${title} unavailable`} />;
  const payload =
    query.data && typeof query.data === "object"
      ? (query.data as { available?: boolean; reason?: string })
      : null;
  return (
    <UnavailableState
      title={`${title} is unavailable`}
      reason={payload?.reason || fallbackReason}
    />
  );
}
