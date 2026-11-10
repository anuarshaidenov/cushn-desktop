import { cn } from "@/lib/utils";

type Props = {
  children?: React.ReactNode;
  size?: "sm" | "default";
  className?: string;
};

export const DashboardContainer = (props: Props) => {
  return (
    <div
      className={cn("mx-auto p-4 md:p-10", props.className, {
        container: props.size === "default" || !props.size,
        "max-w-3xl": props.size === "sm",
      })}
    >
      {props.children}
    </div>
  );
};
