import { z } from "zod";
import { id } from "../../ipc/schemas";
import * as templates from "../../repositories/templates";
import { defineTool } from "../tool";

const listTemplates = defineTool({
  kind: "read",
  name: "list_templates",
  description:
    "Lists every template, the user's first, then the built-in ones (isDefault: true): " +
    "{ templates }, each with id, name, description and createdAt, without categories " +
    "(get_template). A template is a named percentage split, such as 50/30/20, that " +
    "create_budget turns into a budget's allocations.",
  input: z.object({}),
  run: ({ db }) => templates.list(db),
});

const getTemplate = defineTool({
  kind: "read",
  name: "get_template",
  description:
    "Returns one template with its categories in order: { template }. Each category has id, " +
    "name, percentage (they sum to 100), description and editable (false: the budget's " +
    "allocation takes no expenses). Budgets keep their own copy, so later template edits never " +
    "change them.",
  input: z.object({ templateId: id("templates").describe("The template's id.") }),
  run: ({ db }, args) => templates.get(db, args),
});

export const templateTools = [listTemplates, getTemplate];
