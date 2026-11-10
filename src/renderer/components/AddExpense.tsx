import { type FormEvent, useMemo, useRef, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  type CurrencyRegistry,
  ParseError,
  createBudgetCurrencyRegistry,
  parseInputLenient,
  tryParseInput,
} from "@/lib/expressionParser";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp02Icon } from "@hugeicons/core-free-icons";
import type { Id } from "@shared/domain";
import { useCreateExpense } from "@/data/expenses";
import { toast } from "@/components/ui/toast";
import { Spinner } from "./ui/spinner";
import { ShortcutKeys } from "./ShortcutKeys";
import { useExchangeRates } from "@/data/rates";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { MoneyAmount } from "./MoneyAmount";
import { RATES_ATTRIBUTION, type ExchangeRates } from "@shared/api";
import { roundMoney } from "@shared/money";
import { cn } from "@/lib/utils";

type Props = {
  budgetId: Id<"budgets">;
  allocationId: Id<"budgetAllocations">;
  currency: string;
  showCycleHint?: boolean;
};

export const AddExpense = (props: Props) => {
  const [expense, setExpense] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending } = useCreateExpense();
  const { data: rates } = useExchangeRates();
  const currencies = useMemo(
    () => createBudgetCurrencyRegistry(props.currency, rates?.rates),
    [props.currency, rates],
  );

  const addExpense = (newExpense: { title: string; amount: number }) =>
    mutate(
      {
        budgetId: props.budgetId,
        allocationId: props.allocationId,
        title: newExpense.title,
        amount: newExpense.amount,
      },
      {
        onSuccess: () => {
          setExpense("");
          if (inputRef.current) {
            inputRef.current.focus();
          }
        },
        onError: (error) => {
          console.error(error);
          toast.add({ type: "error", title: "Failed to add expense" });
        },
      },
    );

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const parsed = parseInputLenient(expense, { currencies });
      if (parsed) addExpense(parsed);
    } catch (err) {
      if (err instanceof ParseError) {
        toast.add({
          type: "error",
          title: "Invalid expense",
          description: err.message,
        });
        return;
      }
      throw err;
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <InputGroup>
        <InputGroupInput
          ref={inputRef}
          data-add-expense-input
          placeholder="Add expense, e.g. Coffee 20k + 5k or Rent 200 usd"
          value={expense}
          onChange={(e) => setExpense(e.target.value)}
          className="tabular-nums"
        />
        <InputGroupAddon align="inline-end">
          <ConversionPreview
            input={expense}
            base={props.currency}
            currencies={currencies}
            rates={rates}
          />
          {props.showCycleHint && (
            <ShortcutKeys
              id="expenses.nextInput"
              className="hidden group-has-[input:focus:placeholder-shown]/input-group:inline-flex"
            />
          )}
          <InputGroupButton
            disabled={isPending}
            type="submit"
            className="rounded-full after:left-0"
            size="icon-xs"
            variant="secondary"
          >
            <span className="sr-only">Add expense</span>
            {isPending ? (
              <Spinner />
            ) : (
              <HugeiconsIcon
                icon={ArrowUp02Icon}
                strokeWidth={2}
                className="translate-y-[0.5px]"
              />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
};

type ConversionPreviewProps = {
  input: string;
  base: string;
  currencies: CurrencyRegistry;
  rates: ExchangeRates | null | undefined;
};

const ConversionPreview = (props: ConversionPreviewProps) => {
  const [held, setHeld] = useState<number | null>(null);
  const parsed = tryParseInput(props.input, { currencies: props.currencies });
  const base = props.base.toLowerCase();
  const converted =
    parsed && parsed.currencies.some((c) => c !== base)
      ? roundMoney(parsed.amount)
      : null;
  // A half-typed expression ("200 usd +") doesn't parse: keep the last amount,
  // dimmed, rather than blinking the chip out and back in on every keystroke.
  const shown = parsed || props.input.trim() === "" ? converted : held;
  if (shown !== held) setHeld(shown);
  if (shown === null || !props.rates) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={<InputGroupText />}
        className={cn(
          "h-6 cursor-default gap-1 rounded-full bg-muted px-2.5 text-xs",
          "origin-right animate-in duration-200 ease-out-quint zoom-in-95 blur-in-2 fade-in motion-reduce:zoom-in-100 motion-reduce:blur-in-0",
          "transition-opacity",
          !parsed && "opacity-50",
        )}
      >
        <span aria-hidden>≈</span>
        <MoneyAmount
          value={shown}
          currency={base}
          className="font-medium text-foreground"
        />
      </TooltipTrigger>
      <TooltipContent>
        Rates from{" "}
        {new Date(props.rates.updatedAt).toLocaleDateString(undefined, {
          dateStyle: "medium",
        })}
        .{" "}
        <a
          href={RATES_ATTRIBUTION.url}
          target="_blank"
          rel="noreferrer"
          className="relative underline after:absolute after:-inset-2"
        >
          {RATES_ATTRIBUTION.label}
        </a>
      </TooltipContent>
    </Tooltip>
  );
};
