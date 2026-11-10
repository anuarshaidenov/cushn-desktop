/**
 * The handler for every contract method, one handler object per domain. A new
 * domain can start as `notImplemented("<domain>")` (from `./handler`), which
 * answers NOT_IMPLEMENTED for each of its methods until its repository lands.
 */
import type { AgentService } from "../agents/service";
import type { Rates } from "../repositories/rates";
import type { Updater } from "../updater";
import type { CushnHandlers } from "./handler";
import { createAgentHandlers } from "./agents";
import { type BackupDependencies, createBackupHandlers } from "./backup";
import { createBudgetHandlers } from "./budgets";
import { expenseHandlers } from "./expenses";
import { type FileDependencies, createFiles } from "./files";
import { homeHandlers } from "./home";
import { labelHandlers } from "./labels";
import { onboardingHandlers } from "./onboarding";
import { createRatesHandlers } from "./rates";
import { templateHandlers } from "./templates";
import { createUpdateHandlers } from "./updates";
import { viewHandlers } from "./views";
import { settingsHandlers } from "./settings";

export interface HandlerDependencies {
  backup: BackupDependencies;
  files: FileDependencies;
  rates: Rates;
  agents: AgentService;
  updater: Updater;
}

export function createHandlers(deps: HandlerDependencies): CushnHandlers {
  const files = createFiles(deps.files);
  return {
    labels: labelHandlers,
    views: viewHandlers,
    templates: templateHandlers,
    expenses: expenseHandlers,
    budgets: createBudgetHandlers(files),
    home: homeHandlers,
    settings: settingsHandlers,
    onboarding: onboardingHandlers,
    backup: createBackupHandlers(deps.backup),
    files: files.handlers,
    rates: createRatesHandlers(deps.rates),
    agents: createAgentHandlers(deps.agents),
    updates: createUpdateHandlers(deps.updater),
  };
}
