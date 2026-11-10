import { z } from "zod";
import * as settings from "../../repositories/settings";
import { defineTool } from "../tool";

const getSettings = defineTool({
  kind: "read",
  name: "get_settings",
  description:
    "Returns the user's settings: { settings } with currency (the default ISO 4217 code for " +
    'new budgets, such as "usd"), budgetView (the budgets page layout, grid or list) and theme ' +
    "(light or dark). Read only: agents cannot change settings.",
  input: z.object({}),
  run: ({ db }) => settings.get(db),
});

export const settingsTools = [getSettings];
