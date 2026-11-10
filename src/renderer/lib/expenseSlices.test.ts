import { describe, expect, it } from "vitest";
import { formatShare, toExpenseSlices } from "./expenseSlices";

const expense = (name: string, value: number) => ({ name, value });

describe("toExpenseSlices", () => {
  it("sorts largest first and keeps creation order on ties", () => {
    const { slices } = toExpenseSlices([
      expense("Rent", 100),
      expense("Food", 300),
      expense("Taxi", 100),
    ]);
    expect(slices.map((slice) => slice.name)).toEqual(["Food", "Rent", "Taxi"]);
  });

  it("gives the first eight a palette slot and the rest the neutral", () => {
    const { slices } = toExpenseSlices(
      Array.from({ length: 10 }, (_, i) => expense(`#${i}`, 10 - i)),
    );
    expect(slices.map((slice) => slice.color)).toEqual([
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
      "var(--chart-6)",
      "var(--chart-7)",
      "var(--chart-8)",
      "var(--chart-other)",
      "var(--chart-other)",
    ]);
  });

  it("leaves out amounts of zero or less and shares the rest", () => {
    const { slices, total } = toExpenseSlices([
      expense("Refund", -50),
      expense("Draft", 0),
      expense("Food", 30),
      expense("Rent", 10),
    ]);
    expect(total).toBe(40);
    expect(slices.map((slice) => [slice.name, slice.share])).toEqual([
      ["Food", 0.75],
      ["Rent", 0.25],
    ]);
  });

  it("rounds the total to cents and names blank titles", () => {
    const { slices, total } = toExpenseSlices([
      expense("  ", 0.1),
      expense("Tea", 0.2),
    ]);
    expect(total).toBe(0.3);
    expect(slices[1]?.name).toBe("Untitled");
  });

  it("is empty when nothing is spent", () => {
    expect(toExpenseSlices([]).slices).toEqual([]);
    expect(toExpenseSlices([expense("Draft", 0)]).slices).toEqual([]);
  });
});

describe("formatShare", () => {
  it("rounds to whole percents without hiding a slice as 0% or 100%", () => {
    expect(formatShare(0.194)).toBe("19%");
    expect(formatShare(1)).toBe("100%");
    expect(formatShare(0.004)).toBe("<1%");
    expect(formatShare(0.996)).toBe(">99%");
  });
});
