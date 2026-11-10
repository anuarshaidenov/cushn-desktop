import { ThemeToggle } from "./ThemeToggle";
import { Card, CardContent } from "./ui/card";
import { ShortcutKeys } from "./ShortcutKeys";

export const ThemeSettings = () => {
  return (
    <section className="mb-10">
      <h2 className="lg mb-5">Interface theme</h2>
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-sm">Theme</span>
              <span className="text-xs text-muted-foreground">
                Set your preferred theme for the application. Press{" "}
                <ShortcutKeys id="theme.toggle" /> to toggle between Light and
                Dark modes.
              </span>
            </div>
            <div>
              <ThemeToggle />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
