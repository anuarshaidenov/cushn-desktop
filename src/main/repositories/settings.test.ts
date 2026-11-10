import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DatabaseHandle, openDatabase } from "../db";
import { userSettings } from "../db/schema";
import * as settings from "./settings";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder });
});

afterEach(() => {
  handle.close();
});

describe("settings.get", () => {
  it("returns the seeded defaults: usd, grid, light", () => {
    expect(settings.get(handle.db)).toEqual({
      settings: { currency: "usd", budgetView: "grid", theme: "light" },
    });
  });

  it("maps dark_mode to the theme", () => {
    handle.db.update(userSettings).set({ darkMode: true }).run();
    expect(settings.get(handle.db).settings.theme).toBe("dark");

    handle.db.update(userSettings).set({ darkMode: false }).run();
    expect(settings.get(handle.db).settings.theme).toBe("light");
  });
});

describe("settings.update", () => {
  it("patches only the given fields and returns { success: true }", () => {
    expect(settings.update(handle.db, { currency: "kzt" })).toEqual({ success: true });
    expect(settings.get(handle.db).settings).toEqual({
      currency: "kzt",
      budgetView: "grid",
      theme: "light",
    });

    settings.update(handle.db, { budgetView: "list" });
    expect(settings.get(handle.db).settings).toEqual({
      currency: "kzt",
      budgetView: "list",
      theme: "light",
    });
  });

  it("stores the theme as dark_mode, leaving language alone", () => {
    handle.db.update(userSettings).set({ language: "kk" }).run();

    settings.update(handle.db, { theme: "dark" });
    expect(handle.db.select().from(userSettings).get()).toMatchObject({
      darkMode: true,
      language: "kk",
    });

    settings.update(handle.db, { theme: "light" });
    expect(handle.db.select().from(userSettings).get()?.darkMode).toBe(false);
  });

  it("treats an empty patch as a no-op", () => {
    expect(settings.update(handle.db, {})).toEqual({ success: true });
    expect(settings.get(handle.db).settings).toEqual({
      currency: "usd",
      budgetView: "grid",
      theme: "light",
    });
  });
});
