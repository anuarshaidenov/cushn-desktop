/** Toasts for undoable actions; their buttons and ⌘Z / ⇧⌘Z share one undo history. */
import { ShortcutChip } from "@/components/ShortcutKeys";
import { toast } from "@/components/ui/toast";
import { CushnError } from "@shared/errors";
import { type UndoEntry, type UndoOutcome, undoHistory } from "@/lib/undo";

const ACTION_TIMEOUT_MS = 8000;

// Entry id → the toast that offers its Undo, closed once the entry is undone some other way.
const actionToasts = new Map<string, string>();

function showErrorToast(title: string, error: unknown) {
  console.error(error);
  toast.add({
    type: "error",
    title,
    description: error instanceof CushnError ? error.message : undefined,
  });
}

export function showUndoableToast({
  title,
  description,
  entry,
}: {
  title: string;
  description?: string;
  entry: UndoEntry;
}) {
  const toastId = toast.add({
    title,
    description,
    timeout: ACTION_TIMEOUT_MS,
    onRemove: () => actionToasts.delete(entry.id),
    actionProps: {
      children: (
        <>
          Undo
          <ShortcutChip id="edit.undo" />
        </>
      ),
      // Stays open while another undo runs, so the click can be retried.
      onClick: async () => {
        const outcome = await undo(entry.id);
        if (outcome?.status !== "busy") toast.close(toastId);
      },
    },
  });
  actionToasts.set(entry.id, toastId);
}

/** Undoes `id` or the newest entry; only a failure toasts. */
export async function undo(id?: string): Promise<UndoOutcome | null> {
  try {
    const outcome = await undoHistory.undo(id);
    if (outcome.status === "done") {
      const toastId = actionToasts.get(outcome.entry.id);
      if (toastId) toast.close(toastId);
    }
    return outcome;
  } catch (error) {
    showErrorToast("Couldn't undo", error);
    return null;
  }
}

/** Redoes the most recently undone entry; only a failure toasts. */
export async function redo(): Promise<UndoOutcome | null> {
  try {
    return await undoHistory.redo();
  } catch (error) {
    showErrorToast("Couldn't redo", error);
    return null;
  }
}
