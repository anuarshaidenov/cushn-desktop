import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExchangeRates } from "@shared/api";
import { type DatabaseHandle, openDatabase } from "../db";
import { appMeta } from "../db/schema";
import {
  RATES_CACHE_KEY,
  RATES_MAX_AGE_MS,
  RATES_URL,
  type RatesDependencies,
  createRates,
  readCache,
  writeCache,
} from "./rates";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

const latest = {
  result: "success",
  time_last_update_unix: Date.parse("2026-10-28T00:02:31.000Z") / 1000,
  base_code: "USD",
  rates: { USD: 1, KZT: 512.3, AED: 3.6725 },
};

const fetched: ExchangeRates = {
  rates: { usd: 1, kzt: 512.3, aed: 3.6725 },
  updatedAt: "2026-10-28T00:02:31.000Z",
  fetchedAt: new Date(NOW).toISOString(),
};

function cachedAt(fetchedAt: number): ExchangeRates {
  return {
    rates: { usd: 1, kzt: 480 },
    updatedAt: "2026-10-20T00:00:00.000Z",
    fetchedAt: new Date(fetchedAt).toISOString(),
  };
}

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  handle.close();
  vi.restoreAllMocks();
});

function setup(respond: () => Promise<Response>) {
  const fetch = vi.fn<RatesDependencies["fetch"]>(respond);
  return { fetch, rates: createRates({ fetch, now: () => NOW }) };
}

const json = (body: unknown) => () => Promise.resolve(Response.json(body));

describe("rates.get", () => {
  it("serves a cache younger than 12 hours without fetching", async () => {
    const cached = cachedAt(NOW - RATES_MAX_AGE_MS + HOUR);
    writeCache(handle.db, cached);
    const { fetch, rates } = setup(json(latest));

    expect(await rates.get(handle.db)).toEqual(cached);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches when the cache is stale, lowercases the codes and stores the result", async () => {
    writeCache(handle.db, cachedAt(NOW - RATES_MAX_AGE_MS));
    const { fetch, rates } = setup(json(latest));

    expect(await rates.get(handle.db)).toEqual(fetched);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(RATES_URL);
    expect(readCache(handle.db)).toEqual(fetched);
  });

  it("fetches when there is no cache", async () => {
    const { rates } = setup(json(latest));

    expect(await rates.get(handle.db)).toEqual(fetched);
    expect(readCache(handle.db)).toEqual(fetched);
  });

  it("answers the stale cache when the fetch fails, and warns", async () => {
    const stale = cachedAt(NOW - 3 * 24 * HOUR);
    writeCache(handle.db, stale);
    const { rates } = setup(() => Promise.reject(new TypeError("net::ERR_INTERNET_DISCONNECTED")));

    expect(await rates.get(handle.db)).toEqual(stale);
    expect(readCache(handle.db)).toEqual(stale);
    expect(console.warn).toHaveBeenCalled();
  });

  it("answers null when the fetch fails and nothing is cached", async () => {
    const { rates } = setup(() => Promise.reject(new Error("timeout")));

    expect(await rates.get(handle.db)).toBeNull();
    expect(readCache(handle.db)).toBeNull();
  });

  it.each([
    ["an error result", { result: "error", "error-type": "unknown-code" }],
    ["a missing rates object", { ...latest, rates: undefined }],
    ["a non-numeric rate", { ...latest, rates: { USD: 1, KZT: "512" } }],
    ["another base currency", { ...latest, base_code: "EUR" }],
  ])("treats %s as a failure", async (_case, body) => {
    const stale = cachedAt(NOW - RATES_MAX_AGE_MS);
    writeCache(handle.db, stale);
    const { rates } = setup(json(body));

    expect(await rates.get(handle.db)).toEqual(stale);
    expect(readCache(handle.db)).toEqual(stale);
  });

  it("treats an HTTP error as a failure", async () => {
    const { rates } = setup(() => Promise.resolve(new Response("busy", { status: 503 })));

    expect(await rates.get(handle.db)).toBeNull();
  });

  it("shares one fetch between concurrent calls", async () => {
    const { fetch, rates } = setup(json(latest));

    const [first, second] = await Promise.all([rates.get(handle.db), rates.get(handle.db)]);

    expect(first).toEqual(fetched);
    expect(second).toEqual(fetched);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("reads an unreadable cache as none", async () => {
    writeCache(handle.db, cachedAt(NOW));
    handle.db.update(appMeta).set({ value: "{" }).where(eq(appMeta.key, RATES_CACHE_KEY)).run();

    expect(readCache(handle.db)).toBeNull();
  });
});
