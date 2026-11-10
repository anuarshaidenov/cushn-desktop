import { useState } from "react";
import { toast } from "@/components/ui/toast";
import type { Id } from "@shared/domain";
import { useSetBudgetIcon } from "@/data/budgets";
import { findIcon } from "@/lib/iconCatalog";
import { cn } from "@/lib/utils";
import { CatalogIconPicture } from "./CatalogIconPicture";
import { IconPicker } from "./IconPicker";

type Props = {
  budgetId: Id<"budgets">;
  icon: string | null;
};

export const BudgetIcon = (props: Props) => {
  const [icon, setIcon] = useState(props.icon);
  const { mutate } = useSetBudgetIcon();

  const change = (next: string | null) => {
    const previous = icon;
    setIcon(next);
    mutate(
      { budgetId: props.budgetId, icon: next },
      {
        onError: (error) => {
          console.error(error);
          setIcon((current) => (current === next ? previous : current));
          toast.add({ type: "error", title: "Failed to update budget icon" });
        },
      },
    );
  };

  return (
    <IconPicker
      value={icon}
      onValueChange={change}
      size="lg"
      aria-label="Budget icon"
      className="-ml-2"
    />
  );
};

export const BudgetIconGlyph = (props: {
  icon: string | null;
  className?: string;
}) => {
  const found = findIcon(props.icon);
  return (
    <CatalogIconPicture
      icon={found}
      className={cn(
        "size-4 shrink-0",
        !found && "text-muted-foreground",
        props.className,
      )}
    />
  );
};
