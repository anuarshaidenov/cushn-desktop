import type { CushnTool } from "../tool";
import { budgetTools } from "./budgets";
import { expenseTools } from "./expenses";
import { homeTools } from "./home";
import { labelTools } from "./labels";
import { rateTools } from "./rates";
import { settingsTools } from "./settings";
import { templateTools } from "./templates";
import { viewTools } from "./views";

/** Every tool the Cushn MCP server registers, in the order clients list them. */
export const cushnTools: readonly CushnTool[] = [
  ...homeTools,
  ...budgetTools,
  ...expenseTools,
  ...labelTools,
  ...templateTools,
  ...viewTools,
  ...settingsTools,
  ...rateTools,
];
