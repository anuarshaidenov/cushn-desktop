/**
 * Settings: the single `user_settings` row (id 1), in UI terms.
 *
 * - `seedDatabase` ensures the row on every open, so `get` always finds it.
 * - `dark_mode` NULL (never chosen) reads as the light theme, today's default.
 */
import { eq } from "drizzle-orm";
import type { ArgsOf, MethodName, ResultOf } from "@shared/api";
import { CushnError } from "@shared/errors";
import type { AppDatabase } from "../db";
import { type NewUserSettingsRow, userSettings } from "../db/schema";

type Args<M extends MethodName<"settings">> = ArgsOf<"settings", M>;
type Result<M extends MethodName<"settings">> = ResultOf<"settings", M>;

const SETTINGS_ROW_ID = 1;

export function get(db: AppDatabase): Result<"get"> {
  const row = db
    .select({
      currency: userSettings.currency,
      budgetView: userSettings.budgetView,
      darkMode: userSettings.darkMode,
    })
    .from(userSettings)
    .where(eq(userSettings.id, SETTINGS_ROW_ID))
    .get();
  if (!row) throw new CushnError("INTERNAL", "Settings are missing");
  const { darkMode, ...rest } = row;
  return { settings: { ...rest, theme: darkMode ? "dark" : "light" } };
}

export function update(
  db: AppDatabase,
  { currency, budgetView, theme }: Args<"update">,
): Result<"update"> {
  const values: Partial<NewUserSettingsRow> = {};
  if (currency !== undefined) values.currency = currency;
  if (budgetView !== undefined) values.budgetView = budgetView;
  if (theme !== undefined) values.darkMode = theme === "dark";
  // Drizzle rejects an empty SET; nothing to patch is still a success.
  if (Object.keys(values).length === 0) return { success: true };
  return db.transaction((tx) => {
    tx.update(userSettings).set(values).where(eq(userSettings.id, SETTINGS_ROW_ID)).run();
    return { success: true };
  });
}
