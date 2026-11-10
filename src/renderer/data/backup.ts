import { useQueryClient } from "@tanstack/react-query";
import type { ArgsOf } from "@shared/api";
import { undoHistory } from "@/lib/undo";
import { cushn } from "./client";
import { ALL_QUERY_ROOTS } from "./keys";
import { invalidateRoots, useInvalidatingMutation } from "./mutation";

/** `mutate()` → `{ status: "saved", filePath }` or `{ status: "canceled" }`. */
export function useExportBackup() {
  return useInvalidatingMutation(cushn.backup.export, []);
}

/** `mutate()` → `{ status: "opened", token, summary }` or `{ status: "canceled" }`; writes nothing. */
export function useOpenBackup() {
  return useInvalidatingMutation(cushn.backup.open, []);
}

/** `mutate({ token, mode })` → `{ counts, safetyCopyPath }`; an import refreshes every query and forgets the undo history. */
export function useImportBackup() {
  const queryClient = useQueryClient();
  return useInvalidatingMutation(async (args: ArgsOf<"backup", "import">) => {
    const result = await cushn.backup.import(args);
    // The history's entries point at rows the import replaced.
    undoHistory.clear();
    // Unmounted queries may point at rows the import removed; refetching them would only retry NOT_FOUND.
    queryClient.removeQueries({ type: "inactive" });
    await invalidateRoots(queryClient, ALL_QUERY_ROOTS);
    return result;
  }, []);
}
