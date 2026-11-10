/**
 * Exchange rates: USD-based daily rates from open.er-api.com, cached in
 * `app_meta` (not backed up). Electron-free: `fetch` and the clock are
 * injected; `src/main/index.ts` passes Electron's `net.fetch`.
 *
 * - A cache younger than `RATES_MAX_AGE_MS` is served without a request.
 * - Otherwise one request (concurrent callers share it); any failure answers
 *   the stale cache, or `null` without one, and never reaches the renderer.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ExchangeRates } from "@shared/api";
import type { AppDatabase } from "../db";
import { appMeta } from "../db/schema";

export const RATES_URL = "https://open.er-api.com/v6/latest/USD";
export const RATES_CACHE_KEY = "exchange_rates";
export const RATES_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

export interface RatesDependencies {
  fetch(url: string, init: { signal: AbortSignal }): Promise<Response>;
  now(): number;
}

export interface Rates {
  get(db: AppDatabase): Promise<ExchangeRates | null>;
}

const latestSchema = z.object({
  result: z.literal("success"),
  time_last_update_unix: z.number(),
  base_code: z.literal("USD"),
  rates: z.record(z.string(), z.number().positive()),
});

const cachedSchema = z.object({
  rates: z.record(z.string(), z.number()),
  updatedAt: z.string(),
  fetchedAt: z.string(),
});

/** The provider's response as `ExchangeRates`; throws on anything else. */
export function parseLatest(body: unknown, fetchedAt: number): ExchangeRates {
  const latest = latestSchema.parse(body);
  return {
    rates: Object.fromEntries(
      Object.entries(latest.rates).map(([code, rate]) => [code.toLowerCase(), rate]),
    ),
    updatedAt: new Date(latest.time_last_update_unix * 1000).toISOString(),
    fetchedAt: new Date(fetchedAt).toISOString(),
  };
}

/** A missing or unreadable cache reads as `null`. */
export function readCache(db: AppDatabase): ExchangeRates | null {
  const row = db.select().from(appMeta).where(eq(appMeta.key, RATES_CACHE_KEY)).get();
  if (!row) return null;
  try {
    return cachedSchema.parse(JSON.parse(row.value));
  } catch {
    return null;
  }
}

export function writeCache(db: AppDatabase, rates: ExchangeRates): void {
  const value = JSON.stringify(rates);
  db.transaction((tx) => {
    tx.insert(appMeta)
      .values({ key: RATES_CACHE_KEY, value })
      .onConflictDoUpdate({ target: appMeta.key, set: { value } })
      .run();
  });
}

export function createRates({ fetch, now }: RatesDependencies): Rates {
  let inFlight: Promise<ExchangeRates | null> | null = null;

  async function refresh(db: AppDatabase, cached: ExchangeRates | null) {
    let fresh: ExchangeRates;
    try {
      const response = await fetch(RATES_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      fresh = parseLatest(await response.json(), now());
    } catch (error) {
      console.warn("[rates] could not fetch exchange rates", error);
      return cached;
    }
    writeCache(db, fresh);
    return fresh;
  }

  return {
    get(db) {
      const cached = readCache(db);
      if (cached) {
        const age = now() - Date.parse(cached.fetchedAt);
        if (age >= 0 && age < RATES_MAX_AGE_MS) return Promise.resolve(cached);
      }
      inFlight ??= refresh(db, cached).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
