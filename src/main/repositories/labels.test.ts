import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asId } from "@shared/domain";
import { CushnError } from "@shared/errors";
import { type DatabaseHandle, openDatabase } from "../db";
import { budgetLabels, budgets } from "../db/schema";
import * as labels from "./labels";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");
const missingId = asId<"budgetLabels">("00000000-0000-0000-0000-000000000000");

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder });
});

afterEach(() => {
  handle.close();
});

function expectNotFound(fn: () => unknown) {
  expect(fn).toThrow(new CushnError("NOT_FOUND", "Label not found"));
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CushnError);
    expect((error as CushnError).code).toBe("NOT_FOUND");
  }
}

describe("labels.list", () => {
  it("returns { labels } with id, name, color, createdAt, seeded labels first", () => {
    // Seeded labels first, then the user's.
    const { labelId } = labels.create(handle.db, { name: "Travel", color: "#000000" });

    const { labels: rows } = labels.list(handle.db);

    expect(rows.map((l) => l.name)).toEqual([
      "Daily",
      "Weekly",
      "Monthly",
      "Yearly",
      "One-time",
      "Travel",
    ]);
    expect(Object.keys(rows[0]).sort()).toEqual(["color", "createdAt", "id", "name"]);
    expect(rows.at(-1)).toMatchObject({ id: labelId, name: "Travel", color: "#000000" });
  });

  it("orders labels created in the same millisecond by id", () => {
    handle.db.delete(budgetLabels).run();
    handle.db
      .insert(budgetLabels)
      .values([
        { id: asId<"budgetLabels">("b"), name: "B", color: "#111111", createdAt: 1 },
        { id: asId<"budgetLabels">("a"), name: "A", color: "#222222", createdAt: 1 },
        { id: asId<"budgetLabels">("c"), name: "C", color: "#333333", createdAt: 0 },
      ])
      .run();

    expect(labels.list(handle.db).labels.map((l) => l.name)).toEqual(["C", "A", "B"]);
  });
});

describe("labels.create", () => {
  it("inserts the label and returns { labelId }", () => {
    const { labelId } = labels.create(handle.db, { name: "Travel", color: "#123456" });

    const row = handle.db.select().from(budgetLabels).where(eq(budgetLabels.id, labelId)).get();
    expect(row).toMatchObject({ name: "Travel", color: "#123456" });
  });

  it("does no validation: duplicate and empty names are allowed", () => {
    // Any strings are accepted; names are not unique.
    labels.create(handle.db, { name: "Daily", color: "#06B6D4" });
    labels.create(handle.db, { name: "", color: "" });

    const names = labels.list(handle.db).labels.map((l) => l.name);
    expect(names.filter((n) => n === "Daily")).toHaveLength(2);
    expect(names).toContain("");
  });

  it("gives each new label a later position in the list", () => {
    const first = labels.create(handle.db, { name: "One", color: "#000000" });
    const second = labels.create(handle.db, { name: "Two", color: "#000000" });

    const ids = labels.list(handle.db).labels.map((l) => l.id);
    expect(ids.indexOf(first.labelId)).toBeLessThan(ids.indexOf(second.labelId));
  });
});

describe("labels.updateColor", () => {
  it("patches only the color and returns { success: true }", () => {
    const { labelId } = labels.create(handle.db, { name: "Travel", color: "#000000" });

    expect(labels.updateColor(handle.db, { labelId, color: "#FFFFFF" })).toEqual({
      success: true,
    });

    const row = handle.db.select().from(budgetLabels).where(eq(budgetLabels.id, labelId)).get();
    expect(row).toMatchObject({ name: "Travel", color: "#FFFFFF" });
  });

  it("lets the seeded labels be edited too", () => {
    const daily = labels.list(handle.db).labels[0];
    labels.updateColor(handle.db, { labelId: daily.id, color: "#000000" });
    expect(labels.list(handle.db).labels[0].color).toBe("#000000");
  });

  it("throws NOT_FOUND 'Label not found' for a missing label", () => {
    expectNotFound(() => labels.updateColor(handle.db, { labelId: missingId, color: "#000000" }));
  });
});

describe("labels.updateName", () => {
  it("patches only the name and returns { success: true }", () => {
    const { labelId } = labels.create(handle.db, { name: "Travel", color: "#000000" });

    expect(labels.updateName(handle.db, { labelId, name: "Trips" })).toEqual({ success: true });

    const row = handle.db.select().from(budgetLabels).where(eq(budgetLabels.id, labelId)).get();
    expect(row).toMatchObject({ name: "Trips", color: "#000000" });
  });

  it("throws NOT_FOUND 'Label not found' for a missing label", () => {
    expectNotFound(() => labels.updateName(handle.db, { labelId: missingId, name: "x" }));
  });
});

describe("labels.delete", () => {
  it("removes the label and returns { success: true }", () => {
    const { labelId } = labels.create(handle.db, { name: "Travel", color: "#000000" });

    expect(labels.delete(handle.db, { labelId })).toEqual({ success: true });

    expect(labels.list(handle.db).labels.map((l) => l.id)).not.toContain(labelId);
  });

  it("unlinks budgets that carried the label instead of deleting them", () => {
    // ON DELETE SET NULL unlinks them.
    const { labelId } = labels.create(handle.db, { name: "Travel", color: "#000000" });
    handle.db.update(budgets).set({ labelId }).run();

    labels.delete(handle.db, { labelId });

    const rows = handle.db.select().from(budgets).all();
    expect(rows).toHaveLength(3);
    expect(rows.every((b) => b.labelId === null)).toBe(true);
  });

  it("throws NOT_FOUND 'Label not found' for a missing label", () => {
    expectNotFound(() => labels.delete(handle.db, { labelId: missingId }));
  });
});
