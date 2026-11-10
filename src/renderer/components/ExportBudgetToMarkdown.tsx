import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@shared/domain";
import { useBudgetMarkdownExport } from "@/hooks/useBudgetMarkdownExport";
import { HugeiconsIcon } from "@hugeicons/react";
import { FileDownIcon } from "@hugeicons/core-free-icons";
import { cn, swapIconClass } from "@/lib/utils";

type Props = {
  budgetId: Id<"budgets">;
};

export function ExportBudgetToMarkdown(props: Props) {
  const { exportMarkdown, isPending } = useBudgetMarkdownExport(props.budgetId);

  return (
    <Button
      type="button"
      variant="secondary"
      size="xs"
      className="text-xs"
      onClick={() => exportMarkdown()}
      disabled={isPending}
    >
      <span className="grid *:col-start-1 *:row-start-1">
        <HugeiconsIcon
          icon={FileDownIcon}
          strokeWidth={2}
          className={cn("size-3.5", swapIconClass(!isPending))}
        />
        <Spinner
          aria-hidden={!isPending}
          className={cn("size-3.5", swapIconClass(isPending))}
        />
      </span>
      Export as .md
    </Button>
  );
}
