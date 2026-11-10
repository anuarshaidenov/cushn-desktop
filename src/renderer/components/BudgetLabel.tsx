import { useMemo, type ReactNode } from "react";
import type { Id } from "@shared/domain";
import { useSetBudgetLabel } from "@/data/budgets";
import { useLabels } from "@/data/labels";
import { toast } from "@/components/ui/toast";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select-themed";

type Props = {
  budgetId: Id<"budgets">;
  labelId?: Id<"budgetLabels"> | null;
};

/** Shared by items and trigger: Base UI resolves the trigger label from the root's `items` map. */
export const BudgetLabelOption = (props: { color: string; name: string }) => (
  <span className="flex items-center gap-2">
    <div
      className="inline-block h-3 w-3 shrink-0 rounded-full"
      style={{ backgroundColor: props.color }}
    ></div>
    <span className="truncate">{props.name}</span>
  </span>
);

export const useBudgetLabelItems = (
  labels: { id: Id<"budgetLabels">; name: string; color: string }[] | undefined,
) =>
  useMemo(() => {
    const items: Record<string, ReactNode> = {
      none: <BudgetLabelOption color="#eee" name="No label" />,
    };
    for (const label of labels ?? []) {
      items[label.id.toString()] = (
        <BudgetLabelOption color={label.color} name={label.name} />
      );
    }
    return items;
  }, [labels]);

export const BudgetLabel = (props: Props) => {
  const budgetId = props.budgetId;
  const { data: labelData } = useLabels();
  const items = useBudgetLabelItems(labelData?.labels);
  const { mutate, isPending, variables } = useSetBudgetLabel();
  const setLabel = (labelId: Id<"budgetLabels"> | null) =>
    mutate(
      { budgetId, labelId },
      {
        onError: (error) => {
          console.error(error);
          toast.add({ type: "error", title: "Failed to set budget label" });
        },
      },
    );
  const labelId = isPending ? variables.labelId : props.labelId;

  return (
    <Select
      value={labelId?.toString() || "none"}
      items={items}
      onValueChange={(value) => {
        if (value === "none") {
          setLabel(null);
          return;
        }
        setLabel(value as Id<"budgetLabels">);
      }}
    >
      <SelectTrigger className="relative h-5! w-[100px] px-2! py-1 text-xs after:absolute after:inset-x-0 after:-inset-y-1.5">
        <SelectValue placeholder="Label" className="truncate" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={"none"}>
            <BudgetLabelOption color="#eee" name="No label" />
          </SelectItem>

          {labelData?.labels.map((label) => (
            <SelectItem key={label.id} value={label.id.toString()}>
              <BudgetLabelOption color={label.color} name={label.name} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
