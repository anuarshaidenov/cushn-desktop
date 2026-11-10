import { describe, expect, it } from "vitest";
import { formatTrashDaysLeft, trashDaysLeft } from "./trash";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 5, 15, 12, 0).getTime();

describe("trashDaysLeft", () => {
  it("starts at the full retention", () => {
    expect(trashDaysLeft(now, now)).toBe(30);
  });

  it("rounds a part day up", () => {
    expect(trashDaysLeft(now - 3.5 * DAY, now)).toBe(27);
    expect(trashDaysLeft(now - 29.9 * DAY, now)).toBe(1);
  });

  it("stops at zero once the purge is due", () => {
    expect(trashDaysLeft(now - 30 * DAY, now)).toBe(0);
    expect(trashDaysLeft(now - 45 * DAY, now)).toBe(0);
  });
});

describe("formatTrashDaysLeft", () => {
  it("counts days and names the due case", () => {
    expect(formatTrashDaysLeft(27)).toBe("27 days left");
    expect(formatTrashDaysLeft(1)).toBe("1 day left");
    expect(formatTrashDaysLeft(0)).toBe("Deleted at next launch");
  });
});
