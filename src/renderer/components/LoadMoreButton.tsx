import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown02Icon } from "@hugeicons/core-free-icons";
import type { PaginationStatus } from "@/data/pagination";
import { loadMoreControl } from "@/lib/loadMore";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

type Props = {
  status: PaginationStatus;
  loadMore: (numItems: number) => void;
  numItems: number;
  className?: string;
};

export const LoadMoreButton = (props: Props) => {
  const { visible, loading } = loadMoreControl(props.status);

  if (!visible) {
    return null;
  }

  return (
    <Button
      variant={"secondary"}
      className={cn("w-full", props.className)}
      onClick={() => props.loadMore(props.numItems)}
      disabled={loading}
    >
      {loading ? (
        <Spinner />
      ) : (
        <HugeiconsIcon icon={ArrowDown02Icon} strokeWidth={2} />
      )}
      Load more
    </Button>
  );
};
