// The budgets handlers' argument validation (the repository is covered in
// repositories/budgets.test.ts and budgets.list.test.ts).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseHandle } from "../db";
import {
  insertBudget,
  insertTemplate,
  insertView,
  openTestDatabase,
} from "../repositories/budgets.fixtures";
import { budgetHandlers } from "./budgets";
import { invokeHandler } from "./handler";

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openTestDatabase();
});

afterEach(() => {
  handle.close();
});

function listActive(input: unknown) {
  return invokeHandler(
    budgetHandlers.listActive,
    { db: handle.db },
    input,
    "cushn:budgets.listActive",
  );
}

function listArchived(input: unknown) {
  return invokeHandler(
    budgetHandlers.listArchived,
    { db: handle.db },
    input,
    "cushn:budgets.listArchived",
  );
}

function listTrashed(input: unknown) {
  return invokeHandler(
    budgetHandlers.listTrashed,
    { db: handle.db },
    input,
    "cushn:budgets.listTrashed",
  );
}

function create(input: unknown) {
  return invokeHandler(budgetHandlers.create, { db: handle.db }, input, "cushn:budgets.create");
}

function setIcon(input: unknown) {
  return invokeHandler(budgetHandlers.setIcon, { db: handle.db }, input, "cushn:budgets.setIcon");
}

const badRequest = { ok: false, error: { code: "BAD_REQUEST" } };

describe("budgets list args", () => {
  it("accepts every filter, a null cursor and a page size", async () => {
    const view = insertView(handle.db);
    insertBudget(handle.db, { title: "Groceries", viewId: view.id, createdAt: 1 });

    expect(
      await listActive({
        viewId: view.id,
        labelIds: [],
        templateIds: [],
        currencies: ["usd"],
        search: "groc",
        sortBy: "income",
        sortOrder: "asc",
        cursor: null,
        numItems: 25,
      }),
    ).toMatchObject({ ok: true, data: { page: [{ title: "Groceries" }], isDone: true } });
    expect(await listActive({ viewId: null, cursor: null, numItems: 1 })).toMatchObject({
      ok: true,
    });
  });

  it.each([
    ["a missing cursor", { numItems: 25 }],
    ["a zero page size", { cursor: null, numItems: 0 }],
    ["a fractional page size", { cursor: null, numItems: 2.5 }],
  ])("rejects %s with BAD_REQUEST on the trash too", async (_name, input) => {
    expect(await listTrashed(input)).toMatchObject(badRequest);
  });

  it.each([
    ["a missing cursor", { numItems: 25 }],
    ["a zero page size", { cursor: null, numItems: 0 }],
    ["a fractional page size", { cursor: null, numItems: 2.5 }],
    ["an unknown sort", { cursor: null, numItems: 25, sortBy: "title" }],
    ["an unknown order", { cursor: null, numItems: 25, sortOrder: "up" }],
  ])("rejects %s with BAD_REQUEST", async (_name, input) => {
    expect(await listActive(input)).toMatchObject(badRequest);
    expect(await listArchived(input)).toMatchObject(badRequest);
  });

  it("ignores a viewId sent to the archived list", async () => {
    const view = insertView(handle.db);
    insertBudget(handle.db, { title: "Loose", status: "archived", createdAt: 1 });

    expect(await listArchived({ viewId: view.id, cursor: null, numItems: 25 })).toMatchObject({
      ok: true,
      data: { page: [{ title: "Loose" }] },
    });
  });

  it("answers an invalid cursor with BAD_REQUEST 'Invalid cursor'", async () => {
    expect(await listActive({ cursor: "nope", numItems: 25 })).toEqual({
      ok: false,
      error: { code: "BAD_REQUEST", message: "Invalid cursor" },
    });
  });
});

describe("budgets money args", () => {
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects an income of %s", async (_name, income) => {
    const { template } = insertTemplate(handle.db);
    expect(
      await create({ templateId: template.id, currency: "usd", title: "x", income }),
    ).toMatchObject(badRequest);
    const budget = insertBudget(handle.db, { createdAt: 1 });
    expect(
      await invokeHandler(
        budgetHandlers.updateIncome,
        { db: handle.db },
        { budgetId: budget.id, income },
        "cushn:budgets.updateIncome",
      ),
    ).toMatchObject(badRequest);
  });

  it("creates with optional fields omitted or null", async () => {
    const { template } = insertTemplate(handle.db);
    expect(await create({ templateId: template.id, currency: "usd", title: "x" })).toMatchObject({
      ok: true,
    });
    expect(
      await create({
        templateId: template.id,
        currency: "usd",
        title: "y",
        description: null,
        labelId: null,
        viewId: null,
        icon: null,
      }),
    ).toMatchObject({ ok: true });
  });
});

describe("budgets icon args", () => {
  it("sets an icon name of up to 64 characters, and null clears it", async () => {
    const budget = insertBudget(handle.db, { createdAt: 1 });
    const success = { ok: true, data: { success: true } };

    expect(await setIcon({ budgetId: budget.id, icon: "piggy-bank" })).toEqual(success);
    expect(await setIcon({ budgetId: budget.id, icon: "x".repeat(64) })).toEqual(success);
    expect(await setIcon({ budgetId: budget.id, icon: null })).toEqual(success);
  });

  it.each([
    ["an empty icon", ""],
    ["an icon over 64 characters", "x".repeat(65)],
    ["a missing icon", undefined],
    ["a non-string icon", 7],
  ])("rejects %s with BAD_REQUEST", async (_name, icon) => {
    const budget = insertBudget(handle.db, { createdAt: 1 });
    expect(await setIcon({ budgetId: budget.id, icon })).toMatchObject(badRequest);
  });

  it.each([
    ["an empty icon", ""],
    ["an icon over 64 characters", "x".repeat(65)],
    ["a non-string icon", 7],
  ])("rejects creating with %s", async (_name, icon) => {
    const { template } = insertTemplate(handle.db);
    expect(
      await create({ templateId: template.id, currency: "usd", title: "x", icon }),
    ).toMatchObject(badRequest);
  });
});

describe("budgets trash args", () => {
  it("trashes, lists, restores and empties through the handlers", async () => {
    const budget = insertBudget(handle.db, { title: "Old", createdAt: 1 });
    const ctx = { db: handle.db };
    const budgetIds = [budget.id];

    expect(
      await invokeHandler(budgetHandlers.trash, ctx, { budgetIds }, "cushn:budgets.trash"),
    ).toEqual({ ok: true, data: { success: true } });
    expect(await listTrashed({ cursor: null, numItems: 25 })).toMatchObject({
      ok: true,
      data: { page: [{ title: "Old", status: "active" }], isDone: true },
    });
    expect(
      await invokeHandler(budgetHandlers.restore, ctx, { budgetIds }, "cushn:budgets.restore"),
    ).toEqual({ ok: true, data: { success: true } });
    expect(
      await invokeHandler(budgetHandlers.emptyTrash, ctx, undefined, "cushn:budgets.emptyTrash"),
    ).toEqual({ ok: true, data: { deletedCount: 0 } });
  });

  it("rejects ids that are not non-empty strings with BAD_REQUEST", async () => {
    const ctx = { db: handle.db };
    for (const budgetIds of [[""], [1], "x"]) {
      expect(
        await invokeHandler(budgetHandlers.trash, ctx, { budgetIds }, "cushn:budgets.trash"),
      ).toMatchObject(badRequest);
    }
  });
});
