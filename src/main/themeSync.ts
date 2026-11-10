/**
 * Keeps the native theme on the stored one after `settings.update` and after a
 * backup import (which writes `user_settings` too), so the native chrome and
 * `prefers-color-scheme` follow without a restart. `apply` is the Electron side.
 */
import type { Theme } from "@shared/api";
import type { CushnHandlers } from "./ipc/handler";
import * as settings from "./repositories/settings";

export function withThemeSync(
  handlers: CushnHandlers,
  apply: (theme: Theme) => void,
): CushnHandlers {
  const { update } = handlers.settings;
  const runUpdate: typeof update.run = async (context, args) => {
    const result = await update.run(context, args);
    if (args.theme) apply(args.theme);
    return result;
  };
  const { import: importBackup } = handlers.backup;
  const runImport: typeof importBackup.run = async (context, args) => {
    const result = await importBackup.run(context, args);
    apply(settings.get(context.db).settings.theme);
    return result;
  };
  return {
    ...handlers,
    settings: { ...handlers.settings, update: { ...update, run: runUpdate } },
    backup: { ...handlers.backup, import: { ...importBackup, run: runImport } },
  };
}
