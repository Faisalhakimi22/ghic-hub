import { useQueryClient } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "./theme-provider";
import {
  dashboardRequest,
  type DashboardAccount,
  useCurrentAccount,
} from "@/lib/account";
import { useAuth } from "@/lib/auth";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { getToken } = useAuth();
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const isDark =
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : theme === "dark";

  const toggle = async () => {
    const previous = theme;
    const next = isDark ? "light" : "dark";
    setTheme(next);
    queryClient.setQueryData<DashboardAccount>(["me"], (current) =>
      current
        ? { ...current, settings: { ...current.settings, theme: next } }
        : current,
    );
    if (!account.data) return;
    try {
      const updated = await dashboardRequest<DashboardAccount>(
        "me/settings",
        getToken,
        {
          method: "PATCH",
          body: JSON.stringify({ theme: next }),
        },
      );
      queryClient.setQueryData(["me"], updated);
    } catch {
      setTheme(previous);
      queryClient.setQueryData<DashboardAccount>(["me"], (current) =>
        current
          ? { ...current, settings: { ...current.settings, theme: previous } }
          : current,
      );
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  };

  return (
    <button
      onClick={() => void toggle()}
      className="inline-flex items-center justify-center w-8 h-8 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title="Toggle theme"
      aria-label="Toggle theme"
      data-testid="button-theme-toggle"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
