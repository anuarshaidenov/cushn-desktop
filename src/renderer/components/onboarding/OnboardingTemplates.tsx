import type { CSSProperties } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight01Icon,
  LayoutTemplateIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { BudgetListItem } from "@shared/api";
import type { Template } from "@shared/domain";
import { BudgetIconGlyph } from "@/components/BudgetIcon";
import { MoneyAmount } from "@/components/MoneyAmount";
import { useActiveBudgets } from "@/data/budgets";
import { useTemplate, useTemplates } from "@/data/templates";
import { StepLayout, type StepProps } from "./StepLayout";

// Seeding makes three: the two built-ins and Travel.
const SHOWN = 3;

export const OnboardingTemplates = ({ onFinish }: StepProps) => {
  const { data } = useTemplates();
  // The seeded ones are the oldest.
  const templates =
    data &&
    [...data.templates]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, SHOWN);

  return (
    <StepLayout
      icon={LayoutTemplateIcon}
      label="Templates"
      title="See each template at work."
      body="We made a sample budget from each one, with a few weeks of spending. Open one to look around, then change or delete it whenever you like."
    >
      {templates && <TemplateList templates={templates} onFinish={onFinish} />}
    </StepLayout>
  );
};

const TemplateList = (
  props: { templates: Template[] } & Pick<StepProps, "onFinish">,
) => {
  const navigate = useNavigate();
  // Newest first, so each template's latest budget comes first.
  const { results: budgets, status } = useActiveBudgets(
    { templateIds: props.templates.map((template) => template.id) },
    { pageSize: 50 },
  );
  if (status === "LoadingFirstPage") return null;

  return (
    <ul className="flex flex-col gap-2.5">
      {props.templates.map((template, index) => {
        const sample = budgets.find(
          (budget) => budget.templateId === template.id,
        );
        return (
          <li key={template.id}>
            <TemplateCard
              template={template}
              sample={sample}
              index={index}
              onOpen={() => {
                void (sample
                  ? navigate({
                      to: "/dashboard/$budgetId",
                      params: { budgetId: sample.id },
                    })
                  : navigate({
                      to: "/settings/template/$templateId",
                      params: { templateId: template.id },
                    }));
                props.onFinish();
              }}
            />
          </li>
        );
      })}
    </ul>
  );
};

const TemplateCard = (props: {
  template: Template;
  sample: BudgetListItem | undefined;
  index: number;
  onOpen: () => void;
}) => {
  const { data } = useTemplate(props.template.id);
  const categories = data?.template.categories;

  return (
    <button
      type="button"
      onClick={props.onOpen}
      className="group flex w-full cursor-pointer flex-col rounded-xl bg-card p-4 text-left shadow-(--custom-shadow) transition-[background-color,scale] duration-150 ease-out outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.985]"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{props.template.name}</span>
        {!props.sample && <OpenArrow />}
      </span>
      {categories && (
        <>
          {/* Each bar draws in after the step lands, one after another: the split is already worked out. */}
          <span
            aria-hidden="true"
            className="onboarding-wipe mt-3 flex h-1.5 gap-0.5"
            style={
              { "--wipe-delay": `${480 + props.index * 90}ms` } as CSSProperties
            }
          >
            {categories.map((category, index) => (
              <span
                key={category.id}
                className="basis-0 rounded-full"
                style={{
                  flexGrow: category.percentage,
                  backgroundColor: colorAt(index),
                }}
              />
            ))}
          </span>
          <span className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
            {categories.map((category, index) => (
              <span key={category.id} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: colorAt(index) }}
                />
                {category.name}
                <span className="text-foreground/80 tabular-nums">
                  {category.percentage}%
                </span>
              </span>
            ))}
          </span>
        </>
      )}
      {props.sample && (
        <span className="mt-3.5 flex items-center gap-2 border-t pt-3 text-sm">
          <BudgetIconGlyph
            icon={props.sample.icon}
            className="text-muted-foreground"
          />
          <span className="truncate">{props.sample.title}</span>
          <MoneyAmount
            value={props.sample.income}
            currency={props.sample.currency}
            className="ml-auto text-muted-foreground"
          />
          <OpenArrow />
        </span>
      )}
    </button>
  );
};

const OpenArrow = () => (
  <HugeiconsIcon
    icon={ArrowRight01Icon}
    strokeWidth={2}
    aria-hidden="true"
    className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5"
  />
);

const colorAt = (index: number) => `var(--chart-${(index % 8) + 1})`;
