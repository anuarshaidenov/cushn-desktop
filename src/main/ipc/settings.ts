import { z } from "zod";
import { THEMES } from "@shared/api";
import { BUDGET_LAYOUTS } from "@shared/domain";
import * as settings from "../repositories/settings";
import { type CushnHandlers, noArgs } from "./handler";

export const settingsHandlers: CushnHandlers["settings"] = {
  get: {
    args: noArgs,
    run: ({ db }) => settings.get(db),
  },
  update: {
    args: z.object({
      currency: z.string().min(1).optional(),
      budgetView: z.enum(BUDGET_LAYOUTS).optional(),
      theme: z.enum(THEMES).optional(),
    }),
    run: ({ db }, args) => settings.update(db, args),
  },
};
