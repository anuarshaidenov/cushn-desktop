import { z } from "zod";
import { id } from "../../ipc/schemas";
import * as labels from "../../repositories/labels";
import { defineTool } from "../tool";

const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .describe('A hex colour such as "#F97316".');

const listLabels = defineTool({
  kind: "read",
  name: "list_labels",
  description:
    "Lists every label in creation order: { labels }, each with id, name, color (hex) and " +
    "createdAt. A label is a coloured tag; a budget has zero or one (set_budget_label). Names " +
    "are not unique.",
  input: z.object({}),
  run: ({ db }) => labels.list(db),
});

const createLabel = defineTool({
  kind: "write",
  name: "create_label",
  description:
    "Creates a label. Returns { labelId }. Agents cannot delete labels, so check list_labels " +
    "for an existing one first; the user can delete one in the app.",
  input: z.object({
    name: z.string().min(1).describe("The label's name."),
    color,
  }),
  idempotent: false,
  changes: ["labels"],
  run: ({ db }, args) => labels.create(db, args),
});

const renameLabel = defineTool({
  kind: "write",
  name: "rename_label",
  description:
    "Renames a label; every budget with it shows the new name. Returns { success: true }. Undo " +
    "by renaming it back to its name from list_labels.",
  input: z.object({
    labelId: id("budgetLabels").describe("The label to rename."),
    name: z.string().min(1).describe("Its new name."),
  }),
  idempotent: true,
  changes: ["labels", "budgets"],
  run: ({ db }, args) => labels.updateName(db, args),
});

const setLabelColor = defineTool({
  kind: "write",
  name: "set_label_color",
  description:
    "Changes a label's colour. Returns { success: true }. Undo by setting its previous color " +
    "from list_labels.",
  input: z.object({
    labelId: id("budgetLabels").describe("The label to recolour."),
    color,
  }),
  idempotent: true,
  changes: ["labels", "budgets"],
  run: ({ db }, args) => labels.updateColor(db, args),
});

export const labelTools = [listLabels, createLabel, renameLabel, setLabelColor];
