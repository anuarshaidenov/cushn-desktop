import { eq } from "drizzle-orm";
import type { BudgetIconName } from "@shared/budgetIcons";
import type { CurrencyCode } from "@shared/currencies";
import type { Id } from "@shared/domain";
import { roundMoney } from "@shared/money";
import type { AppDatabase } from "./index";
import {
  appMeta,
  budgetAllocations,
  budgetLabels,
  budgetViews,
  budgets,
  expenses,
  templateCategories,
  templates,
  userSettings,
} from "./schema";

/** `app_meta` key set (to an ISO timestamp) once first-run seeding has run. */
export const SEEDED_AT_KEY = "seeded_at";

/** Built-in budget templates (the web app's `seedDefaultTemplates`). */
export const DEFAULT_TEMPLATES = [
  {
    name: "50/30/20",
    description: "A classic budgeting rule: 50% Needs, 30% Wants, 20% Savings.",
    categories: [
      {
        name: "Needs",
        percentage: 50,
        description: "Essential expenses like rent, groceries, utilities, and transportation",
        editable: true,
      },
      {
        name: "Wants",
        percentage: 30,
        description: "Discretionary spending on entertainment, dining out, and hobbies",
        editable: true,
      },
      {
        name: "Savings",
        percentage: 20,
        description: "Emergency fund, retirement savings, and financial goals",
        editable: false,
      },
    ],
  },
  {
    name: "75/10/15",
    description: "A disciplined budgeting method: 75% Expenses, 10% Savings, 15% Investments.",
    categories: [
      {
        name: "Expenses",
        percentage: 75,
        description: "All monthly expenses including fixed and variable costs",
        editable: true,
      },
      {
        name: "Savings",
        percentage: 10,
        description: "Short-term savings and emergency fund contributions",
        editable: false,
      },
      {
        name: "Investments",
        percentage: 15,
        description: "Long-term wealth building through stocks, bonds, and other investments",
        editable: false,
      },
    ],
  },
] as const;

/** A user template (editable, deletable) that the sample trip is made from. */
export const SAMPLE_TEMPLATE = {
  name: "Travel",
  description: "For trips: getting there, a place to stay, and everything you do once you arrive.",
  categories: [
    {
      name: "Getting there",
      percentage: 35,
      description: "Flights, trains and transfers",
      editable: true,
    },
    { name: "Stay", percentage: 40, description: "Hotels and rentals", editable: true },
    { name: "Food & fun", percentage: 25, description: "Meals, tours and tickets", editable: true },
  ],
} as const;

/** Starter labels (the web app's `seedLabels`). */
export const DEFAULT_LABELS = [
  { name: "Daily", color: "#06B6D4" },
  { name: "Weekly", color: "#EF4444" },
  { name: "Monthly", color: "#F97316" },
  { name: "Yearly", color: "#10B981" },
  { name: "One-time", color: "#8B5CF6" },
] as const;

/** Favorites, so the sidebar shows them; in the order the Views page lists them. */
export const SAMPLE_VIEWS = [
  { title: "Personal", description: "Everyday spending and trips", isFavorite: true },
  { title: "Work", description: "Freelance income and business costs", isFavorite: true },
] as const;

type SampleExpense = { title: string; amount: number; daysAgo: number };

type SampleBudget = {
  title: string;
  description: string;
  template: (typeof DEFAULT_TEMPLATES)[number]["name"] | typeof SAMPLE_TEMPLATE.name;
  label: (typeof DEFAULT_LABELS)[number]["name"];
  view: (typeof SAMPLE_VIEWS)[number]["title"];
  icon: BudgetIconName;
  currency: CurrencyCode;
  income: number;
  daysAgo: number;
  /** By category name, in display order. */
  expenses: Record<string, SampleExpense[]>;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Sample budgets that fill every Home section: this month's budget leads, a
 * trip in euros runs one category over, a side income sits beside them. Dated
 * back from the first open so Home reads like weeks of use; the newest stays
 * in USD because `getLatest` feeds the new-budget defaults.
 */
export function sampleBudgets(now: number): SampleBudget[] {
  const month = new Date(now).toLocaleString("en-US", { month: "long" });
  return [
    {
      title: `${month} budget`,
      description: [
        "A sample budget to show you around. Change anything, or delete it when you're ready to make your own.",
        "",
        "- **Income** is split by the template: 50% for needs, 30% for wants, 20% for savings.",
        "- **Add expenses** under a category to see what's left at a glance.",
        "- **Next month**, duplicate this budget instead of starting from scratch.",
        "",
        "Everything stays on this computer. No account, no cloud.",
      ].join("\n"),
      template: "50/30/20",
      label: "Monthly",
      view: "Personal",
      icon: "calendar",
      currency: "usd",
      income: 5000,
      daysAgo: 7,
      expenses: {
        Needs: [
          { title: "Rent", amount: 1450, daysAgo: 7 },
          { title: "Transit pass", amount: 90, daysAgo: 7 },
          { title: "Phone & internet", amount: 85, daysAgo: 6 },
          { title: "Groceries", amount: 164.2, daysAgo: 5 },
          { title: "Health insurance", amount: 214, daysAgo: 5 },
          { title: "Electricity & water", amount: 112.75, daysAgo: 3 },
          { title: "Groceries", amount: 131.85, daysAgo: 0 },
        ],
        Wants: [
          { title: "Gym membership", amount: 49, daysAgo: 6 },
          { title: "Streaming subscriptions", amount: 32.98, daysAgo: 4 },
          { title: "Concert tickets", amount: 140, daysAgo: 3 },
          { title: "Running shoes", amount: 128, daysAgo: 2 },
          { title: "Dinner with friends", amount: 86.4, daysAgo: 1 },
          { title: "Coffee & lunches out", amount: 63.25, daysAgo: 0 },
        ],
      },
    },
    {
      title: "Lisbon trip",
      description: [
        "Five days in Lisbon, planned in euros: every budget keeps its own currency.",
        "",
        "Food & fun went a little over, so it shows under **Needs attention** on Home.",
      ].join("\n"),
      template: "Travel",
      label: "One-time",
      view: "Personal",
      icon: "luggage",
      currency: "eur",
      income: 2000,
      daysAgo: 30,
      expenses: {
        "Getting there": [
          { title: "Return flights", amount: 486, daysAgo: 30 },
          { title: "Airport transfers", amount: 52, daysAgo: 8 },
          { title: "Metro & tram pass", amount: 34, daysAgo: 8 },
        ],
        Stay: [
          { title: "Apartment in Alfama, 5 nights", amount: 745, daysAgo: 28 },
          { title: "City tourist tax", amount: 20, daysAgo: 8 },
        ],
        "Food & fun": [
          { title: "Seafood dinner", amount: 132, daysAgo: 7 },
          { title: "Sintra day trip", amount: 89, daysAgo: 6 },
          { title: "Fado night", amount: 64, daysAgo: 5 },
          { title: "Surf lesson", amount: 75, daysAgo: 4 },
          { title: "Market lunch", amount: 58, daysAgo: 4 },
          { title: "Wine tasting", amount: 85, daysAgo: 3 },
          { title: "Pastéis de nata", amount: 14, daysAgo: 3 },
        ],
      },
    },
    {
      title: "Freelance income",
      description:
        "Client work on the side. Business costs come out of Expenses; 10% is saved and 15% invested before anything else.",
      template: "75/10/15",
      label: "Monthly",
      view: "Work",
      icon: "work",
      currency: "usd",
      income: 2400,
      daysAgo: 21,
      expenses: {
        Expenses: [
          { title: "Coworking desk", amount: 240, daysAgo: 21 },
          { title: "Design software", amount: 54.99, daysAgo: 20 },
          { title: "Accountant", amount: 150, daysAgo: 14 },
          { title: "Tax set-aside", amount: 480, daysAgo: 10 },
          { title: "New monitor", amount: 329, daysAgo: 5 },
        ],
      },
    },
  ];
}

function idOf<T>(ids: Map<string, T>, name: string): T {
  const id = ids.get(name);
  if (id === undefined) throw new Error(`Seed data names a missing row: ${name}`);
  return id;
}

/**
 * Prepares a database for use. Runs on every open and is safe to repeat:
 * - ensures the single `user_settings` row exists;
 * - on first run only, inserts the built-in templates and labels, plus a
 *   sample template, Views and budgets to show the app off, then records
 *   `seeded_at` in `app_meta`. The flag, not table emptiness, decides, so
 *   nothing comes back after the user deletes it.
 *
 * Returns whether the first-run data was inserted by this call.
 */
export function seedDatabase(db: AppDatabase, now: number = Date.now()): boolean {
  return db.transaction((tx) => {
    tx.insert(userSettings).values({ id: 1 }).onConflictDoNothing().run();

    const seeded = tx.select().from(appMeta).where(eq(appMeta.key, SEEDED_AT_KEY)).get();
    if (seeded) return false;

    // Each row gets its own createdAt (now + n, minus whole days for the
    // backdated samples) so ordering by creation time is deterministic.
    let tick = 0;
    const nextCreatedAt = (daysAgo = 0) => now - daysAgo * DAY + tick++;

    const labelIds = new Map<string, Id<"budgetLabels">>();
    for (const label of DEFAULT_LABELS) {
      const { id } = tx
        .insert(budgetLabels)
        .values({ ...label, createdAt: nextCreatedAt() })
        .returning({ id: budgetLabels.id })
        .get();
      labelIds.set(label.name, id);
    }

    const allTemplates = [
      ...DEFAULT_TEMPLATES.map((template) => ({ ...template, isDefault: true })),
      { ...SAMPLE_TEMPLATE, isDefault: false },
    ];
    const templatesByName = new Map<
      string,
      { id: Id<"templates">; template: (typeof allTemplates)[number] }
    >();
    for (const template of allTemplates) {
      const { id } = tx
        .insert(templates)
        .values({
          name: template.name,
          description: template.description,
          isDefault: template.isDefault,
          createdAt: nextCreatedAt(),
        })
        .returning({ id: templates.id })
        .get();
      templatesByName.set(template.name, { id, template });

      template.categories.forEach((category, index) => {
        tx.insert(templateCategories)
          .values({ templateId: id, ...category, sortOrder: index + 1 })
          .run();
      });
    }

    const viewIds = new Map<string, Id<"budgetViews">>();
    // Views list newest first, so the first one goes in last.
    for (const view of SAMPLE_VIEWS.toReversed()) {
      const { id } = tx
        .insert(budgetViews)
        .values({ ...view, createdAt: nextCreatedAt() })
        .returning({ id: budgetViews.id })
        .get();
      viewIds.set(view.title, id);
    }

    for (const budget of sampleBudgets(now)) {
      const { id: templateId, template } = idOf(templatesByName, budget.template);
      const { id: budgetId } = tx
        .insert(budgets)
        .values({
          title: budget.title,
          description: budget.description,
          templateId,
          income: budget.income,
          status: "active",
          currency: budget.currency,
          labelId: idOf(labelIds, budget.label),
          viewId: idOf(viewIds, budget.view),
          icon: budget.icon,
          createdAt: nextCreatedAt(budget.daysAgo),
        })
        .returning({ id: budgets.id })
        .get();

      const allocationIds = new Map<string, Id<"budgetAllocations">>();
      template.categories.forEach((category, index) => {
        const { id } = tx
          .insert(budgetAllocations)
          .values({
            budgetId,
            categoryName: category.name,
            percentage: category.percentage,
            amount: roundMoney((budget.income * category.percentage) / 100),
            description: category.description,
            editable: category.editable,
            sortOrder: index + 1,
            createdAt: nextCreatedAt(budget.daysAgo),
          })
          .returning({ id: budgetAllocations.id })
          .get();
        allocationIds.set(category.name, id);
      });

      for (const [categoryName, items] of Object.entries(budget.expenses)) {
        const allocationId = idOf(allocationIds, categoryName);
        items.forEach(({ title, amount, daysAgo }, order) => {
          tx.insert(expenses)
            .values({
              budgetId,
              allocationId,
              title,
              amount: roundMoney(amount),
              order,
              checked: false,
              createdAt: nextCreatedAt(daysAgo),
            })
            .run();
        });
      }
    }

    tx.insert(appMeta)
      .values({ key: SEEDED_AT_KEY, value: new Date(now).toISOString() })
      .run();
    return true;
  });
}
