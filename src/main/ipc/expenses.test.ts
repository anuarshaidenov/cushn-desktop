// The expenses handlers' argument validation (the repository is covered in repositories/expenses.test.ts).
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DatabaseHandle, openDatabase } from "../db";
import { budgetAllocations, budgets } from "../db/schema";
import { invokeHandler } from "./handler";
import { expenseHandlers } from "./expenses";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder, seed: false });
});

afterEach(() => {
  handle.close();
});

function setup() {
  const budgetId = handle.db
    .insert(budgets)
    .values({ title: "Budget", currency: "usd" })
    .returning({ id: budgets.id })
    .get().id;
  const allocationId = handle.db
    .insert(budgetAllocations)
    .values({ budgetId, categoryName: "Needs", percentage: 50, amount: 0, editable: true })
    .returning({ id: budgetAllocations.id })
    .get().id;
  return { budgetId, allocationId };
}

function create(input: unknown) {
  return invokeHandler(expenseHandlers.create, { db: handle.db }, input, "cushn:expenses.create");
}

function createMany(input: unknown) {
  return invokeHandler(
    expenseHandlers.createMany,
    { db: handle.db },
    input,
    "cushn:expenses.createMany",
  );
}

function update(input: unknown) {
  return invokeHandler(expenseHandlers.update, { db: handle.db }, input, "cushn:expenses.update");
}

function restoreMany(input: unknown) {
  return invokeHandler(
    expenseHandlers.restoreMany,
    { db: handle.db },
    input,
    "cushn:expenses.restoreMany",
  );
}

describe("expenses amount args", () => {
  it("accepts a finite amount", async () => {
    const ids = setup();
    expect(await create({ ...ids, amount: 12.5, title: "Coffee" })).toMatchObject({ ok: true });
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a numeric string", "12"],
  ])("rejects %s with BAD_REQUEST on create, createMany and update", async (_case, amount) => {
    const ids = setup();
    const bad = { ok: false, error: { code: "BAD_REQUEST" } };
    expect(await create({ ...ids, amount, title: "A" })).toMatchObject(bad);
    expect(await createMany({ ...ids, items: [{ title: "A", amount }] })).toMatchObject(bad);
    expect(await update({ expenseId: "some-id", amount, title: "A" })).toMatchObject(bad);
  });
});

describe("expenses.restoreMany args", () => {
  function row(ids: ReturnType<typeof setup>) {
    return {
      id: "restored-id",
      ...ids,
      amount: 12.5,
      title: "Coffee",
      description: null,
      order: 0,
      checked: false,
      createdAt: 1,
    };
  }

  it("accepts a full row and an empty list", async () => {
    const ids = setup();
    expect(await restoreMany({ expenses: [row(ids)] })).toEqual({
      ok: true,
      data: { success: true },
    });
    expect(await restoreMany({ expenses: [] })).toMatchObject({ ok: true });
  });

  it.each([
    ["an empty id", { id: "" }],
    ["a missing budgetId", { budgetId: undefined }],
    ["a NaN amount", { amount: Number.NaN }],
    ["a fractional order", { order: 1.5 }],
    ["a string checked", { checked: "true" }],
    ["an undefined description", { description: undefined }],
    ["an infinite createdAt", { createdAt: Number.POSITIVE_INFINITY }],
  ])("rejects %s with BAD_REQUEST", async (_name, patch) => {
    const ids = setup();
    expect(await restoreMany({ expenses: [{ ...row(ids), ...patch }] })).toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
  });
});
