import { BudgetLabel } from "./BudgetLabel";
import { BudgetViewProperty } from "./BudgetViewProperty";
import { ExportBudgetToMarkdown } from "./ExportBudgetToMarkdown";
import type { BudgetDetail } from "@shared/api";

type Props = {
  budget: BudgetDetail;
};

export const BudgetPropertiesDesktop = (props: Props) => {
  return (
    <div className="flex flex-col px-4 py-2">
      <div className="mb-1">
        <h2 className="text-muted-foreground text-xs font-medium">Created</h2>
      </div>
      <ul className="mb-8 flex flex-col">
        <li>
          <span className="text-muted-foreground text-xs">
            {new Date(props.budget.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </li>
      </ul>

      <div className="mb-3">
        <h2 className="text-muted-foreground text-xs font-medium">Template</h2>
      </div>
      <ul className="mb-8 flex flex-col">
        <li className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            {props.budget.template?.name}
          </span>
          <p className="text-muted-foreground text-xs">
            {props.budget.template?.description}
          </p>
        </li>
      </ul>

      <div className="mb-3">
        <h2 className="text-muted-foreground text-xs font-medium">Label</h2>
      </div>
      <ul className="mb-8 flex flex-col">
        <li>
          <BudgetLabel
            budgetId={props.budget.id}
            labelId={props.budget.labelId}
          />
        </li>
      </ul>

      <div className="mb-3">
        <h2 className="text-muted-foreground text-xs font-medium">View</h2>
      </div>
      <ul className="mb-8 flex flex-col">
        <li>
          <BudgetViewProperty
            budgetId={props.budget.id}
            viewId={props.budget.viewId}
          />
        </li>
      </ul>

      <div className="mb-3">
        <h2 className="text-muted-foreground text-xs font-medium">Export</h2>
      </div>
      <div className="flex flex-col flex-wrap items-start gap-2">
        <ExportBudgetToMarkdown budgetId={props.budget.id} />
      </div>
    </div>
  );
};

export const BudgetPropertiesMobile = (props: Props) => {
  return (
    <div className="bg-background h-auto w-full border-b px-4 py-2 lg:hidden">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-muted-foreground text-xs">
          {new Date(props.budget.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
        <span className="text-muted-foreground text-xs">
          {props.budget.template?.name}
        </span>
      </div>
    </div>
  );
};
