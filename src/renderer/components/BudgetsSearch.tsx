import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Route } from "@/routes/dashboard.index";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAppHotkeys, useHotkey } from "@tanstack/react-hotkeys";
import { appHotkeys } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import {
  ShortcutKeys,
  hotkeyHintFade,
  useDelayedHotkeyHint,
} from "./ShortcutKeys";

export const BudgetsSearch = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate();
  const showHint = useDelayedHotkeyHint(useAppHotkeys()["budgets.search"]);

  useHotkey(appHotkeys["budgets.search"], () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQ = e.target.value;
    navigate({
      to: "/dashboard",
      search: (old) => ({
        ...old,
        q: newQ,
      }),
    });
  };

  return (
    <InputGroup className="hidden h-6 w-full max-w-38 text-xs md:flex">
      <InputGroupInput
        value={q}
        ref={inputRef}
        onChange={handleInputChange}
        className="px-2 text-xs placeholder:text-xs"
        placeholder="Search..."
      />
      <InputGroupAddon className="pl-1.5">
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4" />
      </InputGroupAddon>
      {showHint && (
        <InputGroupAddon
          align="inline-end"
          className={cn("pr-1", hotkeyHintFade)}
        >
          <ShortcutKeys id="budgets.search" />
        </InputGroupAddon>
      )}
    </InputGroup>
  );
};
