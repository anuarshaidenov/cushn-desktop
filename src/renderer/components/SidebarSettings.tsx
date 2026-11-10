import { useState, useSyncExternalStore } from "react";
import { isSidebarTransparent, setSidebarTransparent } from "@/lib/sidebarTransparency";
import { Card, CardContent } from "./ui/card";
import { Switch } from "./ui/switch";

// `styles.css` keeps the sidebar solid under it, so the switch can't take effect.
const reduceTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
const subscribe = (onChange: () => void) => {
  reduceTransparency.addEventListener("change", onChange);
  return () => reduceTransparency.removeEventListener("change", onChange);
};

export const SidebarSettings = () => {
  const [transparent, setTransparent] = useState(isSidebarTransparent);
  const reduced = useSyncExternalStore(subscribe, () => reduceTransparency.matches);

  return (
    <section className="mb-10">
      <h2 className="lg mb-5">Sidebar</h2>
      <Card>
        <CardContent>
          <label className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm">Transparent sidebar</span>
              <span className="text-muted-foreground text-xs">
                {reduced
                  ? "Solid while Reduce transparency is on in System Settings → Accessibility → Display."
                  : "Blur the desktop behind the sidebar. Turn off for a solid one."}
              </span>
            </div>
            <Switch
              checked={transparent && !reduced}
              disabled={reduced}
              aria-label="Transparent sidebar"
              onCheckedChange={(checked) => {
                setTransparent(checked);
                setSidebarTransparent(checked);
              }}
            />
          </label>
        </CardContent>
      </Card>
    </section>
  );
};
