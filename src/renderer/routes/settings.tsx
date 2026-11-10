import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AddBudgetDialog } from "@/components/AddBudgetDialog";
import { useGlobalKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { Command } from "@/components/Command";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";

export const Route = createFileRoute("/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  useGlobalKeyboardShortcuts();

  return (
    <SidebarProvider
      defaultOpen={true}
      className="bg-sidebar vibrant:bg-transparent h-full p-1"
    >
      <SettingsSidebar />
      <div className="bg-background h-full min-w-0 flex-1 rounded-xl shadow-(--custom-shadow-raised)">
        <main className="h-full overflow-scroll">
          <Outlet />
        </main>
      </div>
      <AddBudgetDialog />
      <Command />
      <ShortcutsDialog />
    </SidebarProvider>
  );
}
