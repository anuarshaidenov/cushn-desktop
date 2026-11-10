import { cn } from "@/lib/utils";
import { SidebarTrigger, useSidebar } from "./sidebar";

type Props = {
  children?: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  displayTrigger?: boolean;
};

export const DashboardHeaderWrapper = (props: Props) => {
  const { open, isMobile } = useSidebar();
  const Component = props.as || "header";
  const displayTrigger = props.displayTrigger ?? true;
  const atWindowEdge = (!open || isMobile) && displayTrigger;

  return (
    <Component
      className={cn(
        "flex h-12 items-center border-b px-4 py-2",
        // Sticky for pages that scroll the whole panel (settings).
        displayTrigger &&
          "app-drag bg-background sticky top-0 z-10 rounded-t-xl",
        atWindowEdge && "pl-[env(titlebar-area-x,1rem)]",
        props.className,
      )}
    >
      {atWindowEdge && (
        <SidebarTrigger className="mr-2" />
      )}
      {props.children}
    </Component>
  );
};
