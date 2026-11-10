/**
 * The application menu, in place of Electron's default, which offers Reload and Toggle Developer
 * Tools in every build and points About and Help at Electron. Every key is a role's own default,
 * one Electron's default menu already had, so no key moves between the page's hotkeys
 * (`src/renderer/lib/hotkeys.ts`) and the menu. Electron-free: `index.ts` builds the menu.
 */
import type { MenuItemConstructorOptions } from "electron";
import { APP_NAME } from "@shared/app";

/** The site that serves `cushn.org/changelog` (the renderer's `changelogUrl`). */
export const WEBSITE_URL = "https://cushn.org";

export interface MenuOptions {
  platform: NodeJS.Platform;
  /** A development build adds Reload and Toggle Developer Tools. */
  isPackaged: boolean;
  openExternal(url: string): void;
}

export function menuTemplate({
  platform,
  isPackaged,
  openExternal,
}: MenuOptions): MenuItemConstructorOptions[] {
  const developer: MenuItemConstructorOptions[] = isPackaged
    ? []
    : [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }];
  const view: MenuItemConstructorOptions = {
    label: "View",
    submenu: [...developer, { role: "togglefullscreen" }],
  };
  const help: MenuItemConstructorOptions = {
    role: "help",
    submenu: [{ label: `${APP_NAME} Website`, click: () => openExternal(WEBSITE_URL) }],
  };

  // Hidden behind Alt by `autoHideMenuBar`; File holds Quit, which macOS keeps in the app menu.
  if (platform !== "darwin") {
    return [{ role: "fileMenu" }, { role: "editMenu" }, view, { role: "windowMenu" }, help];
  }

  // Labels name the app explicitly: the roles' own use `app.name`, the package name in development.
  return [
    {
      label: APP_NAME,
      submenu: [
        { role: "about", label: `About ${APP_NAME}` },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide", label: `Hide ${APP_NAME}` },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: `Quit ${APP_NAME}` },
      ],
    },
    { role: "editMenu" },
    view,
    {
      // No File menu, so Close (⌘W) lives here, as in apps without documents.
      role: "windowMenu",
      submenu: [
        { role: "close" },
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
    help,
  ];
}
