import { describe, expect, it } from "vitest";
import { roundMoney, sumsTo100 } from "./money";

describe("roundMoney", () => {
  it("keeps values that already have at most 2 decimals", () => {
    expect(roundMoney(5000)).toBe(5000);
    expect(roundMoney(12.5)).toBe(12.5);
    expect(roundMoney(19.99)).toBe(19.99);
  });

  it("rounds computed allocation amounts to cents", () => {
    expect(roundMoney((333.33 * 33) / 100)).toBe(110);
    expect(roundMoney((1000 * 33.333) / 100)).toBe(333.33);
    expect(roundMoney((5000 * 33) / 100)).toBe(1650);
  });

  it("removes float drift from sums", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("rounds halves away from zero, including ones just below the half in binary", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(0.285)).toBe(0.29);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(-2.5)).toBe(-2.5);
    expect(roundMoney(0.004)).toBe(0);
    expect(roundMoney(123456789.125)).toBe(123456789.13);
  });

  it("is idempotent, leaving values too large for exact cents unchanged", () => {
    for (const value of [
      9999999999999.99, 11258999068426.24, 20000000000000.07, 30000000000000.07,
    ]) {
      const once = roundMoney(value);
      expect(roundMoney(once)).toBe(once);
    }
    expect(roundMoney(30000000000000.07)).toBe(30000000000000.07);
    expect(roundMoney(-30000000000000.07)).toBe(-30000000000000.07);
    expect(roundMoney(9999999999999.99)).toBe(9999999999999.99);
  });

  it("never returns negative zero", () => {
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
    expect(Object.is(roundMoney(-0), 0)).toBe(true);
  });
});

describe("sumsTo100", () => {
  it("accepts splits that sum to 100", () => {
    expect(sumsTo100([50, 30, 20])).toBe(true);
  });

  it("accepts a float sum that rounds to 100", () => {
    // 33.4 + 33.3 + 33.3 === 99.99999999999999
    expect(sumsTo100([33.4, 33.3, 33.3])).toBe(true);
  });

  it("rejects sums a cent off", () => {
    expect(sumsTo100([49.99, 50])).toBe(false);
    expect(sumsTo100([50, 50.01])).toBe(false);
    expect(sumsTo100([33.33, 33.33, 33.33])).toBe(false);
  });
});
