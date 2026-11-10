import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ActiveBudgetFilters, BudgetListFilters } from "@shared/api";
import type { Id } from "@shared/domain";
import { cushn } from "./client";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";
import { pagedQueryOptions, usePaginatedQuery } from "./pagination";
import { useUndoableMutation } from "./undoable";

export interface PageSizeOption {
  /** Items per page, fixed for the hook instance. */
  pageSize: number;
}

/** Query option factories, for route loaders. */
export const budgetQueries = {
  active: (filters: ActiveBudgetFilters, { pageSize }: PageSizeOption) =>
    pagedQueryOptions({
      queryKey: queryKeys.budgets.active(filters, pageSize),
      fetchPage: (page) => cushn.budgets.listActive({ ...filters, ...page }),
      pageSize,
    }),
  archived: (filters: BudgetListFilters, { pageSize }: PageSizeOption) =>
    pagedQueryOptions({
      queryKey: queryKeys.budgets.archived(filters, pageSize),
      fetchPage: (page) => cushn.budgets.listArchived({ ...filters, ...page }),
      pageSize,
    }),
  trashed: ({ pageSize }: PageSizeOption) =>
    pagedQueryOptions({
      queryKey: queryKeys.budgets.trashed(pageSize),
      fetchPage: (page) => cushn.budgets.listTrashed(page),
      pageSize,
    }),
  detail: (budgetId: Id<"budgets">) =>
    queryOptions({
      queryKey: queryKeys.budgets.detail(budgetId),
      queryFn: () => cushn.budgets.get({ budgetId }),
    }),
  latest: () =>
    queryOptions({
      queryKey: queryKeys.budgets.latest(),
      queryFn: () => cushn.budgets.getLatest(),
    }),
};

/** Active budgets, filtered, searched and sorted; errors go to the nearest error boundary. */
export function useActiveBudgets(filters: ActiveBudgetFilters, options: PageSizeOption) {
  return usePaginatedQuery(budgetQueries.active(filters, options));
}

/** Archived budgets from every View (items carry no `viewId`); same shape as `useActiveBudgets`. */
export function useArchivedBudgets(filters: BudgetListFilters, options: PageSizeOption) {
  return usePaginatedQuery(budgetQueries.archived(filters, options));
}

/** Trashed budgets, most recently deleted first; each keeps the `status` that `restore` returns it to. */
export function useTrashedBudgets(options: PageSizeOption) {
  return usePaginatedQuery(budgetQueries.trashed(options));
}

/** `{ budget, allocations }` whatever its status (a trashed budget reads as missing); a missing budget gives `{ budget: null, allocations: [] }`. */
export function useBudget(budgetId: Id<"budgets">) {
  return useQuery(budgetQueries.detail(budgetId));
}

/** `{ latestBudget }`: the newest active budget or `null`. */
export function useLatestBudget() {
  return useQuery(budgetQueries.latest());
}

/** → `{ budgetId }`. Copies the template's categories into allocations. */
export function useCreateBudget() {
  return useInvalidatingMutation(cushn.budgets.create, ["budgets", "home"]);
}

/** Patches only the given fields; a new `income` recomputes allocations. Expenses refresh: their DTOs carry the currency. */
export function useUpdateBudget() {
  return useInvalidatingMutation(cushn.budgets.update, ["budgets", "expenses", "home"]);
}

/** Sets the income and recomputes every allocation amount. */
export function useUpdateBudgetIncome() {
  return useInvalidatingMutation(cushn.budgets.updateIncome, ["budgets", "home"]);
}

/** The budgets an undoable action works on; titles only name the history entry. */
export interface BudgetSelection {
  budgets: { id: Id<"budgets">; title: string }[];
}

const budgetIds = ({ budgets }: BudgetSelection) => ({
  budgetIds: budgets.map((budget) => budget.id),
});

const describe = (verb: string, { budgets }: BudgetSelection) =>
  budgets.length === 1
    ? `${verb} “${budgets[0].title}”`
    : `${verb} ${budgets.length} budgets`;

const archive = (selection: BudgetSelection) =>
  selection.budgets.length === 1
    ? cushn.budgets.archive({ budgetId: selection.budgets[0].id })
    : cushn.budgets.archiveMany(budgetIds(selection));

const unarchive = (selection: BudgetSelection) =>
  selection.budgets.length === 1
    ? cushn.budgets.unarchive({ budgetId: selection.budgets[0].id })
    : cushn.budgets.unarchiveMany(budgetIds(selection));

const trash = (selection: BudgetSelection) => cushn.budgets.trash(budgetIds(selection));
const restore = (selection: BudgetSelection) => cushn.budgets.restore(budgetIds(selection));

/** Undoable. One missing id fails the call and archives none. */
export function useArchiveBudgets() {
  return useUndoableMutation(archive, ["budgets", "home"], {
    label: (selection) => describe("Archive", selection),
    inverse: unarchive,
  });
}

/** Undoable. */
export function useUnarchiveBudgets() {
  return useUndoableMutation(unarchive, ["budgets", "home"], {
    label: (selection) => describe("Unarchive", selection),
    inverse: archive,
  });
}

/** Undoable. Moves to the trash, purged after `TRASH_RETENTION_DAYS`. */
export function useTrashBudgets() {
  return useUndoableMutation(trash, ["budgets", "home"], {
    label: (selection) => describe("Delete", selection),
    inverse: restore,
  });
}

/** Undoable. Takes out of the trash, back to the status the budget had. */
export function useRestoreBudgets() {
  return useUndoableMutation(restore, ["budgets", "home"], {
    label: (selection) => describe("Restore", selection),
    inverse: trash,
  });
}

/** → `{ deletedCount }`. Hard-deletes every trashed budget; not undoable. */
export function useEmptyTrash() {
  return useInvalidatingMutation(cushn.budgets.emptyTrash, ["budgets", "expenses", "home"]);
}

/** Hard delete, not undoable; allocations and expenses go with the budgets. */
export function useDeleteBudgets() {
  return useInvalidatingMutation(cushn.budgets.deleteMany, ["budgets", "expenses", "home"]);
}

/** `labelId: null` removes the label. */
export function useSetBudgetLabel() {
  return useInvalidatingMutation(cushn.budgets.setLabel, ["budgets"]);
}

/** `viewId: null` removes the budget from its View. */
export function useSetBudgetView() {
  return useInvalidatingMutation(cushn.budgets.setView, ["budgets"]);
}

/** `icon: null` falls back to the placeholder. */
export function useSetBudgetIcon() {
  return useInvalidatingMutation(cushn.budgets.setIcon, ["budgets"]);
}

/** → `{ newBudgetId }`: an active "<title> (Copy)" with every allocation and expense. */
export function useDuplicateBudget() {
  return useInvalidatingMutation(cushn.budgets.duplicate, ["budgets", "home"]);
}

/** `mutate({ budgetId })` → `{ status: "saved", filePath }` or `{ status: "canceled" }`; main shows the save dialog. */
export function useExportBudgetMarkdown() {
  return useInvalidatingMutation(cushn.budgets.exportMarkdown, []);
}
