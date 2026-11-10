import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Button } from "./ui/button";
import { useAddBudgetDialogStore } from "@/stores/useAddBudgetDialogStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "./ui/kbd";

type Props = {
  onClick?: () => void;
};

export const AddBudgetButton = (props: Props) => {
  const openDialog = useAddBudgetDialogStore((state) => state.openDialog);
  const handleClick = () => {
    openDialog();
    props.onClick?.();
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant={"outline"} size={"icon-xs"} onClick={handleClick} />
        }
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
      </TooltipTrigger>
      <TooltipContent>
        Create new budget <Kbd>c</Kbd>
      </TooltipContent>
    </Tooltip>
  );
};
