/**
 * Pure rendering of a budget into a self-contained Markdown document.
 * Moved from the web app, with its document types replaced by the domain
 * row types. Canonical here.
 *
 * This module is intentionally free of database access: it takes
 * already-fetched rows and returns a string, which keeps it trivially
 * unit-testable and reusable by future exporters.
 */
import type {
  Budget,
  BudgetAllocation,
  BudgetLabel,
  BudgetView,
  Expense,
  Id,
  Template,
} from "./domain";

export interface BudgetMarkdownInput {
  budget: Budget;
  /** `null` once the template is deleted: printed as "Unknown". */
  template: Template | null;
  label: BudgetLabel | null;
  view: BudgetView | null;
  /** In display order. */
  allocations: BudgetAllocation[];
  expenses: Expense[];
}

export interface BudgetMarkdownOutput {
  markdown: string;
  filename: string;
}

/** Build a filesystem-safe slug from a budget title. */
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "budget"
  );
}

/** Format an amount in the budget's currency, falling back to a plain string. */
function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

/** Escape a value so it is safe inside a Markdown table cell. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/** Render a Date.now()-style timestamp as an ISO date (YYYY-MM-DD). */
function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Render a budget (and its allocations/expenses) as a Markdown document.
 *
 * The output leads with a YAML frontmatter block (machine-readable totals)
 * followed by a human-readable overview, summary, allocations table, and all
 * expenses grouped by allocation — enough for an agent (or the user) to reason
 * about the budget without any app context.
 */
export function renderBudgetMarkdown(input: BudgetMarkdownInput): BudgetMarkdownOutput {
  const { budget, template, label, view, allocations } = input;
  const currency = budget.currency;

  // Group expenses by allocation, preserving the user's manual ordering.
  const expenses = [...input.expenses].sort((a, b) => a.order - b.order);
  const expensesByAllocation = new Map<Id<"budgetAllocations">, Expense[]>();
  for (const expense of expenses) {
    const list = expensesByAllocation.get(expense.allocationId) ?? [];
    list.push(expense);
    expensesByAllocation.set(expense.allocationId, list);
  }

  const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const unallocated = budget.income - totalAllocated;
  const remaining = budget.income - totalSpent;

  const lines: string[] = [];

  // ── YAML frontmatter (machine-readable) ──
  lines.push("---");
  lines.push("type: budget-export");
  lines.push(`title: ${JSON.stringify(budget.title)}`);
  lines.push(`status: ${budget.status}`);
  lines.push(`currency: ${currency.toUpperCase()}`);
  lines.push(`income: ${budget.income}`);
  lines.push(`template: ${JSON.stringify(template?.name ?? "Unknown")}`);
  if (label) lines.push(`label: ${JSON.stringify(label.name)}`);
  if (view) lines.push(`folder: ${JSON.stringify(view.title)}`);
  lines.push(`created: ${toDateString(budget.createdAt)}`);
  lines.push("totals:");
  lines.push(`  allocated: ${totalAllocated}`);
  lines.push(`  unallocated: ${unallocated}`);
  lines.push(`  spent: ${totalSpent}`);
  lines.push(`  remaining: ${remaining}`);
  lines.push("---");
  lines.push("");

  // ── Header ──
  lines.push(`# ${budget.title}`);
  lines.push("");
  // The description is authored as Markdown in the editor, so inline it as-is
  // under its own section rather than forcing it into a single blockquote line.
  if (budget.description?.trim()) {
    lines.push("## Notes");
    lines.push("");
    lines.push(budget.description.trim());
    lines.push("");
  }

  // ── Overview ──
  lines.push("## Overview");
  lines.push("");
  lines.push(`- **Status:** ${budget.status}`);
  lines.push(`- **Currency:** ${currency.toUpperCase()}`);
  lines.push(`- **Income:** ${formatMoney(budget.income, currency)}`);
  lines.push(`- **Template:** ${template?.name ?? "Unknown"}`);
  if (label) lines.push(`- **Label:** ${label.name}`);
  if (view) lines.push(`- **Folder:** ${view.title}`);
  lines.push(`- **Created:** ${toDateString(budget.createdAt)}`);
  lines.push("");

  // ── Summary ──
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Amount |");
  lines.push("| --- | ---: |");
  lines.push(`| Income | ${formatMoney(budget.income, currency)} |`);
  lines.push(`| Allocated | ${formatMoney(totalAllocated, currency)} |`);
  lines.push(`| Unallocated | ${formatMoney(unallocated, currency)} |`);
  lines.push(`| Spent | ${formatMoney(totalSpent, currency)} |`);
  lines.push(`| Remaining (income - spent) | ${formatMoney(remaining, currency)} |`);
  lines.push("");

  // ── Allocations ──
  lines.push("## Allocations");
  lines.push("");
  if (allocations.length === 0) {
    lines.push("_No allocations._");
    lines.push("");
  } else {
    lines.push("| Category | % | Allocated | Spent | Remaining |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");
    for (const a of allocations) {
      const spent = (expensesByAllocation.get(a.id) ?? []).reduce((sum, e) => sum + e.amount, 0);
      lines.push(
        `| ${escapeCell(a.categoryName)} | ${a.percentage}% | ${formatMoney(a.amount, currency)} | ${formatMoney(spent, currency)} | ${formatMoney(a.amount - spent, currency)} |`,
      );
    }
    lines.push("");
  }

  // ── Expenses (grouped by allocation) ──
  lines.push("## Expenses");
  lines.push("");
  if (expenses.length === 0) {
    lines.push("_No expenses logged._");
    lines.push("");
  } else {
    for (const a of allocations) {
      const allocExpenses = expensesByAllocation.get(a.id) ?? [];
      const spent = allocExpenses.reduce((sum, e) => sum + e.amount, 0);
      lines.push(
        `### ${a.categoryName} — allocated ${formatMoney(a.amount, currency)}, spent ${formatMoney(spent, currency)}`,
      );
      lines.push("");
      if (allocExpenses.length === 0) {
        lines.push("_No expenses logged._");
        lines.push("");
        continue;
      }
      lines.push("| ✓ | Title | Amount | Note |");
      lines.push("| :-: | --- | ---: | --- |");
      for (const e of allocExpenses) {
        lines.push(
          `| ${e.checked ? "☑" : "☐"} | ${escapeCell(e.title)} | ${formatMoney(e.amount, currency)} | ${escapeCell(e.description ?? "")} |`,
        );
      }
      lines.push("");
    }
  }

  const markdown = lines.join("\n");
  const filename = `${slugify(budget.title)}-${toDateString(budget.createdAt)}.md`;

  return { markdown, filename };
}
