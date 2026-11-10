import { z } from "zod";
import * as views from "../../repositories/views";
import { defineTool } from "../tool";

const listViews = defineTool({
  kind: "read",
  name: "list_views",
  description:
    "Lists every View, newest first: { views }, each with id, title, description, isFavorite " +
    "(shown in the app's sidebar) and createdAt. A View is a user-made folder of budgets; a " +
    "budget is in zero or one (its viewId). list_budgets takes a viewId to list one View's " +
    "budgets; set_budget_view moves a budget.",
  input: z.object({}),
  run: ({ db }) => views.list(db),
});

export const viewTools = [listViews];
