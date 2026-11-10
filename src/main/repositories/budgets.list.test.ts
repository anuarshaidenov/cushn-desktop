// The two budget list queries (active and archived), plus paging past 25.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BudgetListItem } from "@shared/api";
import { asId } from "@shared/domain";
import { CushnError } from "@shared/errors";
import type { DatabaseHandle } from "../db";
import { templates } from "../db/schema";
import * as budgets from "./budgets";
import {
  insertBudget,
  insertLabel,
  insertTemplate,
  insertView,
  openTestDatabase,
} from "./budgets.fixtures";

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openTestDatabase();
});

afterEach(() => {
  handle.close();
});

const firstPage = { cursor: null, numItems: 100 };

function titles(page: { page: { title: string }[] }): string[] {
  return page.page.map((b) => b.title);
}

describe("budgets.listActive / listArchived: items", () => {
  it("lists active budgets only, newest first, in the web app's item shape", () => {
    const { template } = insertTemplate(handle.db, { name: "50/30/20" });
    const label = insertLabel(handle.db, "Monthly", "#F97316");
    const view = insertView(handle.db, "Home");
    const june = insertBudget(handle.db, {
      title: "June",
      description: "Notes",
      templateId: template.id,
      income: 1000,
      currency: "eur",
      labelId: label.id,
      viewId: view.id,
      icon: "calendar",
      createdAt: 20,
    });
    insertBudget(handle.db, { title: "May", templateId: template.id, createdAt: 10 });
    insertBudget(handle.db, { title: "Old", status: "archived", createdAt: 30 });

    const result = budgets.listActive(handle.db, firstPage);

    expect(titles(result)).toEqual(["June", "May"]);
    expect(result.isDone).toBe(true);
    expect(result.continueCursor).toBeNull();
    expect(result.page[0]).toEqual({
      id: june.id,
      createdAt: 20,
      templateId: template.id,
      template,
      income: 1000,
      description: "Notes",
      title: "June",
      currency: "eur",
      label: { id: label.id, name: "Monthly", color: "#F97316" },
      viewId: view.id,
      icon: "calendar",
    } satisfies BudgetListItem);
  });

  it("reads label and icon as null when unset, and template: null after a template delete", () => {
    const { template } = insertTemplate(handle.db);
    insertBudget(handle.db, { title: "Orphan", templateId: template.id, createdAt: 1 });
    handle.db.delete(templates).where(eq(templates.id, template.id)).run();

    const [item] = budgets.listActive(handle.db, firstPage).page;
    expect(item).toMatchObject({
      title: "Orphan",
      templateId: null,
      template: null,
      label: null,
      viewId: null,
      icon: null,
    });
  });

  it("lists archived budgets only, without viewId, and from every View", () => {
    const view = insertView(handle.db);
    insertBudget(handle.db, { title: "Active", createdAt: 1 });
    insertBudget(handle.db, { title: "Filed", status: "archived", viewId: view.id, createdAt: 2 });
    insertBudget(handle.db, { title: "Loose", status: "archived", icon: "beach", createdAt: 3 });

    const result = budgets.listArchived(handle.db, firstPage);

    expect(titles(result)).toEqual(["Loose", "Filed"]);
    expect(result.page.map((b) => b.icon)).toEqual(["beach", null]);
    expect(Object.keys(result.page[0]).sort()).toEqual([
      "createdAt",
      "currency",
      "description",
      "icon",
      "id",
      "income",
      "label",
      "template",
      "templateId",
      "title",
    ]);
  });

  it("returns an empty, done page when nothing matches", () => {
    expect(budgets.listActive(handle.db, firstPage)).toEqual({
      page: [],
      continueCursor: null,
      isDone: true,
    });
    expect(budgets.listArchived(handle.db, firstPage)).toEqual({
      page: [],
      continueCursor: null,
      isDone: true,
    });
  });
});

/**
 * Six active budgets and two archived ones across two templates, two labels,
 * two Views and three currencies. Titles say where each one sits.
 */
function world() {
  const t1 = insertTemplate(handle.db, { name: "T1" }).template;
  const t2 = insertTemplate(handle.db, { name: "T2" }).template;
  const l1 = insertLabel(handle.db, "L1");
  const l2 = insertLabel(handle.db, "L2");
  const v1 = insertView(handle.db, "V1");
  const v2 = insertView(handle.db, "V2");
  const rows = [
    { title: "a t1 l1 v1 usd", templateId: t1.id, labelId: l1.id, viewId: v1.id, currency: "usd" },
    { title: "b t1 l2 v1 kzt", templateId: t1.id, labelId: l2.id, viewId: v1.id, currency: "kzt" },
    { title: "c t2 l1 v2 usd", templateId: t2.id, labelId: l1.id, viewId: v2.id, currency: "usd" },
    {
      title: "d t2 nolabel noview eur",
      templateId: t2.id,
      labelId: null,
      viewId: null,
      currency: "eur",
    },
    {
      title: "e t1 nolabel v2 kzt",
      templateId: t1.id,
      labelId: null,
      viewId: v2.id,
      currency: "kzt",
    },
    {
      title: "f t2 l2 noview usd",
      templateId: t2.id,
      labelId: l2.id,
      viewId: null,
      currency: "usd",
    },
    {
      title: "g archived t1 l1 v1 usd",
      templateId: t1.id,
      labelId: l1.id,
      viewId: v1.id,
      currency: "usd",
      status: "archived" as const,
    },
    {
      title: "h archived t2 nolabel noview eur",
      templateId: t2.id,
      labelId: null,
      viewId: null,
      currency: "eur",
      status: "archived" as const,
    },
  ];
  rows.forEach((row, index) => insertBudget(handle.db, { ...row, createdAt: index + 1 }));
  return { t1, t2, l1, l2, v1, v2 };
}

/** First letters of the titles, in list order. */
function letters(page: { page: { title: string }[] }): string {
  return page.page.map((b) => b.title[0]).join("");
}

describe("budgets.listActive: View scoping", () => {
  it("scopes to one View when viewId is given, and to every View or none otherwise", () => {
    const { v1, v2 } = world();
    expect(letters(budgets.listActive(handle.db, { ...firstPage, viewId: v1.id }))).toBe("ba");
    expect(letters(budgets.listActive(handle.db, { ...firstPage, viewId: v2.id }))).toBe("ec");
    expect(letters(budgets.listActive(handle.db, firstPage))).toBe("fedcba");
    expect(letters(budgets.listActive(handle.db, { ...firstPage, viewId: null }))).toBe("fedcba");
  });
});

describe("budgets.listActive / listArchived: filters", () => {
  it("labelIds: any of the labels; unlabelled budgets never match", () => {
    const { l1, l2 } = world();
    expect(letters(budgets.listActive(handle.db, { ...firstPage, labelIds: [l1.id] }))).toBe("ca");
    expect(letters(budgets.listActive(handle.db, { ...firstPage, labelIds: [l1.id, l2.id] }))).toBe(
      "fcba",
    );
    expect(
      letters(budgets.listArchived(handle.db, { ...firstPage, labelIds: [l1.id, l2.id] })),
    ).toBe("g");
  });

  it("templateIds: any of the templates", () => {
    const { t1, t2 } = world();
    expect(letters(budgets.listActive(handle.db, { ...firstPage, templateIds: [t1.id] }))).toBe(
      "eba",
    );
    expect(
      letters(budgets.listActive(handle.db, { ...firstPage, templateIds: [t1.id, t2.id] })),
    ).toBe("fedcba");
    expect(letters(budgets.listArchived(handle.db, { ...firstPage, templateIds: [t2.id] }))).toBe(
      "h",
    );
  });

  it("currencies: any of the currencies", () => {
    world();
    expect(letters(budgets.listActive(handle.db, { ...firstPage, currencies: ["kzt"] }))).toBe(
      "eb",
    );
    expect(
      letters(budgets.listActive(handle.db, { ...firstPage, currencies: ["eur", "kzt"] })),
    ).toBe("edb");
    expect(letters(budgets.listArchived(handle.db, { ...firstPage, currencies: ["eur"] }))).toBe(
      "h",
    );
  });

  it("treats an empty filter list as no filter", () => {
    world();
    expect(
      letters(
        budgets.listActive(handle.db, {
          ...firstPage,
          labelIds: [],
          templateIds: [],
          currencies: [],
        }),
      ),
    ).toBe("fedcba");
  });

  it("ANDs the filters together, with the View scope too", () => {
    const { t1, t2, l1, l2, v1 } = world();
    expect(
      letters(
        budgets.listActive(handle.db, { ...firstPage, templateIds: [t2.id], currencies: ["usd"] }),
      ),
    ).toBe("fc");
    expect(
      letters(
        budgets.listActive(handle.db, {
          ...firstPage,
          labelIds: [l1.id, l2.id],
          templateIds: [t1.id],
          currencies: ["usd", "kzt"],
        }),
      ),
    ).toBe("ba");
    expect(
      letters(
        budgets.listActive(handle.db, {
          ...firstPage,
          viewId: v1.id,
          labelIds: [l2.id],
          templateIds: [t1.id],
        }),
      ),
    ).toBe("b");
    expect(
      letters(
        budgets.listArchived(handle.db, { ...firstPage, labelIds: [l1.id], currencies: ["eur"] }),
      ),
    ).toBe("");
  });
});

describe("budgets.listActive / listArchived: sorting", () => {
  /** Incomes with ties; letters are in creation order (a oldest). */
  function incomes(status: "active" | "archived" = "active") {
    const rows: [string, number][] = [
      ["a", 300],
      ["b", 100],
      ["c", 300],
      ["d", 200],
      ["e", 100],
    ];
    rows.forEach(([title, income], index) =>
      insertBudget(handle.db, { title, income, status, createdAt: index + 1 }),
    );
  }

  it("sorts by createdAt, desc by default or asc", () => {
    incomes();
    expect(letters(budgets.listActive(handle.db, firstPage))).toBe("edcba");
    expect(
      letters(
        budgets.listActive(handle.db, { ...firstPage, sortBy: "createdAt", sortOrder: "desc" }),
      ),
    ).toBe("edcba");
    expect(
      letters(
        budgets.listActive(handle.db, { ...firstPage, sortBy: "createdAt", sortOrder: "asc" }),
      ),
    ).toBe("abcde");
  });

  it("sorts by income; ties fall back to creation order in the same direction", () => {
    incomes();
    expect(letters(budgets.listActive(handle.db, { ...firstPage, sortBy: "income" }))).toBe(
      "cadeb",
    );
    expect(
      letters(budgets.listActive(handle.db, { ...firstPage, sortBy: "income", sortOrder: "desc" })),
    ).toBe("cadeb");
    expect(
      letters(budgets.listActive(handle.db, { ...firstPage, sortBy: "income", sortOrder: "asc" })),
    ).toBe("bedac");
  });

  it("breaks created_at ties by id, in the same direction", () => {
    const ids = ["3", "1", "2"].map(
      (id) => insertBudget(handle.db, { id: asId<"budgets">(id), title: id, createdAt: 7 }).id,
    );
    expect(ids).toEqual(["3", "1", "2"]);
    expect(titles(budgets.listActive(handle.db, firstPage))).toEqual(["3", "2", "1"]);
    expect(titles(budgets.listActive(handle.db, { ...firstPage, sortOrder: "asc" }))).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("sorts the archived list the same way", () => {
    incomes("archived");
    expect(letters(budgets.listArchived(handle.db, firstPage))).toBe("edcba");
    expect(letters(budgets.listArchived(handle.db, { ...firstPage, sortOrder: "asc" }))).toBe(
      "abcde",
    );
    expect(letters(budgets.listArchived(handle.db, { ...firstPage, sortBy: "income" }))).toBe(
      "cadeb",
    );
    expect(
      letters(
        budgets.listArchived(handle.db, { ...firstPage, sortBy: "income", sortOrder: "asc" }),
      ),
    ).toBe("bedac");
  });
});

describe("budgets.listActive / listArchived: title search", () => {
  function searchable() {
    const { template } = insertTemplate(handle.db);
    const label = insertLabel(handle.db);
    const rows = [
      { title: "Groceries October", income: 700, currency: "usd" },
      { title: "Groceries November", income: 500, currency: "kzt", labelId: label.id },
      { title: "October trip", income: 900, currency: "usd", labelId: label.id },
      { title: "Бюджет на Қазан", income: 100, currency: "kzt" },
      { title: "Café Paris", income: 300, currency: "eur" },
      { title: "Groceries archived", income: 50, currency: "usd", status: "archived" as const },
    ];
    rows.forEach((row, index) =>
      insertBudget(handle.db, { ...row, templateId: template.id, createdAt: index + 1 }),
    );
    return { label, template };
  }

  it("requires every typed word to prefix-match the title, case-insensitively", () => {
    searchable();
    expect(titles(budgets.listActive(handle.db, { ...firstPage, search: "groc" }))).toEqual([
      "Groceries November",
      "Groceries October",
    ]);
    expect(titles(budgets.listActive(handle.db, { ...firstPage, search: "GROC oct" }))).toEqual([
      "Groceries October",
    ]);
    expect(titles(budgets.listActive(handle.db, { ...firstPage, search: "oct" }))).toEqual([
      "October trip",
      "Groceries October",
    ]);
    expect(titles(budgets.listActive(handle.db, { ...firstPage, search: "ober" }))).toEqual([]);
    expect(titles(budgets.listActive(handle.db, { ...firstPage, search: "groc trip" }))).toEqual(
      [],
    );
  });

  it("matches Cyrillic and ignores diacritics", () => {
    searchable();
    expect(titles(budgets.listActive(handle.db, { ...firstPage, search: "бюдж қаз" }))).toEqual([
      "Бюджет на Қазан",
    ]);
    expect(titles(budgets.listActive(handle.db, { ...firstPage, search: "БЮДЖЕТ" }))).toEqual([
      "Бюджет на Қазан",
    ]);
    expect(titles(budgets.listActive(handle.db, { ...firstPage, search: "cafe" }))).toEqual([
      "Café Paris",
    ]);
  });

  it("treats blank search as no search, and FTS syntax as plain text", () => {
    searchable();
    expect(budgets.listActive(handle.db, { ...firstPage, search: "   " }).page).toHaveLength(5);
    expect(budgets.listActive(handle.db, { ...firstPage, search: "" }).page).toHaveLength(5);
    for (const search of ['"', "-", "OR", "a:b", "(x", "*", "NEAR("]) {
      expect(() => budgets.listActive(handle.db, { ...firstPage, search })).not.toThrow();
    }
  });

  it("keeps the list's sort instead of ranking by relevance", () => {
    // sortBy/sortOrder apply to search results too.
    searchable();
    const search = "groc";
    expect(
      titles(budgets.listActive(handle.db, { ...firstPage, search, sortOrder: "asc" })),
    ).toEqual(["Groceries October", "Groceries November"]);
    expect(
      titles(budgets.listActive(handle.db, { ...firstPage, search, sortBy: "income" })),
    ).toEqual(["Groceries October", "Groceries November"]);
    expect(
      titles(
        budgets.listActive(handle.db, { ...firstPage, search, sortBy: "income", sortOrder: "asc" }),
      ),
    ).toEqual(["Groceries November", "Groceries October"]);
    expect(
      titles(budgets.listActive(handle.db, { ...firstPage, search: "o", sortBy: "income" })),
    ).toEqual(["October trip", "Groceries October"]);
  });

  it("composes with every filter and the View scope", () => {
    const { label, template } = searchable();
    const view = insertView(handle.db);
    insertBudget(handle.db, {
      title: "Groceries at home",
      templateId: template.id,
      viewId: view.id,
      createdAt: 50,
    });

    expect(
      titles(budgets.listActive(handle.db, { ...firstPage, search: "groc", labelIds: [label.id] })),
    ).toEqual(["Groceries November"]);
    expect(
      titles(budgets.listActive(handle.db, { ...firstPage, search: "oct", currencies: ["usd"] })),
    ).toEqual(["October trip", "Groceries October"]);
    expect(
      titles(
        budgets.listActive(handle.db, {
          ...firstPage,
          search: "groc",
          templateIds: [template.id],
          currencies: ["kzt"],
        }),
      ),
    ).toEqual(["Groceries November"]);
    expect(
      titles(budgets.listActive(handle.db, { ...firstPage, search: "groc", viewId: view.id })),
    ).toEqual(["Groceries at home"]);
  });

  it("searches the archived list among archived budgets only", () => {
    searchable();
    expect(titles(budgets.listArchived(handle.db, { ...firstPage, search: "groc" }))).toEqual([
      "Groceries archived",
    ]);
    expect(titles(budgets.listActive(handle.db, { ...firstPage, search: "archived" }))).toEqual([]);
  });
});

describe("budgets.listActive / listArchived: cursor paging", () => {
  /**
   * `count` budgets with heavy ties: every three share a created_at and the
   * incomes take five values. Random UUIDs break the remaining ties.
   */
  function manyBudgets(count: number, status: "active" | "archived" = "active") {
    return Array.from({ length: count }, (_, i) =>
      insertBudget(handle.db, {
        title: `B${i}`,
        income: ((i * 7) % 5) * 100,
        status,
        createdAt: 1000 + Math.floor(i / 3),
      }),
    );
  }

  /** Follows continueCursor until isDone, like the hooks' loadMore does. */
  function pageThrough<T>(
    fetch: (cursor: string | null) => { page: T[]; continueCursor: string | null; isDone: boolean },
  ) {
    const pages: T[][] = [];
    const flags: boolean[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 100; guard++) {
      const result = fetch(cursor);
      pages.push(result.page);
      flags.push(result.isDone);
      if (result.isDone) {
        expect(result.continueCursor).toBeNull();
        return { pages, flags };
      }
      expect(result.continueCursor).toEqual(expect.any(String));
      cursor = result.continueCursor;
    }
    throw new Error("paging did not finish");
  }

  type Row = ReturnType<typeof manyBudgets>[number];
  const compare = (a: number | string, b: number | string) => (a < b ? -1 : a > b ? 1 : 0);
  /** The expected order, computed independently of SQL. */
  function expectedOrder(rows: Row[], sortBy: "createdAt" | "income", sortOrder: "asc" | "desc") {
    const sign = sortOrder === "asc" ? 1 : -1;
    return [...rows]
      .sort(
        (a, b) =>
          sign *
          ((sortBy === "income" ? compare(a.income, b.income) : 0) ||
            compare(a.createdAt, b.createdAt) ||
            compare(a.id, b.id)),
      )
      .map((row) => row.id);
  }

  const sorts = [
    ["createdAt", "desc"],
    ["createdAt", "asc"],
    ["income", "desc"],
    ["income", "asc"],
  ] as const;

  it.each(sorts)("pages past 25 by %s %s with no duplicates or gaps", (sortBy, sortOrder) => {
    const rows = manyBudgets(60);

    const { pages, flags } = pageThrough((cursor) =>
      budgets.listActive(handle.db, { sortBy, sortOrder, cursor, numItems: 25 }),
    );

    expect(pages.map((page) => page.length)).toEqual([25, 25, 10]);
    expect(flags).toEqual([false, false, true]);
    expect(pages.flat().map((b) => b.id)).toEqual(expectedOrder(rows, sortBy, sortOrder));
  });

  it.each(sorts)("pages the archived list by %s %s", (sortBy, sortOrder) => {
    const rows = manyBudgets(30, "archived");
    manyBudgets(5);

    const { pages } = pageThrough((cursor) =>
      budgets.listArchived(handle.db, { sortBy, sortOrder, cursor, numItems: 7 }),
    );

    expect(pages.map((page) => page.length)).toEqual([7, 7, 7, 7, 2]);
    expect(pages.flat().map((b) => b.id)).toEqual(expectedOrder(rows, sortBy, sortOrder));
  });

  it("is done on the last full page, without an empty page after it", () => {
    manyBudgets(50);
    const { pages, flags } = pageThrough((cursor) =>
      budgets.listActive(handle.db, { cursor, numItems: 25 }),
    );
    expect(pages.map((page) => page.length)).toEqual([25, 25]);
    expect(flags).toEqual([false, true]);

    expect(budgets.listActive(handle.db, { cursor: null, numItems: 51 })).toMatchObject({
      isDone: true,
      continueCursor: null,
    });
  });

  it("pages a filtered, searched and View-scoped list", () => {
    const view = insertView(handle.db);
    const label = insertLabel(handle.db);
    const matching = Array.from({ length: 12 }, (_, i) =>
      insertBudget(handle.db, {
        title: `Groceries ${i}`,
        income: (i % 3) * 10,
        labelId: label.id,
        viewId: view.id,
        createdAt: 1 + Math.floor(i / 2),
      }),
    );
    // Near misses: wrong title, no label, other View, archived.
    insertBudget(handle.db, { title: "Rent", labelId: label.id, viewId: view.id, createdAt: 2 });
    insertBudget(handle.db, { title: "Groceries x", viewId: view.id, createdAt: 2 });
    insertBudget(handle.db, { title: "Groceries y", labelId: label.id, createdAt: 2 });
    insertBudget(handle.db, {
      title: "Groceries z",
      labelId: label.id,
      viewId: view.id,
      status: "archived",
      createdAt: 2,
    });

    const { pages } = pageThrough((cursor) =>
      budgets.listActive(handle.db, {
        viewId: view.id,
        labelIds: [label.id],
        search: "groc",
        sortBy: "income",
        sortOrder: "desc",
        cursor,
        numItems: 5,
      }),
    );

    expect(pages.map((page) => page.length)).toEqual([5, 5, 2]);
    expect(pages.flat().map((b) => b.id)).toEqual(expectedOrder(matching, "income", "desc"));
  });

  it("continues after the cursor even when that budget changed in between", () => {
    // A keyset cursor holds the sort tuple, not a position, so rows that move
    // away between pages shift nothing.
    const rows = manyBudgets(10);
    const first = budgets.listActive(handle.db, { cursor: null, numItems: 4 });
    budgets.archive(handle.db, { budgetId: first.page[3].id });

    const second = budgets.listActive(handle.db, { cursor: first.continueCursor, numItems: 4 });

    expect(second.page.map((b) => b.id)).toEqual(
      expectedOrder(rows, "createdAt", "desc").slice(4, 8),
    );
  });

  it("rejects a malformed cursor, or one from the other sort, with BAD_REQUEST", () => {
    manyBudgets(5);
    const byIncome = budgets.listActive(handle.db, { sortBy: "income", cursor: null, numItems: 2 });

    for (const cursor of ["not json", "[]", '{"a":1}', '[1,"x",3]', byIncome.continueCursor!]) {
      expect(() => budgets.listActive(handle.db, { cursor, numItems: 2 })).toThrow(
        new CushnError("BAD_REQUEST", "Invalid cursor"),
      );
    }
  });
});

describe("budgets.listActive / listArchived: trash", () => {
  it("leaves trashed budgets out of both lists and their search", () => {
    insertBudget(handle.db, { title: "Rent live", createdAt: 1 });
    insertBudget(handle.db, { title: "Rent gone", createdAt: 2, deletedAt: 10 });
    insertBudget(handle.db, { title: "Rent old", status: "archived", createdAt: 3 });
    insertBudget(handle.db, {
      title: "Rent old gone",
      status: "archived",
      createdAt: 4,
      deletedAt: 10,
    });

    expect(titles(budgets.listActive(handle.db, firstPage))).toEqual(["Rent live"]);
    expect(titles(budgets.listActive(handle.db, { ...firstPage, search: "rent" }))).toEqual([
      "Rent live",
    ]);
    expect(titles(budgets.listArchived(handle.db, firstPage))).toEqual(["Rent old"]);
    expect(titles(budgets.listArchived(handle.db, { ...firstPage, search: "rent" }))).toEqual([
      "Rent old",
    ]);
  });
});
