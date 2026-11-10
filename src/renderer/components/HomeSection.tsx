import { useId } from "react";
import { Link } from "@tanstack/react-router";
import type { Id } from "@shared/domain";
import { Card } from "./ui/card";
import { Item } from "./ui/item";

type Props = {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
};

export const HomeSection = (props: Props) => {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <HomeSectionHeading
        id={headingId}
        title={props.title}
        action={props.action}
      />
      <Card className="gap-0 p-1.5">
        <ul className="flex flex-col">{props.children}</ul>
      </Card>
    </section>
  );
};

export const HomeSectionHeading = (props: {
  id: string;
  title: string;
  action?: React.ReactNode;
}) => {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <h2 id={props.id} className="text-xs font-medium text-muted-foreground">
        {props.title}
      </h2>
      {props.action}
    </div>
  );
};

export const HomeLinkRow = (props: {
  budgetId: Id<"budgets">;
  children: React.ReactNode;
}) => {
  return (
    <li>
      <Item
        size="sm"
        className="flex-nowrap px-2.5 py-2"
        render={
          <Link
            to="/dashboard/$budgetId"
            params={{ budgetId: props.budgetId }}
          />
        }
      >
        {props.children}
      </Item>
    </li>
  );
};
