import { useRef } from "react";
import { Spinner } from "./ui/spinner";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

/** Confirms a destructive action; Cancel takes the initial focus. */
export const ConfirmDialog = (props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  isPending: boolean;
  onConfirm: () => void;
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!props.isPending) props.onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        initialFocus={cancelRef}
      >
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">
            {props.title}
          </DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            ref={cancelRef}
            disabled={props.isPending}
            render={<Button variant="outline" size="sm" />}
          >
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            disabled={props.isPending}
            onClick={props.onConfirm}
          >
            {props.isPending && <Spinner />}
            {props.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
