import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CushnError } from "@shared/errors";
import { type UndoEntry, undoHistory } from "@/lib/undo";
import type { QueryRoot } from "./keys";
import { invalidateRoots } from "./mutation";

export interface UndoableResult<TResult> {
  result: TResult;
  /** The history entry, so a toast's Undo acts on this action and no other. */
  entry: UndoEntry;
}

export interface UndoSpec<TArgs, TResult> {
  label: (args: TArgs, result: TResult) => string;
  inverse: (args: TArgs, result: TResult) => Promise<unknown>;
}

/** `useInvalidatingMutation` that also records the action in the undo history; redo replays it and keeps the new result for the next undo. */
export function useUndoableMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
  invalidates: readonly QueryRoot[],
  { label, inverse }: UndoSpec<TArgs, TResult>,
): UseMutationResult<UndoableResult<TResult>, CushnError, TArgs> {
  const queryClient = useQueryClient();
  return useMutation<UndoableResult<TResult>, CushnError, TArgs>({
    mutationFn: async (args) => {
      let result = await mutationFn(args);
      await invalidateRoots(queryClient, invalidates);
      const entry = undoHistory.push({
        label: label(args, result),
        undo: async () => {
          try {
            await inverse(args, result);
          } finally {
            await invalidateRoots(queryClient, invalidates);
          }
        },
        redo: async () => {
          try {
            result = await mutationFn(args);
          } finally {
            await invalidateRoots(queryClient, invalidates);
          }
        },
      });
      return { result, entry };
    },
  });
}
