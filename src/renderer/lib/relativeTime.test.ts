import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./relativeTime";

const now = new Date(2026, 5, 15, 12, 0).getTime();
const at = (...args: [number, number, number, number?, number?]) =>
  new Date(...args).getTime();

describe("formatRelativeTime", () => {
  it("reads under a minute as just now", () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe("just now");
  });

  it("counts minutes, then hours", () => {
    expect(formatRelativeTime(at(2026, 5, 15, 11, 55), now)).toBe(
      "5 minutes ago",
    );
    expect(formatRelativeTime(at(2026, 5, 15, 9, 0), now)).toBe("3 hours ago");
  });

  it("counts calendar days past 24 hours", () => {
    expect(formatRelativeTime(at(2026, 5, 14, 9, 0), now)).toBe("yesterday");
    expect(formatRelativeTime(at(2026, 5, 13, 23, 0), now)).toBe("2 days ago");
  });

  it("shows a date after a week, with the year only when it differs", () => {
    expect(formatRelativeTime(at(2026, 5, 1), now)).toBe("Jun 1");
    expect(formatRelativeTime(at(2025, 11, 31), now)).toBe("Dec 31, 2025");
  });
});
