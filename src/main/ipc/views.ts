import { z } from "zod";
import * as views from "../repositories/views";
import { type CushnHandlers, noArgs } from "./handler";
import { id } from "./schemas";

const viewId = z.object({ viewId: id("budgetViews") });

export const viewHandlers: CushnHandlers["views"] = {
  list: {
    args: noArgs,
    run: ({ db }) => views.list(db),
  },
  listFavorites: {
    args: noArgs,
    run: ({ db }) => views.listFavorites(db),
  },
  get: {
    args: viewId,
    run: ({ db }, args) => views.get(db, args),
  },
  create: {
    args: z.object({ title: z.string(), description: z.string().nullish() }),
    run: ({ db }, args) => views.create(db, args),
  },
  update: {
    args: z.object({
      viewId: id("budgetViews"),
      title: z.string().optional(),
      description: z.string().nullish(),
    }),
    run: ({ db }, args) => views.update(db, args),
  },
  toggleFavorite: {
    args: viewId,
    run: ({ db }, args) => views.toggleFavorite(db, args),
  },
  delete: {
    args: viewId,
    run: ({ db }, args) => views.delete(db, args),
  },
};
