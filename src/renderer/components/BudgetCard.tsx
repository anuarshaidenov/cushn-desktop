import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { memo } from "react";
import { Link } from "@tanstack/react-router";
import type { BudgetListItem } from "@shared/api";
import {
  cn,
  formatNumberWithSpaces,
  formatShortDate,
  getCurrencySymbol,
} from "@/lib/utils";
import { BudgetCardActions, BudgetCardContextMenu } from "./BudgetCardActions";
import { BudgetLabel } from "./BudgetLabel";
import { BudgetIconGlyph } from "./BudgetIcon";
import type { BudgetListSearch } from "@/lib/budgetListSearch";
import { useSelectableBudget } from "./BudgetSelection";

type Props = {
  currentSearch: BudgetListSearch;
  budget: BudgetListItem;
};

export const BudgetCard = memo(function BudgetCard(props: Props) {
  const { isSelected, isMarqueeSelecting, toggleOnModifierClick } =
    useSelectableBudget(props.budget.id);

  return (
    <BudgetCardContextMenu
      budget={props.budget}
      data-marquee-id={props.budget.id}
      className="group relative h-full"
    >
      <Card
        className={cn(
          "h-full gap-3 p-4 transition-[transform,box-shadow] duration-200 ease-out-quint",
          "group-hover:shadow-(--custom-shadow-raised) group-data-popup-open:shadow-(--custom-shadow-raised)",
          // The overlay link is the card's only <a>, so menu and label presses don't trigger this.
          // A marquee drag can start on it, and the card shouldn't stay pressed for the whole drag.
          !isMarqueeSelecting &&
            "has-[a:active]:scale-[0.98] has-[a:active]:duration-100 motion-reduce:has-[a:active]:scale-100",
          isSelected && "ring-2 ring-primary",
        )}
      >
        {/* An overlay link, not a wrapper: buttons nested in an anchor navigated on click. */}
        <Link
          to="/dashboard/$budgetId"
          params={{ budgetId: props.budget.id }}
          search={props.currentSearch}
          aria-label={props.budget.title}
          draggable={false}
          onClick={toggleOnModifierClick}
          className="absolute inset-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <CardHeader className="px-0">
          <CardTitle className="flex min-w-0 items-center gap-2 text-sm leading-loose">
            <BudgetIconGlyph icon={props.budget.icon} />
            <span className="truncate">{props.budget.title}</span>
          </CardTitle>
          <CardDescription className="px-0 text-xs">
            {formatShortDate(props.budget.createdAt)}
          </CardDescription>
          <CardAction className="relative z-10 mt-1">
            <BudgetCardActions budget={props.budget} />
          </CardAction>
        </CardHeader>
        <CardFooter className="px-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatNumberWithSpaces(props.budget.income)}{" "}
              {getCurrencySymbol(props.budget.currency)}
            </span>
            <span className="text-xs text-muted-foreground">
              {props.budget.template?.name}
            </span>
            <div className="relative z-10">
              <BudgetLabel
                labelId={props.budget.label?.id}
                budgetId={props.budget.id}
              />
            </div>
          </div>
        </CardFooter>
      </Card>
    </BudgetCardContextMenu>
  );
});
