import { z } from "zod";
import { RATES_ATTRIBUTION } from "@shared/api";
import { defineTool } from "../tool";

const getExchangeRates = defineTool({
  kind: "read",
  name: "get_exchange_rates",
  description:
    "Returns today's exchange rates: { exchangeRates, attribution }. exchangeRates.rates maps " +
    "a lowercase ISO 4217 code to units of that currency per 1 USD, so X in currency a is " +
    "X / rates[a] × rates[b] in currency b; updatedAt and fetchedAt are ISO timestamps. It is " +
    "the last rates the app fetched when offline, and null if it never fetched any. Use them " +
    "to convert an amount before saving it into a budget, or to compare budgets; stored " +
    "amounts are never converted. Credit attribution (label and url) wherever you show " +
    "converted amounts or rates: the provider's terms ask for it.",
  input: z.object({}),
  run: async ({ db, rates }) => ({
    exchangeRates: await rates.get(db),
    attribution: RATES_ATTRIBUTION,
  }),
});

export const rateTools = [getExchangeRates];
