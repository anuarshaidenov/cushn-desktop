import { useTheme } from "@/components/ThemeProvider";
import { appHotkeys } from "@/lib/hotkeys";
import { useAddBudgetDialogStore } from "@/stores/useAddBudgetDialogStore";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useRouter } from "@tanstack/react-router";

export const useGlobalKeyboardShortcuts = () => {
  const router = useRouter();
  const openDialog = useAddBudgetDialogStore((state) => state.openDialog);
  const { theme, setTheme } = useTheme();

  useHotkey(appHotkeys["budget.create"], openDialog);
  useHotkey(appHotkeys["theme.toggle"], () =>
    setTheme(theme === "light" ? "dark" : "light"),
  );

  useHotkey(appHotkeys["nav.home"], () =>
    router.navigate({ to: "/dashboard/home" }),
  );
  useHotkey(appHotkeys["nav.budgets"], () =>
    router.navigate({ to: "/dashboard" }),
  );
  useHotkey(appHotkeys["nav.views"], () =>
    router.navigate({ to: "/dashboard/views" }),
  );
  useHotkey(appHotkeys["nav.preferences"], () =>
    router.navigate({ to: "/settings" }),
  );
  useHotkey(appHotkeys["nav.shortcuts"], () =>
    router.navigate({ to: "/settings/shortcuts" }),
  );
  useHotkey(appHotkeys["nav.templates"], () =>
    router.navigate({ to: "/settings/templates" }),
  );
  useHotkey(appHotkeys["nav.labels"], () =>
    router.navigate({ to: "/settings/labels" }),
  );
  useHotkey(appHotkeys["nav.archive"], () =>
    router.navigate({ to: "/settings/archive" }),
  );
  useHotkey(appHotkeys["nav.trash"], () =>
    router.navigate({ to: "/settings/trash" }),
  );
  useHotkey(appHotkeys["nav.backup"], () =>
    router.navigate({ to: "/settings/backup" }),
  );
  useHotkey(appHotkeys["nav.agents"], () =>
    router.navigate({ to: "/settings/agents" }),
  );
  useHotkey(appHotkeys["nav.back"], () => router.history.back());
  useHotkey(appHotkeys["nav.forward"], () => router.history.forward());
};
