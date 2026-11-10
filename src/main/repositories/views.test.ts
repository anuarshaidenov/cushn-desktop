import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_BUDGET_VIEW_DESCRIPTION_LENGTH, MAX_FAVORITE_BUDGET_VIEWS } from "@shared/constants";
import { type Id, asId } from "@shared/domain";
import { CushnError, type CushnErrorCode } from "@shared/errors";
import { type DatabaseHandle, openDatabase } from "../db";
import { type NewBudgetViewRow, budgetViews, budgets } from "../db/schema";
import * as views from "./views";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

const missingId = asId<"budgetViews">("00000000-0000-0000-0000-000000000000");

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder, seed: false });
});

afterEach(() => {
  handle.close();
});

function getView(viewId: Id<"budgetViews">) {
  return views.get(handle.db, { viewId }).view;
}

function insertViews(rows: NewBudgetViewRow[]) {
  handle.db.insert(budgetViews).values(rows).run();
}

function expectError(fn: () => unknown, code: CushnErrorCode, message: string) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CushnError);
  expect(caught).toMatchObject({ code, message });
}

describe("views.create", () => {
  it("trims the title, starts unfavorited and returns the id directly", () => {
    const viewId = views.create(handle.db, { title: "  Trips  " });

    expect(typeof viewId).toBe("string");
    expect(getView(viewId)).toMatchObject({
      id: viewId,
      title: "Trips",
      description: null,
      isFavorite: false,
    });
  });

  it("rejects a blank title with BAD_REQUEST 'Title is required'", () => {
    expectError(() => views.create(handle.db, { title: "   " }), "BAD_REQUEST", "Title is required");
    expect(views.list(handle.db).views).toEqual([]);
  });

  it("trims the description and stores it", () => {
    const viewId = views.create(handle.db, { title: "Trips", description: "  abroad  " });
    expect(getView(viewId)?.description).toBe("abroad");
  });

  it("does not store an empty description (blank or null)", () => {
    const blank = views.create(handle.db, { title: "A", description: "   " });
    const none = views.create(handle.db, { title: "B", description: null });
    expect(getView(blank)?.description).toBeNull();
    expect(getView(none)?.description).toBeNull();
  });

  it(`limits the trimmed description to ${MAX_BUDGET_VIEW_DESCRIPTION_LENGTH} characters`, () => {
    const atLimit = "x".repeat(MAX_BUDGET_VIEW_DESCRIPTION_LENGTH);
    const viewId = views.create(handle.db, { title: "A", description: ` ${atLimit} ` });
    expect(getView(viewId)?.description).toBe(atLimit);

    expectError(
      () => views.create(handle.db, { title: "B", description: `${atLimit}x` }),
      "BAD_REQUEST",
      "Description must be at most 280 characters",
    );
    expect(views.list(handle.db).views).toHaveLength(1);
  });
});

describe("views.list", () => {
  it("returns { views } with id, title, description, isFavorite, createdAt, newest first", () => {
    const first = views.create(handle.db, { title: "First" });
    const second = views.create(handle.db, { title: "Second" });

    const { views: rows } = views.list(handle.db);

    expect(rows.map((v) => v.id)).toEqual([second, first]);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "createdAt",
      "description",
      "id",
      "isFavorite",
      "title",
    ]);
  });

  it("orders Views created in the same millisecond by id, descending", () => {
    insertViews([
      { id: asId<"budgetViews">("a"), title: "A", createdAt: 1 },
      { id: asId<"budgetViews">("b"), title: "B", createdAt: 1 },
      { id: asId<"budgetViews">("c"), title: "C", createdAt: 2 },
    ]);

    expect(views.list(handle.db).views.map((v) => v.title)).toEqual(["C", "B", "A"]);
  });
});

describe("views.listFavorites", () => {
  it("returns only favorites, newest first", () => {
    insertViews([
      { id: asId<"budgetViews">("a"), title: "A", isFavorite: true, createdAt: 1 },
      { id: asId<"budgetViews">("b"), title: "B", isFavorite: false, createdAt: 2 },
      { id: asId<"budgetViews">("c"), title: "C", isFavorite: true, createdAt: 3 },
    ]);

    const { views: rows } = views.listFavorites(handle.db);

    expect(rows.map((v) => v.title)).toEqual(["C", "A"]);
    expect(rows.every((v) => v.isFavorite)).toBe(true);
  });
});

describe("views.get", () => {
  it("returns { view } for an existing View", () => {
    const viewId = views.create(handle.db, { title: "Trips", description: "abroad" });

    expect(views.get(handle.db, { viewId })).toEqual({
      view: {
        id: viewId,
        title: "Trips",
        description: "abroad",
        isFavorite: false,
        createdAt: expect.any(Number),
      },
    });
  });

  it("returns { view: null } for a missing id instead of throwing", () => {
    expect(views.get(handle.db, { viewId: missingId })).toEqual({ view: null });
  });
});

describe("views.update", () => {
  it("trims and patches only the given field, returning null", () => {
    const viewId = views.create(handle.db, { title: "Trips", description: "abroad" });

    expect(views.update(handle.db, { viewId, title: "  Travel  " })).toBeNull();
    expect(getView(viewId)).toMatchObject({ title: "Travel", description: "abroad" });

    views.update(handle.db, { viewId, description: "  overseas " });
    expect(getView(viewId)).toMatchObject({ title: "Travel", description: "overseas" });
  });

  it("rejects a blank title with BAD_REQUEST 'Title cannot be empty'", () => {
    const viewId = views.create(handle.db, { title: "Trips" });

    expectError(
      () => views.update(handle.db, { viewId, title: "  " }),
      "BAD_REQUEST",
      "Title cannot be empty",
    );
    expect(getView(viewId)?.title).toBe("Trips");
  });

  it("clears the description when given a blank one or null", () => {
    // `null` is the local spelling of "clear".
    const blank = views.create(handle.db, { title: "A", description: "x" });
    const none = views.create(handle.db, { title: "B", description: "y" });

    views.update(handle.db, { viewId: blank, description: "   " });
    views.update(handle.db, { viewId: none, description: null });

    expect(getView(blank)?.description).toBeNull();
    expect(getView(none)?.description).toBeNull();
  });

  it(`limits the trimmed description to ${MAX_BUDGET_VIEW_DESCRIPTION_LENGTH} characters`, () => {
    const viewId = views.create(handle.db, { title: "A", description: "keep" });

    expectError(
      () =>
        views.update(handle.db, {
          viewId,
          title: "Changed",
          description: "x".repeat(MAX_BUDGET_VIEW_DESCRIPTION_LENGTH + 1),
        }),
      "BAD_REQUEST",
      "Description must be at most 280 characters",
    );
    expect(getView(viewId)).toMatchObject({ title: "A", description: "keep" });
  });

  it("rejects an update with neither title nor description as BAD_REQUEST", () => {
    // Checked before the View is looked up.
    expectError(
      () => views.update(handle.db, { viewId: missingId }),
      "BAD_REQUEST",
      "Provide title and/or description to update",
    );
  });

  it("throws NOT_FOUND 'View not found' for a missing View", () => {
    expectError(
      () => views.update(handle.db, { viewId: missingId, title: "x" }),
      "NOT_FOUND",
      "View not found",
    );
  });
});

describe("views.toggleFavorite", () => {
  it("flips the flag and returns the new value", () => {
    const viewId = views.create(handle.db, { title: "Trips" });

    expect(views.toggleFavorite(handle.db, { viewId })).toBe(true);
    expect(getView(viewId)?.isFavorite).toBe(true);
    expect(views.toggleFavorite(handle.db, { viewId })).toBe(false);
    expect(getView(viewId)?.isFavorite).toBe(false);
  });

  it(`refuses to turn on a ${MAX_FAVORITE_BUDGET_VIEWS + 1}st favorite, but still turns one off`, () => {
    // The cap applies to toggling on only.
    insertViews(
      Array.from({ length: MAX_FAVORITE_BUDGET_VIEWS }, (_, i) => ({
        title: `Fav ${i}`,
        isFavorite: true,
      })),
    );
    const extra = views.create(handle.db, { title: "Extra" });

    expectError(
      () => views.toggleFavorite(handle.db, { viewId: extra }),
      "BAD_REQUEST",
      "You can favorite up to 20 views",
    );
    expect(getView(extra)?.isFavorite).toBe(false);

    const favorite = views.listFavorites(handle.db).views[0];
    expect(views.toggleFavorite(handle.db, { viewId: favorite.id })).toBe(false);
    expect(views.toggleFavorite(handle.db, { viewId: extra })).toBe(true);
    expect(views.listFavorites(handle.db).views).toHaveLength(MAX_FAVORITE_BUDGET_VIEWS);
  });

  it("throws NOT_FOUND 'View not found' for a missing View", () => {
    expectError(
      () => views.toggleFavorite(handle.db, { viewId: missingId }),
      "NOT_FOUND",
      "View not found",
    );
  });
});

describe("views.delete", () => {
  it("removes the View and returns null", () => {
    const viewId = views.create(handle.db, { title: "Trips" });

    expect(views.delete(handle.db, { viewId })).toBeNull();

    expect(getView(viewId)).toBeNull();
    expect(views.list(handle.db).views).toEqual([]);
  });

  it("clears view_id on every budget in the View, archived ones included, and keeps the budgets", () => {
    // ON DELETE SET NULL, with no status filter.
    const viewId = views.create(handle.db, { title: "Trips" });
    const otherViewId = views.create(handle.db, { title: "Home" });
    handle.db
      .insert(budgets)
      .values([
        { id: asId<"budgets">("active"), title: "A", currency: "usd", viewId },
        {
          id: asId<"budgets">("archived"),
          title: "B",
          currency: "usd",
          viewId,
          status: "archived",
        },
        { id: asId<"budgets">("other"), title: "C", currency: "usd", viewId: otherViewId },
      ])
      .run();

    views.delete(handle.db, { viewId });

    const rows = handle.db
      .select({ id: budgets.id, status: budgets.status, viewId: budgets.viewId })
      .from(budgets)
      .orderBy(budgets.id)
      .all();
    expect(rows).toEqual([
      { id: "active", status: "active", viewId: null },
      { id: "archived", status: "archived", viewId: null },
      { id: "other", status: "active", viewId: otherViewId },
    ]);
  });

  it("throws NOT_FOUND 'View not found' for a missing View", () => {
    expectError(() => views.delete(handle.db, { viewId: missingId }), "NOT_FOUND", "View not found");
  });
});
