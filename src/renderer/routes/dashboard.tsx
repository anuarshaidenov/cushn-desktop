import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AddBudgetDialog } from "@/components/AddBudgetDialog";
import { useGlobalKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { Command } from "@/components/Command";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  useGlobalKeyboardShortcuts();

  return (
    <SidebarProvider
      defaultOpen={localStorage.getItem("sidebar_state") !== "collapsed"}
      className="bg-sidebar vibrant:bg-transparent h-full p-1"
    >
      <AppSidebar />
      <div className="bg-background h-full min-w-0 flex-1 rounded-xl shadow-(--custom-shadow-raised)">
        <main className="h-full">
          <Outlet />
        </main>
      </div>
      <Command />
      <ShortcutsDialog />
      <AddBudgetDialog />
    </SidebarProvider>
  );
}
