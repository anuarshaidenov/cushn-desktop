import { useInstallUpdate, useUpdateStatus } from "@/data/updates";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

/** Shown only once an update has downloaded; restarts into it. */
export const UpdateButton = () => {
  const { data: status } = useUpdateStatus();
  const { mutate: install, isPending } = useInstallUpdate();

  if (status?.state !== "ready") return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="xs"
            disabled={isPending}
            className="origin-right animate-in duration-200 ease-out-quint fade-in zoom-in-95 blur-in-2 motion-reduce:blur-in-0 motion-reduce:zoom-in-100"
            onClick={() =>
              install(undefined, {
                onError: (error) => {
                  toast.add({ type: "error", title: error.message });
                },
              })
            }
          />
        }
      >
        {isPending && <Spinner />}
        Update
      </TooltipTrigger>
      <TooltipContent>Restart to install v{status.version}</TooltipContent>
    </Tooltip>
  );
};
