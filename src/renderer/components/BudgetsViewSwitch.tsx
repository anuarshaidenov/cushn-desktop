import { HugeiconsIcon } from "@hugeicons/react";
import { Grid3x3Icon, ListIcon } from "@hugeicons/core-free-icons";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { useBudgetsView } from "@/hooks/useBudgetsView";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useHotkey } from "@tanstack/react-hotkeys";
import { appHotkeys } from "@/lib/hotkeys";
import { ShortcutKeys } from "./ShortcutKeys";

export const BudgetsViewSwitch = () => {
  const { view, setView } = useBudgetsView();

  const handleGridView = () => {
    setView("grid");
  };
  const handleListView = () => {
    setView("list");
  };

  useHotkey(
    appHotkeys["budgets.toggleLayout"],
    () => {
      setView((prevView) => (prevView === "grid" ? "list" : "grid"));
    },
    { ignoreInputs: true },
  );

  const buttonVariant = (buttonView: "grid" | "list") => {
    return view === buttonView ? "secondary" : "ghost";
  };

  return (
    <Tooltip>
      <TooltipTrigger render={<ButtonGroup />}>
        <Button
          onClick={handleGridView}
          variant={buttonVariant("grid")}
          size={"xs"}
          className="max-md:pr-1.5"
        >
          <HugeiconsIcon icon={Grid3x3Icon} strokeWidth={2} />
          <span className="hidden md:block">Grid view</span>
        </Button>
        <Button
          onClick={handleListView}
          variant={buttonVariant("list")}
          size={"xs"}
          className="max-md:pr-1.5"
        >
          <HugeiconsIcon icon={ListIcon} strokeWidth={2} />
          <span className="hidden md:block">List view</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Toggle view <ShortcutKeys id="budgets.toggleLayout" />
      </TooltipContent>
    </Tooltip>
  );
};
