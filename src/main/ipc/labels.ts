import { z } from "zod";
import * as labels from "../repositories/labels";
import { type CushnHandlers, noArgs } from "./handler";
import { id } from "./schemas";

export const labelHandlers: CushnHandlers["labels"] = {
  list: {
    args: noArgs,
    run: ({ db }) => labels.list(db),
  },
  create: {
    args: z.object({ name: z.string(), color: z.string() }),
    run: ({ db }, args) => labels.create(db, args),
  },
  updateColor: {
    args: z.object({ labelId: id("budgetLabels"), color: z.string() }),
    run: ({ db }, args) => labels.updateColor(db, args),
  },
  updateName: {
    args: z.object({ labelId: id("budgetLabels"), name: z.string() }),
    run: ({ db }, args) => labels.updateName(db, args),
  },
  delete: {
    args: z.object({ labelId: id("budgetLabels") }),
    run: ({ db }, args) => labels.delete(db, args),
  },
};
