import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "./input";

export function NumericMaskInput(props: React.ComponentProps<"input">) {
  const [displayValue, setDisplayValue] = React.useState(props.value || "");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\s/g, ""); // remove spaces

    // Allow only digits and at most one dot
    if (!/^\d*\.?\d*$/.test(raw)) return;

    // Split integer and decimal parts
    const [intPart, decimalPart] = raw.split(".");

    // Format integer part with spaces every 3 digits from right
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

    // Rebuild formatted value
    const formatted =
      decimalPart !== undefined
        ? `${formattedInt}.${decimalPart}`
        : formattedInt;

    setDisplayValue(formatted);

    // Trigger parent onChange with raw numeric value
    props.onChange?.({
      ...e,
      target: { ...e.target, value: raw },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  React.useEffect(() => {
    // Update display value if props.value changes
    const raw = props.value ? props.value.toString().replace(/\s/g, "") : "";
    const [intPart, decimalPart] = raw.split(".");

    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

    const formatted =
      decimalPart !== undefined
        ? `${formattedInt}.${decimalPart}`
        : formattedInt;

    setDisplayValue(formatted);
  }, [props.value]);

  return (
    <Input
      {...props}
      className={cn("tabular-nums", props.className)}
      value={displayValue}
      onChange={handleChange}
      inputMode="decimal"
      pattern="[0-9\s.]*"
    />
  );
}
