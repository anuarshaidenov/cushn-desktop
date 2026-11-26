/**
 * Per-budget aggregates over its expenses, as SQL expressions on a `budgets`
 * row: usable in a select, a where or an order by, with no join or group by.
 */
import { sql } from "drizzle-orm";
import { budgets, expenses } from "../db/schema";

// Qualified by hand: in a select list without joins Drizzle writes a bare
// "id", which inside the subquery would name the expense's id.
const outerBudgetId = sql`${budgets}.${sql.identifier(budgets.id.name)}`;

/**
 * When the budget last saw activity: `max(createdAt, newest expense's
 * createdAt)`. Editing an expense doesn't count.
 */
export const budgetLastActivityAt = sql<number>`max(${budgets.createdAt}, coalesce((select max(${expenses.createdAt}) from ${expenses} where ${expenses.budgetId} = ${outerBudgetId}), 0))`;

/** The sum of the budget's expenses, unrounded; 0 without expenses. */
export const budgetSpent = sql<number>`coalesce((select sum(${expenses.amount}) from ${expenses} where ${expenses.budgetId} = ${outerBudgetId}), 0)`;
