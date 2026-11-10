import {
  useRouter,
  type MakeRouteMatch,
  type RegisteredRouter,
  type RouteIds,
} from "@tanstack/react-router";
import { useEffect } from "react";
import {
  isOtherPage,
  type NavigationPredicate,
  type NavigationTracker,
} from "@/lib/navigationStack";
import { stripFromViewId } from "@/lib/budgetListSearch";
import { isEditableEventTarget } from "@/lib/utils";

type RouteTree = RegisteredRouter["routeTree"];
type RouteId = RouteIds<RouteTree>;

type EscapeContext<TId extends RouteId> = {
  router: RegisteredRouter;
  match: MakeRouteMatch<RouteTree, TId>;
  /** Goes back to the nearest earlier history entry matching `predicate`; false if none is known. */
  goBackTo: (predicate: NavigationPredicate) => boolean;
};

type EscapeRule<TId extends RouteId> = (context: EscapeContext<TId>) => void;

/** The deepest matched route with a rule handles Escape; without one, Escape does nothing. */
const escapeRules: { [TId in RouteId]?: EscapeRule<TId> } = {
  "/dashboard/$budgetId": ({ router, match, goBackTo }) => {
    if (goBackTo(isOtherPage)) return;
    const { fromViewId } = match.search;
    const search = stripFromViewId(match.search);
    if (fromViewId) {
      router.navigate({
        to: "/dashboard/views/$id",
        params: { id: fromViewId },
        search,
        replace: true,
      });
    } else {
      router.navigate({ to: "/dashboard", search, replace: true });
    }
  },
  "/dashboard/views/$id": ({ router, goBackTo }) => {
    if (goBackTo(isOtherPage)) return;
    router.navigate({ to: "/dashboard/views", replace: true });
  },
  "/settings": ({ router, goBackTo }) => {
    if (goBackTo((entry) => !entry.pathname.startsWith("/settings"))) return;
    router.navigate({ to: "/dashboard/home", replace: true });
  },
  "/settings/template/new": ({ router, goBackTo }) => {
    if (goBackTo(isOtherPage)) return;
    router.navigate({ to: "/settings/templates", replace: true });
  },
  "/settings/template/$templateId": ({ router, goBackTo }) => {
    if (goBackTo(isOtherPage)) return;
    router.navigate({ to: "/settings/templates", replace: true });
  },
};

// Escape in a text field stays there, so a half-typed draft is not lost, unless the field is marked
// `data-escape-navigates` (fields that save as you type).
function keepsEscape(target: EventTarget | null): boolean {
  return (
    isEditableEventTarget(target) &&
    (target as HTMLElement).closest("[data-escape-navigates]") === null
  );
}

// Components that consume an Escape call `event.preventDefault()`. This listener sits on the window
// in the bubble phase, after React handlers and document listeners (Base UI layers, TanStack Hotkeys).
function isUnclaimedEscape(event: KeyboardEvent): boolean {
  return (
    event.key === "Escape" &&
    !event.defaultPrevented &&
    !event.repeat &&
    !event.isComposing &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !keepsEscape(event.target)
  );
}

export function useEscapeNavigation(tracker: NavigationTracker) {
  const router = useRouter();

  useEffect(() => {
    const goBackTo = (predicate: NavigationPredicate) => {
      const steps = tracker.stepsBackTo(predicate);
      if (steps === undefined) return false;
      router.history.go(-steps);
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isUnclaimedEscape(event)) return;
      const matches = router.state.matches;
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        // TS cannot tie the rule picked by `match.routeId` back to that same match.
        const rule = escapeRules[match.routeId] as
          EscapeRule<typeof match.routeId> | undefined;
        if (!rule) continue;
        event.preventDefault();
        rule({ router, match, goBackTo });
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, tracker]);
}
