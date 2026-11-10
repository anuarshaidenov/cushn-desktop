/**
 * Home: a read-only summary of the active budgets for the home page; trashed
 * budgets never count.
 *
 * - Budgets are ordered by last activity: `max(createdAt, newest expense's
 *   createdAt)`, ties by creation order (newest first). The first is `main`.
 * - Every money value stays in its own budget's currency; spent totals are
 *   rounded with `roundMoney` and never summed across budgets.
 * - Three queries in one read transaction, so the parts agree.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  HomeAllocation,
  HomeBudget,
  HomeExpense,
  HomeOverspentAllocation,
  HomeSummary,
} from "@shared/api";
import type { Id } from "@shared/domain";
import { roundMoney } from "@shared/money";
import type { AppDatabase } from "../db";
import { budgetAllocations, budgets, expenses } from "../db/schema";

const OTHER_BUDGETS_LIMIT = 4;
const BIGGEST_EXPENSES_LIMIT = 5;

type Reader = Pick<AppDatabase, "select">;

export function summary(db: AppDatabase): HomeSummary {
  return db.transaction((tx) => {
    const activeBudgets = activeBudgetsByActivity(tx);
    const allocationsByBudget = activeAllocationsByBudget(tx);
    const allocationsOf = (budgetId: Id<"budgets">) => allocationsByBudget.get(budgetId) ?? [];

    const [main, ...rest] = activeBudgets;
    const overspent = activeBudgets.flatMap((budget) =>
      allocationsOf(budget.id)
        .filter((allocation) => allocation.spent > allocation.amount)
        .map((allocation): HomeOverspentAllocation => ({
          ...allocation,
          budgetId: budget.id,
          budgetTitle: budget.title,
          currency: budget.currency,
        })),
    );

    return {
      main: main
        ? {
            ...main,
            allocations: allocationsOf(main.id),
            biggestExpenses: biggestExpenses(tx, main.id),
          }
        : null,
      others: rest.slice(0, OTHER_BUDGETS_LIMIT),
      overspent,
    };
  });
}

/** Every active budget with its spent total, newest activity first. */
function activeBudgetsByActivity(db: Reader): HomeBudget[] {
  const lastActivityAt = sql<number>`max(${budgets.createdAt}, coalesce(max(${expenses.createdAt}), 0))`;
  return db
    .select({
      id: budgets.id,
      title: budgets.title,
      currency: budgets.currency,
      income: budgets.income,
      spent: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
      lastActivityAt,
    })
    .from(budgets)
    .leftJoin(expenses, eq(expenses.budgetId, budgets.id))
    .where(and(eq(budgets.status, "active"), isNull(budgets.deletedAt)))
    .groupBy(budgets.id)
    .orderBy(desc(lastActivityAt), desc(budgets.createdAt), desc(budgets.id))
    .all()
    .map((budget) => ({ ...budget, spent: roundMoney(budget.spent) }));
}

/** Allocations of active budgets with their spent totals, by budget, in display order. */
function activeAllocationsByBudget(db: Reader): Map<Id<"budgets">, HomeAllocation[]> {
  const rows = db
    .select({
      budgetId: budgetAllocations.budgetId,
      id: budgetAllocations.id,
      categoryName: budgetAllocations.categoryName,
      amount: budgetAllocations.amount,
      spent: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
    })
    .from(budgetAllocations)
    .innerJoin(
      budgets,
      and(
        eq(budgets.id, budgetAllocations.budgetId),
        eq(budgets.status, "active"),
        isNull(budgets.deletedAt),
      ),
    )
    .leftJoin(expenses, eq(expenses.allocationId, budgetAllocations.id))
    .groupBy(budgetAllocations.id)
    .orderBy(
      asc(budgetAllocations.sortOrder),
      asc(budgetAllocations.createdAt),
      asc(budgetAllocations.id),
    )
    .all();

  const byBudget = new Map<Id<"budgets">, HomeAllocation[]>();
  for (const { budgetId, spent, ...allocation } of rows) {
    const list = byBudget.get(budgetId) ?? [];
    list.push({ ...allocation, spent: roundMoney(spent) });
    byBudget.set(budgetId, list);
  }
  return byBudget;
}

function biggestExpenses(db: Reader, budgetId: Id<"budgets">): HomeExpense[] {
  return db
    .select({
      id: expenses.id,
      title: expenses.title,
      amount: expenses.amount,
      categoryName: budgetAllocations.categoryName,
    })
    .from(expenses)
    .innerJoin(budgetAllocations, eq(budgetAllocations.id, expenses.allocationId))
    .where(eq(expenses.budgetId, budgetId))
    .orderBy(desc(expenses.amount), desc(expenses.createdAt), desc(expenses.id))
    .limit(BIGGEST_EXPENSES_LIMIT)
    .all();
}
