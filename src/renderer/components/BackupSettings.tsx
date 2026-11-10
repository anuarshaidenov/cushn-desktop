import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { toast } from "@/components/ui/toast";
import { useExportBackup, useOpenBackup } from "@/data/backup";
import { ImportBackupDialog, type OpenedBackup } from "./ImportBackupDialog";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Spinner } from "./ui/spinner";

export const BackupSettings = () => {
  return (
    <>
      <ExportBackup />
      <ImportBackup />
    </>
  );
};

const ExportBackup = () => {
  const { mutate, isPending } = useExportBackup();

  return (
    <section className="mb-10">
      <h2 className="lg mb-5">Export</h2>
      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm">Export to a file</span>
              <span className="text-xs text-muted-foreground">
                Saves every budget, template, label, view and setting to a JSON
                file.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() =>
                mutate(undefined, {
                  onSuccess: (result) => {
                    if (result.status === "saved") {
                      toast.add({
                        type: "success",
                        title: "Backup saved",
                        description: result.filePath,
                      });
                    }
                  },
                  onError: (error) =>
                    toast.add({ type: "error", title: error.message }),
                })
              }
            >
              {isPending ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
              )}
              Export…
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

const ImportBackup = () => {
  const { mutate, isPending } = useOpenBackup();
  const [dialog, setDialog] = useState<{
    open: boolean;
    backup: OpenedBackup | null;
  }>({ open: false, backup: null });

  return (
    <section className="mb-10">
      <h2 className="lg mb-5">Import</h2>
      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm">Import from a file</span>
              <span className="text-xs text-muted-foreground">
                Adds the file's budgets to your data, or replaces all of it; a
                copy of the current data is saved first.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() =>
                mutate(undefined, {
                  onSuccess: (result) => {
                    if (result.status === "opened") {
                      setDialog({
                        open: true,
                        backup: {
                          token: result.token,
                          summary: result.summary,
                        },
                      });
                    }
                  },
                  onError: (error) =>
                    toast.add({ type: "error", title: error.message }),
                })
              }
            >
              {isPending ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
              )}
              Import…
            </Button>
          </div>
        </CardContent>
      </Card>
      <ImportBackupDialog
        {...dialog}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </section>
  );
};
