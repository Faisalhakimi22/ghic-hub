import { QueryClient } from "@tanstack/react-query";

// Never share a product-data cache between signed-in identities.
export function createSessionQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
  });
}
