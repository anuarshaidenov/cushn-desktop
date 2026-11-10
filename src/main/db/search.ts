import { type SQL, sql } from "drizzle-orm";
import { budgets } from "./schema";

/**
 * Turns free text from the search box into an FTS5 MATCH expression: every
 * whitespace-separated term becomes a quoted prefix query, and all terms must
 * match (`"your" "fir"*`-style, AND-joined). Quoting neutralises FTS syntax
 * (`-`, `:`, `OR`, parentheses) typed by the user. Returns `null` when the
 * input has no terms.
 */
export function budgetTitleFtsQuery(input: string): string | null {
  const terms = input.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(" ");
}

/**
 * `WHERE` condition: the budget's title matches `input` (see
 * `budgetTitleFtsQuery`). `undefined` for blank input, so it drops out of
 * `and(...)`.
 */
export function budgetTitleMatches(input: string): SQL | undefined {
  const query = budgetTitleFtsQuery(input);
  if (query === null) return undefined;
  return sql`${budgets.id} in (select budget_id from budgets_fts where budgets_fts match ${query})`;
}
