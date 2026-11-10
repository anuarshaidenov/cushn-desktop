import { useState } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { BackupCounts, BackupSummary, ImportMode } from "@shared/api";
import { toast } from "@/components/ui/toast";
import { useImportBackup } from "@/data/backup";
import { ImportIllustration } from "./ImportIllustration";
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
import { Spinner } from "./ui/spinner";

export interface OpenedBackup {
  token: string;
  summary: BackupSummary;
}

const MODE_OPTIONS: { mode: ImportMode; title: string; description: string }[] =
  [
    {
      mode: "add",
      title: "Add to my data",
      description: "Keeps everything you have and adds the backup's budgets.",
    },
    {
      mode: "replace",
      title: "Replace all my data",
      description:
        "Removes everything you have and puts the backup in its place.",
    },
  ];

export const ImportBackupDialog = ({
  backup,
  open,
  onOpenChange,
}: {
  backup: OpenedBackup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { mutate, isPending } = useImportBackup();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {backup && (
          <ImportBackupForm
            key={backup.token}
            summary={backup.summary}
            isPending={isPending}
            onImport={(mode) =>
              mutate(
                { token: backup.token, mode },
                {
                  onSuccess: (result) => {
                    onOpenChange(false);
                    toast.add({
                      type: "success",
                      title: `Imported ${formatCounts(result.counts)}`,
                      description: `Your previous data was saved to ${result.safetyCopyPath}`,
                    });
                  },
                  onError: (error) =>
                    toast.add({ type: "error", title: error.message }),
                },
              )
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

const ImportBackupForm = ({
  summary,
  isPending,
  onImport,
}: {
  summary: BackupSummary;
  isPending: boolean;
  onImport: (mode: ImportMode) => void;
}) => {
  const [mode, setMode] = useState<ImportMode>("add");
  const exported = new Date(summary.exportedAt).toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <>
      <ImportIllustration mode={mode} className="mt-4" />
      <DialogHeader>
        <DialogTitle>Import backup</DialogTitle>
        <DialogDescription>
          <span className="font-medium [overflow-wrap:anywhere] text-foreground">
            {summary.fileName}
          </span>{" "}
          from {exported} holds {formatCounts(summary.counts)}.
        </DialogDescription>
      </DialogHeader>
      <RadioGroup<ImportMode>
        aria-label="How to import"
        value={mode}
        onValueChange={setMode}
        disabled={isPending}
        className="grid grid-cols-2 gap-3"
      >
        {MODE_OPTIONS.map((option) => (
          <ModeOption key={option.mode} {...option} />
        ))}
      </RadioGroup>
      <DialogFooter className="sm:items-center">
        <p className="text-xs text-muted-foreground sm:mr-auto">
          A safety copy of your current data is saved first.
        </p>
        <DialogClose
          disabled={isPending}
          render={<Button variant="outline" size="sm" />}
        >
          Cancel
        </DialogClose>
        <Button size="sm" disabled={isPending} onClick={() => onImport(mode)}>
          {isPending && <Spinner />}
          Import
        </Button>
      </DialogFooter>
    </>
  );
};

const ModeOption = ({
  mode,
  title,
  description,
}: {
  mode: ImportMode;
  title: string;
  description: string;
}) => {
  return (
    <Radio.Root
      value={mode}
      className="group/option relative flex cursor-pointer flex-col gap-1 rounded-xl p-3.5 pr-9 text-left shadow-(--custom-shadow-control) transition-[box-shadow,background-color,transform] duration-150 ease-out-quint outline-none select-none hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50 active:scale-[0.98] data-checked:bg-primary/5 data-checked:ring-[1.5px] data-checked:ring-primary data-disabled:cursor-not-allowed data-disabled:opacity-60 motion-reduce:active:scale-100 dark:data-checked:bg-primary/10"
    >
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
      <span className="absolute top-4 right-3.5 flex size-4 items-center justify-center rounded-full shadow-(--custom-shadow-control) transition-[background-color] duration-150 group-data-checked/option:bg-primary group-data-checked/option:shadow-(--custom-shadow-control-solid)">
        <Radio.Indicator className="size-1.5 rounded-full bg-primary-foreground transition-[transform,opacity] duration-150 ease-out-quint data-ending-style:scale-50 data-ending-style:opacity-0 data-starting-style:scale-50 data-starting-style:opacity-0" />
      </span>
    </Radio.Root>
  );
};

function formatCounts(counts: BackupCounts) {
  const parts: [number, string, string][] = [
    [counts.budgets, "budget", "budgets"],
    [counts.expenses, "expense", "expenses"],
    [counts.templates, "template", "templates"],
    [counts.labels, "label", "labels"],
    [counts.views, "view", "views"],
  ];
  return parts
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    .join(", ");
}
