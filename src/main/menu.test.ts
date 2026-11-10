import type { MenuItemConstructorOptions } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEBSITE_URL, menuTemplate } from "./menu";

type Item = MenuItemConstructorOptions;

let openExternal: ReturnType<typeof vi.fn<(url: string) => void>>;

function template(platform: NodeJS.Platform, isPackaged = true): Item[] {
  return menuTemplate({ platform, isPackaged, openExternal });
}

const submenu = (item: Item): Item[] => (Array.isArray(item.submenu) ? item.submenu : []);

/** Every item, submenus included, depth first. */
const allItems = (menu: Item[]): Item[] =>
  menu.flatMap((item) => [item, ...allItems(submenu(item))]);

const roles = (menu: Item[]) => allItems(menu).flatMap((item) => (item.role ? [item.role] : []));

beforeEach(() => {
  openExternal = vi.fn<(url: string) => void>();
});

describe("on macOS", () => {
  it("has the app, Edit, View, Window and Help menus", () => {
    expect(template("darwin").map((menu) => menu.label ?? menu.role)).toEqual([
      "Cushn",
      "editMenu",
      "View",
      "windowMenu",
      "help",
    ]);
  });

  it("puts About, Services, Hide, Hide Others, Show All and Quit in the app menu", () => {
    expect(roles(submenu(template("darwin")[0]))).toEqual([
      "about",
      "services",
      "hide",
      "hideOthers",
      "unhide",
      "quit",
    ]);
  });

  it("keeps Close in the Window menu, as there is no File menu", () => {
    const windowMenu = template("darwin").find((menu) => menu.role === "windowMenu");
    expect(roles(submenu(windowMenu!))).toEqual(["close", "minimize", "zoom", "front"]);
  });
});

describe.each<NodeJS.Platform>(["win32", "linux"])("on %s", (platform) => {
  it("has no app menu, and File holds Quit", () => {
    expect(template(platform).map((menu) => menu.label ?? menu.role)).toEqual([
      "fileMenu",
      "editMenu",
      "View",
      "windowMenu",
      "help",
    ]);
  });
});

describe.each<NodeJS.Platform>(["darwin", "win32", "linux"])("on %s", (platform) => {
  it("offers Reload and Toggle Developer Tools only in a development build", () => {
    expect(roles(template(platform))).not.toContain("reload");
    expect(roles(template(platform))).not.toContain("toggleDevTools");
    expect(roles(template(platform, false))).toEqual(
      expect.arrayContaining(["reload", "toggleDevTools", "togglefullscreen"]),
    );
  });

  it("keeps the Edit roles, so copy and paste work in text fields", () => {
    expect(roles(template(platform))).toContain("editMenu");
  });

  it("leaves every key to the roles' defaults, so none is taken from the page's hotkeys", () => {
    const own = allItems(template(platform, false)).filter((item) => item.accelerator);
    expect(own).toEqual([]);
  });

  it("opens the website from Help", () => {
    const website = allItems(template(platform)).find((item) => item.label === "Cushn Website");
    (website?.click as () => void)();

    expect(openExternal).toHaveBeenCalledWith(WEBSITE_URL);
  });
});
