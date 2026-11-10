import { useHotkey } from "@tanstack/react-hotkeys";
import { appHotkeys } from "@/lib/hotkeys";

// The next add-expense input after whatever has focus (an expense row, the title, another
// add-expense input), wrapping around at the end of the page.
function focusAdjacentAddExpenseInput(direction: "next" | "previous") {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-add-expense-input]"),
  );
  if (direction === "previous") inputs.reverse();
  const position =
    direction === "next"
      ? Node.DOCUMENT_POSITION_FOLLOWING
      : Node.DOCUMENT_POSITION_PRECEDING;

  const active = document.activeElement;
  const target =
    (active &&
      active !== document.body &&
      inputs.find(
        (input) => active.compareDocumentPosition(input) & position,
      )) ||
    inputs[0];
  target?.focus();
}

export function useAddExpenseShortcuts() {
  useHotkey(appHotkeys["expenses.nextInput"], () =>
    focusAdjacentAddExpenseInput("next"),
  );
  useHotkey(appHotkeys["expenses.previousInput"], () =>
    focusAdjacentAddExpenseInput("previous"),
  );
}
