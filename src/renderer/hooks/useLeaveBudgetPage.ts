import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { stripFromViewId } from "@/lib/budgetListSearch";

/** Leaves the open budget for where its breadcrumb points: the view it was opened from, or the dashboard. */
export const useLeaveBudgetPage = () => {
  const search = useSearch({ from: "/dashboard/$budgetId" });
  const navigate = useNavigate();

  return useCallback(() => {
    if (search.fromViewId) {
      navigate({
        to: "/dashboard/views/$id",
        params: { id: search.fromViewId },
        search: stripFromViewId(search),
        replace: true,
      });
    } else {
      navigate({
        to: "/dashboard",
        search: stripFromViewId(search),
        replace: true,
      });
    }
  }, [navigate, search]);
};
