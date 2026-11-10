import type { Id } from "@shared/domain";
import { toast } from "@/components/ui/toast";
import { useExportBudgetMarkdown } from "@/data/budgets";
import { useRevealFile } from "@/data/files";
import { platform } from "@/data/platform";

const revealLabel =
  platform === "darwin"
    ? "Open in Finder"
    : platform === "win32"
      ? "Open in Explorer"
      : "Open Folder";

/** Exports one budget through the save dialog, then toasts with an action that shows the file. */
export function useBudgetMarkdownExport(budgetId: Id<"budgets">) {
  // `mutateAsync`: the menu item unmounts on click, which skips per-call `mutate` callbacks.
  const { mutateAsync, isPending } = useExportBudgetMarkdown();
  const { mutate: reveal } = useRevealFile();

  const exportMarkdown = async () => {
    try {
      const result = await mutateAsync({ budgetId });
      if (result.status !== "saved") return;

      const { filePath } = result;
      const id = toast.add({
        title: "Budget exported",
        description: filePath.split(/[\\/]/).at(-1),
        actionProps: {
          children: revealLabel,
          onClick() {
            toast.close(id);
            reveal({ filePath });
          },
        },
      });
    } catch (error) {
      console.error(error);
      toast.add({ type: "error", title: "Failed to export budget" });
    }
  };

  return { exportMarkdown, isPending };
}
