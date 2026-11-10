import {
  InputGroup,
  InputGroupNumericInput,
} from "@/components/ui/input-group";
import { useDebounce } from "@uidotdev/usehooks";
import type { Id } from "@shared/domain";
import React, { useState } from "react";
import { useUpdateBudget, useUpdateBudgetIncome } from "@/data/budgets";
import { toast } from "@/components/ui/toast";
import { Button } from "./ui/button";
import { CurrencyPicker } from "./CurrencyPicker";

type Props = {
  income: string;
  currency: string;
  budgetId: Id<"budgets">;
};

export const BudgetIncome = (props: Props) => {
  const [value, setValue] = useState(+props.income);
  const debouncedValue = useDebounce(value, 500);
  const { mutate } = useUpdateBudgetIncome();
  const { mutate: updateCurrency } = useUpdateBudget();

  React.useEffect(() => {
    if (debouncedValue === +props.income) return;

    mutate(
      { budgetId: props.budgetId, income: debouncedValue },
      {
        onError: (error) => {
          setValue(+props.income);
          console.error(error);
          toast.add({ type: "error", title: "Failed to update budget income" });
        },
      },
    );
  }, [debouncedValue]);

  return (
    <InputGroup className="[appearance:textfield] rounded-none border-0 border-none bg-background p-0 py-0 pl-0 text-2xl shadow-none ring-0 outline-none focus-within:outline-0 focus:border-none focus:bg-background focus:shadow-none focus:ring-0 focus:outline-0 focus:outline-none focus-visible:bg-background focus-visible:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-none has-[[data-slot=input-group-control]:focus-visible]:ring-0 md:text-3xl dark:bg-background [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none">
      <InputGroupNumericInput
        value={value}
        onChange={(e) => setValue(+e.target.value)}
        placeholder="Enter income"
        className="[appearance:textfield] pl-0 text-2xl md:text-3xl [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
      />
      <CurrencyPicker
        value={props.currency}
        onValueChange={(currency) => {
          if (!currency || currency === props.currency) return;
          updateCurrency({ budgetId: props.budgetId, currency });
        }}
        trigger={
          <Button
            variant={"outline"}
            size={"lg"}
            className="h-10 cursor-pointer px-3.5 text-2xl text-muted-foreground uppercase"
          />
        }
      >
        {props.currency}
      </CurrencyPicker>
    </InputGroup>
  );
};
