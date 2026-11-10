import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Id } from "@shared/domain";
import { cushn } from "./client";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";

/** Query option factories, for route loaders. */
export const templateQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.templates.list(),
      queryFn: () => cushn.templates.list(),
    }),
  detail: (templateId: Id<"templates">) =>
    queryOptions({
      queryKey: queryKeys.templates.detail(templateId),
      queryFn: () => cushn.templates.get({ templateId }),
    }),
};

/** `{ templates }`: user templates first, then built-ins, each in creation order. */
export function useTemplates() {
  return useQuery(templateQueries.list());
}

export function useSuspenseTemplates() {
  return useSuspenseQuery(templateQueries.list());
}

/** `{ template }` with its categories in order. Fails with NOT_FOUND when it does not exist. */
export function useTemplate(templateId: Id<"templates">) {
  return useQuery(templateQueries.detail(templateId));
}

export function useSuspenseTemplate(templateId: Id<"templates">) {
  return useSuspenseQuery(templateQueries.detail(templateId));
}

/** Fails with BAD_REQUEST unless the percentages, summed and rounded to cents, equal 100. */
export function useCreateTemplate() {
  return useInvalidatingMutation(cushn.templates.create, ["templates"]);
}

/** Same 100% check as create. FORBIDDEN on a built-in template. */
export function useUpdateTemplate() {
  return useInvalidatingMutation(cushn.templates.update, ["templates", "budgets"]);
}

/** FORBIDDEN on a built-in. Its budgets stay, with `templateId: null`. */
export function useDeleteTemplate() {
  return useInvalidatingMutation(cushn.templates.delete, ["templates", "budgets"]);
}

/** → `{ newTemplateId }`. Works on built-ins too. */
export function useDuplicateTemplate() {
  return useInvalidatingMutation(cushn.templates.duplicate, ["templates"]);
}
