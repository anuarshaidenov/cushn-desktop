import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { refetchOnMainChanges } from "./data/mainChanges";
import { applySidebarTransparent, isSidebarTransparent } from "./lib/sidebarTransparency";
import { applyTheme, getStartupTheme } from "./lib/theme";
import { queryClient, router } from "./router";
import "./styles.css";

// Before the first render, so nothing paints in the wrong theme.
applyTheme(getStartupTheme());
applySidebarTransparent(isSidebarTransparent());

refetchOnMainChanges(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
