import { z } from "zod";
import * as home from "../../repositories/home";
import { defineTool } from "../tool";

const getHomeSummary = defineTool({
  kind: "read",
  name: "get_home_summary",
  description:
    "Returns the app's home page: an overview of the active budgets, ordered by last activity " +
    "(the newest of the budget's creation and its latest expense). main is the most recently " +
    "active budget with income, spent, every allocation's amount and spent, and its 5 biggest " +
    "expenses, or null with no active budget; others are the next 4 budgets with income and " +
    "spent; overspent lists every allocation of an active budget whose spent exceeds its " +
    "amount. Each money value is in major units of its own budget's currency; nothing is " +
    "summed or converted across budgets.",
  input: z.object({}),
  run: ({ db }) => home.summary(db),
});

export const homeTools = [getHomeSummary];
