import { describe, expect, it } from "vitest";
import { renderBudgetMarkdown } from "./budgetMarkdown";
import { type Budget, type BudgetAllocation, type Expense, type Template, asId } from "./domain";

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: asId<"budgets">("budget_1"),
    createdAt: 1_700_000_000_000,
    title: "June",
    description: null,
    templateId: asId<"templates">("template_1"),
    income: 1000,
    status: "active",
    currency: "usd",
    labelId: null,
    viewId: null,
    icon: null,
    deletedAt: null,
    ...overrides,
  };
}

const template: Template = {
  id: asId<"templates">("template_1"),
  name: "50/30/20",
  description: null,
  isDefault: true,
  createdAt: 1,
};

describe("renderBudgetMarkdown — description", () => {
  it("inlines a Markdown description verbatim under a Notes section", () => {
    const description = "## Strategy\n\n- salary to BCC\n- subs in Kaspi";
    const { markdown } = renderBudgetMarkdown({
      budget: makeBudget({ description }),
      template,
      label: null,
      view: null,
      allocations: [],
      expenses: [],
    });

    expect(markdown).toContain("## Notes");
    expect(markdown).toContain(description);
    // The legacy single-line blockquote behavior must be gone.
    expect(markdown).not.toContain(`> ${description}`);
  });

  it("omits the Notes section when there is no description", () => {
    const { markdown } = renderBudgetMarkdown({
      budget: makeBudget({ description: null }),
      template,
      label: null,
      view: null,
      allocations: [],
      expenses: [],
    });

    expect(markdown).not.toContain("## Notes");
  });

  it("treats a whitespace-only description as empty", () => {
    const { markdown } = renderBudgetMarkdown({
      budget: makeBudget({ description: "   \n  " }),
      template,
      label: null,
      view: null,
      allocations: [],
      expenses: [],
    });

    expect(markdown).not.toContain("## Notes");
  });
});

describe("renderBudgetMarkdown — totals, template and filename", () => {
  const allocation = (id: string, categoryName: string, amount: number): BudgetAllocation => ({
    id: asId<"budgetAllocations">(id),
    budgetId: asId<"budgets">("budget_1"),
    categoryName,
    percentage: amount / 10,
    amount,
    description: null,
    editable: true,
    sortOrder: 1,
    createdAt: 1,
  });
  const expense = (
    allocationId: string,
    title: string,
    amount: number,
    order: number,
  ): Expense => ({
    id: asId<"expenses">(`${allocationId}-${order}`),
    budgetId: asId<"budgets">("budget_1"),
    allocationId: asId<"budgetAllocations">(allocationId),
    amount,
    title,
    description: null,
    order,
    checked: false,
    createdAt: 1,
  });

  it("sums allocations and expenses and groups expenses by allocation in order", () => {
    const { markdown } = renderBudgetMarkdown({
      budget: makeBudget(),
      template,
      label: null,
      view: null,
      allocations: [allocation("a", "Needs", 500), allocation("b", "Wants", 300)],
      expenses: [
        expense("a", "Groceries", 200, 1),
        expense("a", "Rent", 600, 0),
        expense("b", "Cinema", 20, 0),
      ],
    });

    expect(markdown).toContain(
      "  allocated: 800\n  unallocated: 200\n  spent: 820\n  remaining: 180",
    );
    expect(markdown).toContain("| Needs | 50% | $500.00 | $800.00 | -$300.00 |");
    expect(markdown.indexOf("| ☐ | Rent |")).toBeLessThan(markdown.indexOf("| ☐ | Groceries |"));
  });

  it("prints 'Unknown' when the template was deleted", () => {
    const { markdown } = renderBudgetMarkdown({
      budget: makeBudget({ templateId: null }),
      template: null,
      label: null,
      view: null,
      allocations: [],
      expenses: [],
    });

    expect(markdown).toContain('template: "Unknown"');
    expect(markdown).toContain("- **Template:** Unknown");
  });

  it("dates the export and the filename from createdAt", () => {
    // 1_700_000_000_000 is 2023-11-14 (UTC).
    const { markdown, filename } = renderBudgetMarkdown({
      budget: makeBudget({ title: "June: Rent & Food!" }),
      template,
      label: null,
      view: null,
      allocations: [],
      expenses: [],
    });

    expect(markdown).toContain("created: 2023-11-14");
    expect(filename).toBe("june-rent-food-2023-11-14.md");
  });
});
