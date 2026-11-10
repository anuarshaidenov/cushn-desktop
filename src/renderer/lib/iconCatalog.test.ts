import { describe, expect, it } from "vitest";
import { ICON_GROUPS, findIcon, matchesIconQuery } from "./iconCatalog";

const icons = ICON_GROUPS.flatMap((group) => group.items);

const search = (query: string) =>
  icons
    .filter((icon) => matchesIconQuery(icon, query))
    .map((icon) => icon.name);

describe("ICON_GROUPS", () => {
  it("keys every icon by a unique kebab-case name", () => {
    const names = icons.map((icon) => icon.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("uses each picture and label once", () => {
    expect(new Set(icons.map((icon) => icon.picture)).size).toBe(icons.length);
    expect(new Set(icons.map((icon) => icon.label)).size).toBe(icons.length);
  });
});

describe("findIcon", () => {
  it("finds an icon by name and nothing for unknown or empty names", () => {
    expect(findIcon("piggy-bank")?.label).toBe("Piggy bank");
    expect(findIcon("no-such-icon")).toBeUndefined();
    expect(findIcon(null)).toBeUndefined();
  });
});

describe("matchesIconQuery", () => {
  it("matches the start of any word in the label, keywords or group", () => {
    expect(search("pigg")).toEqual(["piggy-bank"]);
    expect(search("salary")).toEqual(["income"]);
    expect(search("food")).toContain("pizza");
  });

  it("needs every query word, in any order and case", () => {
    expect(search("Cream ICE")).toEqual(["ice-cream"]);
    expect(search("ice hockey")).toEqual([]);
  });

  it("does not match inside a word", () => {
    expect(search("ash")).not.toContain("cash");
  });

  it("matches everything for a blank query", () => {
    expect(search("  ")).toHaveLength(icons.length);
  });
});
