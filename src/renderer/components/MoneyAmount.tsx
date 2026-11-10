import { cn, formatNumberWithSpaces, getCurrencySymbol } from "@/lib/utils";

type Props = {
  value: number;
  currency?: string;
  className?: string;
};

const formatCurrency = (code: string) =>
  getCurrencySymbol(code) ?? code.toUpperCase();

export const MoneyAmount = (props: Props) => {
  return (
    <span className={cn("whitespace-nowrap tabular-nums", props.className)}>
      {formatNumberWithSpaces(props.value)}
      {props.currency && ` ${formatCurrency(props.currency)}`}
    </span>
  );
};
