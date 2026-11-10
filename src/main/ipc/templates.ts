import { z } from "zod";
import * as templates from "../repositories/templates";
import { type CushnHandlers, noArgs } from "./handler";
import { id } from "./schemas";

const templateId = z.object({ templateId: id("templates") });

const category = z.object({
  name: z.string(),
  percentage: z.number(),
  description: z.string().nullish(),
  editable: z.boolean(),
});

export const templateHandlers: CushnHandlers["templates"] = {
  list: {
    args: noArgs,
    run: ({ db }) => templates.list(db),
  },
  get: {
    args: templateId,
    run: ({ db }, args) => templates.get(db, args),
  },
  create: {
    args: z.object({
      name: z.string(),
      description: z.string().nullish(),
      categories: z.array(category),
    }),
    run: ({ db }, args) => templates.create(db, args),
  },
  update: {
    args: z.object({
      templateId: id("templates"),
      name: z.string(),
      description: z.string().nullish(),
      categories: z.array(category.extend({ id: id("templateCategories").optional() })),
    }),
    run: ({ db }, args) => templates.update(db, args),
  },
  delete: {
    args: templateId,
    run: ({ db }, args) => templates.delete(db, args),
  },
  duplicate: {
    args: templateId,
    run: ({ db }, args) => templates.duplicate(db, args),
  },
};
