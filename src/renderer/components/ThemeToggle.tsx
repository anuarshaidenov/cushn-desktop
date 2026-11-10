import { useTheme } from "./ThemeProvider";
import { Button } from "./ui/button";

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant={"ghost"}
      size={"sm"}
      onClick={() => {
        setTheme(theme === "light" ? "dark" : "light");
      }}
    >
      {theme === "light" ? (
        <div className="flex items-center gap-2">
          <span className="bg-foreground text-background flex h-5 w-8 items-center justify-start rounded-full px-1.5 text-center align-middle shadow-(--custom-shadow-control-solid)">
            Aa
          </span>
          <span>Dark</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="bg-foreground text-background flex h-5 w-8 items-center justify-start rounded-full px-1.5 text-center align-middle shadow-(--custom-shadow-control-solid)">
            Aa
          </span>
          <span>Light</span>
        </div>
      )}
    </Button>
  );
};
