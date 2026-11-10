// The exchange rates tool over MCP. The rates service is covered in
// repositories/rates.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { type ExchangeRates, RATES_ATTRIBUTION } from "@shared/api";
import { type McpHarness, connectMcp } from "../testing";

let mcp: McpHarness;

afterEach(async () => {
  await mcp.close();
});

describe("get_exchange_rates", () => {
  it("returns the rates with the provider's attribution", async () => {
    const rates: ExchangeRates = {
      rates: { usd: 1, eur: 0.9 },
      updatedAt: "2026-10-30T00:00:00.000Z",
      fetchedAt: "2026-10-30T01:00:00.000Z",
    };
    mcp = await connectMcp({ rates: { get: async () => rates } });

    expect(await mcp.call("get_exchange_rates")).toEqual({
      ok: true,
      data: { exchangeRates: rates, attribution: RATES_ATTRIBUTION },
    });
  });

  it("answers null rates when the app has none, offline with no cache", async () => {
    mcp = await connectMcp();

    expect(await mcp.call("get_exchange_rates")).toEqual({
      ok: true,
      data: { exchangeRates: null, attribution: RATES_ATTRIBUTION },
    });
  });
});
