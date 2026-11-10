import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Id } from "@shared/domain";
import { cushn } from "./client";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";

/** Query option factories, for route loaders. */
export const viewQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.views.list(),
      queryFn: () => cushn.views.list(),
    }),
  favorites: () =>
    queryOptions({
      queryKey: queryKeys.views.favorites(),
      queryFn: () => cushn.views.listFavorites(),
    }),
  detail: (viewId: Id<"budgetViews">) =>
    queryOptions({
      queryKey: queryKeys.views.detail(viewId),
      queryFn: () => cushn.views.get({ viewId }),
    }),
};

/** `{ views }`, newest first. */
export function useViews() {
  return useQuery(viewQueries.list());
}

export function useSuspenseViews() {
  return useSuspenseQuery(viewQueries.list());
}

/** `{ views }`: the favorites (sidebar), newest first. */
export function useFavoriteViews() {
  return useQuery(viewQueries.favorites());
}

/** `{ view }`, or `{ view: null }` when the View does not exist. */
export function useView(viewId: Id<"budgetViews">) {
  return useQuery(viewQueries.detail(viewId));
}

export function useSuspenseView(viewId: Id<"budgetViews">) {
  return useSuspenseQuery(viewQueries.detail(viewId));
}

/** → the new View's id (not wrapped). */
export function useCreateView() {
  return useInvalidatingMutation(cushn.views.create, ["views"]);
}

export function useUpdateView() {
  return useInvalidatingMutation(cushn.views.update, ["views"]);
}

/** → the new `isFavorite`. Fails with BAD_REQUEST past 20 favorites. */
export function useToggleViewFavorite() {
  return useInvalidatingMutation(cushn.views.toggleFavorite, ["views"]);
}

/** Budgets in the View, archived ones too, leave it (`view_id` → NULL). */
export function useDeleteView() {
  return useInvalidatingMutation(cushn.views.delete, ["views", "budgets"]);
}
