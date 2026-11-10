import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { Button } from "@/components/ui/button";
import { settingsQueries } from "@/data/settings";
import type { NavigationTracker } from "@/lib/navigationStack";
import { useEscapeNavigation } from "@/hooks/use-escape-navigation";
import { useUndoShortcuts } from "@/hooks/use-undo-shortcuts";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  appHotkeys,
  hotkeyPlatform,
  loadCustomHotkeys,
  saveCustomHotkeys,
} from "@/lib/hotkeys";

export interface RouterContext {
  queryClient: QueryClient;
  navigationTracker: NavigationTracker;
}

// The loader primes the settings, so a saved "list" view shows on first render, not "grid".
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  loader: ({ context }) =>
    context.queryClient
      .ensureQueryData(settingsQueries.get())
      .catch(() => undefined),
  notFoundComponent: () => (
    <div className="flex min-h-svh flex-col items-center justify-center p-4">
      <h1 className="mb-4 text-3xl font-bold">404 - Page Not Found</h1>
      <p className="mb-4 text-center">
        Sorry, the page you are looking for does not exist.
      </p>
      <Button
        render={<Link to="/dashboard" />}
        variant={"secondary"}
        size={"sm"}
      >
        Go dashboard
      </Button>
    </div>
  ),
});

// Read once: a new `customHotkeys` value would replace the bindings the user changed since.
const savedCustomHotkeys = loadCustomHotkeys();

// Base UI layers call `preventDefault()` on keys they handle, such as Escape closing a menu.
const hotkeysDefaults = {
  platform: hotkeyPlatform,
  hotkey: { ignoreDefaultPrevented: true },
};

function RootComponent() {
  return (
    <HotkeysProvider
      appHotkeys={appHotkeys}
      customHotkeys={savedCustomHotkeys}
      onCustomHotkeysChange={saveCustomHotkeys}
      defaultOptions={hotkeysDefaults}
    >
      <RootShortcuts />
      <Suspense fallback={<AppFallback />}>
        <ThemeProvider>
          <Outlet />
          <Onboarding />
        </ThemeProvider>
      </Suspense>
      <Toaster />
    </HotkeysProvider>
  );
}

function RootShortcuts() {
  const { navigationTracker } = Route.useRouteContext();
  useEscapeNavigation(navigationTracker);
  useUndoShortcuts();
  return null;
}

function AppFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}
