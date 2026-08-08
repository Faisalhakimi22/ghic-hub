import { AlertTriangle, Database, LockKeyhole } from "lucide-react";

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  if ("status" in error && typeof error.status === "number")
    return error.status;
  return null;
}

export function DataError({
  error,
  title = "Data unavailable",
}: {
  error: unknown;
  title?: string;
}) {
  const status = statusOf(error);
  const Icon =
    status === 401 || status === 403
      ? LockKeyhole
      : status === 503
        ? Database
        : AlertTriangle;
  const message =
    status === 401
      ? "Your session has expired. Sign in again to continue."
      : status === 403
        ? "This account is not a member of the GHIC workspace."
        : status === 503
          ? "PostgreSQL is unavailable or not configured for this deployment."
          : error instanceof Error
            ? error.message
            : "The dashboard could not load this data.";
  return (
    <div
      className="border border-border bg-card p-8 flex items-start gap-3"
      role="alert"
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function UnavailableState({
  title,
  reason,
}: {
  title: string;
  reason: string;
}) {
  return (
    <div className="border border-border bg-card p-8 text-center">
      <p className="text-sm font-bold">{title}</p>
      <p className="text-sm text-muted-foreground mt-1">{reason}</p>
    </div>
  );
}
