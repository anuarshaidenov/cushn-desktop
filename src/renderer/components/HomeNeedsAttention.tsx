import type { HomeOverspentAllocation } from "@shared/api";
import { roundMoney } from "@shared/money";
import { HomeLinkRow, HomeSection } from "./HomeSection";
import { MoneyAmount } from "./MoneyAmount";

type Props = {
  allocations: HomeOverspentAllocation[];
};

export const HomeNeedsAttention = (props: Props) => {
  return (
    <HomeSection title="Needs attention">
      {props.allocations.map((allocation) => (
        <HomeLinkRow key={allocation.id} budgetId={allocation.budgetId}>
          <div className="min-w-0 flex-1">
            <p title={allocation.categoryName} className="truncate">
              {allocation.categoryName}
            </p>
            <p
              title={allocation.budgetTitle}
              className="truncate text-xs text-muted-foreground"
            >
              {allocation.budgetTitle}
            </p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-muted-foreground">
            <MoneyAmount
              value={roundMoney(allocation.spent - allocation.amount)}
              currency={allocation.currency}
              className="text-destructive"
            />{" "}
            over
          </span>
        </HomeLinkRow>
      ))}
    </HomeSection>
  );
};
