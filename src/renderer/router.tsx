import { createHashHistory, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { DefaultCatchBoundary } from "./components/DefaultCatchBoundary";
import { restoreLastPage, trackLastPage } from "./lib/lastPage";
import { trackNavigation } from "./lib/navigationStack";

export const queryClient = new QueryClient();

restoreLastPage();
// The packaged app loads from file://, so routes live in the URL hash.
const history = createHashHistory();
const navigationTracker = trackNavigation(history);
trackLastPage(history);

export const router = createRouter({
  routeTree,
  history,
  context: { queryClient, navigationTracker },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
  defaultErrorComponent: DefaultCatchBoundary,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
