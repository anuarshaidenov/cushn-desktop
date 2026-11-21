import { describe, expect, it } from "vitest";
import { nearestInDirection } from "./arrowNavigation";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

// A sidebar at x 0–200 and a grid of 200 × 142 cards from x 300, 16 px apart.
const sidebarItem = (row: number) => rect(0, row * 32, 200, 32);
const card = (row: number, column: number) =>
  rect(300 + column * 216, row * 158, 200, 142);

describe("nearestInDirection", () => {
  it("moves down a list to the next row, not one further", () => {
    const candidates = [sidebarItem(2), sidebarItem(1)];
    expect(nearestInDirection(sidebarItem(0), candidates, "down")).toBe(1);
    expect(nearestInDirection(sidebarItem(2), candidates, "up")).toBe(1);
  });

  it("counts rows that touch or overlap by a fraction of a pixel", () => {
    const below = { ...sidebarItem(1), top: 31.5 };
    expect(nearestInDirection(sidebarItem(0), [below], "down")).toBe(0);
  });

  it("keeps up and down to the column", () => {
    expect(nearestInDirection(sidebarItem(3), [card(1, 0)], "down")).toBe(-1);
  });

  it("moves down a grid within the column", () => {
    const nextRow = [card(1, 0), card(1, 1), card(1, 2), card(1, 3)];
    expect(nearestInDirection(card(0, 2), nextRow, "down")).toBe(2);
  });

  it("stays put when the next row has nothing in the column", () => {
    const shortRow = [card(1, 0), card(1, 1)];
    expect(nearestInDirection(card(0, 3), shortRow, "down")).toBe(-1);
  });

  it("takes the candidate centred nearest the origin when several share the column", () => {
    const header = rect(700, -50, 60, 30);
    expect(nearestInDirection(header, [card(0, 1), card(0, 2)], "down")).toBe(
      1,
    );
  });

  it("prefers the same row for left and right", () => {
    const farAbove = sidebarItem(0);
    const sameRow = rect(0, 170, 200, 32);
    expect(nearestInDirection(card(1, 0), [farAbove, sameRow], "left")).toBe(1);
    expect(nearestInDirection(card(1, 0), [card(1, 1)], "right")).toBe(0);
  });

  it("falls back to the nearest item past the edge when none shares the row", () => {
    const candidates = [sidebarItem(0), sidebarItem(5)];
    expect(nearestInDirection(card(4, 0), candidates, "left")).toBe(1);
    expect(nearestInDirection(card(0, 3), [card(1, 0)], "right")).toBe(-1);
  });

  it("skips items that contain or overlap the origin", () => {
    const menuButton = rect(480, 10, 16, 16);
    const ownCard = card(0, 0);
    expect(nearestInDirection(menuButton, [ownCard, card(0, 1)], "right")).toBe(
      1,
    );
    expect(nearestInDirection(menuButton, [ownCard], "down")).toBe(-1);
  });
});
