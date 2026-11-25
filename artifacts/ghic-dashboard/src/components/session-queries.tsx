import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { createSessionQueryClient } from "@/lib/session-query-client";

function IdentityQueries({ children }: { children: ReactNode }) {
  const [client] = useState(createSessionQueryClient);
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function SessionQueries({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // A changed key remounts synchronously: no frame can read the prior cache.
  return <IdentityQueries key={user ? `uid:${user.uid}` : "anonymous"}>{children}</IdentityQueries>;
}
