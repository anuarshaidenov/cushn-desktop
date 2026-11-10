import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon, ClipboardIcon } from "@hugeicons/core-free-icons";
import { Button } from "./ui/button";
import { useEffect, useRef, useState } from "react";
import { swapIconClass } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  value: number | string;
};

export const AmountClipboardWrapper = (props: Props) => {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleCopy = () => {
    navigator.clipboard.writeText(props.value.toString());
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group flex items-center gap-2 md:-mr-8">
      {props.children}
      <Button
        variant={"ghost"}
        className="hidden opacity-0 group-hover:opacity-100 md:flex"
        size={"icon-xs"}
        onClick={handleCopy}
      >
        <span className="grid *:col-start-1 *:row-start-1">
          <HugeiconsIcon
            icon={ClipboardIcon}
            strokeWidth={2}
            className={swapIconClass(!copied)}
          />
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2}
            className={swapIconClass(copied)}
          />
        </span>
      </Button>
    </div>
  );
};
