/**
 * Runnable usage examples. Not imported by app code — intended as
 * documentation you can execute via `npx tsx src/lib/expressionParser/examples.ts`.
 */
import {
  createBudgetCurrencyRegistry,
  createCurrencyRegistry,
  createUnitRegistry,
  parseInput,
  tryParseInput,
} from "./index";

const cases = [
  "coffee 20k",
  "coffee 20k + 300k",
  "lunch 1.5k + 500",
  "iced coffee 20k",
  "groceries (10k + 5k) * 2",
  "  taxi   2.5k  -  500  ",
  "rent 1.2m",
  "broken input",
  "+ 10",
];

for (const input of cases) {
  const result = tryParseInput(input);
  console.log(JSON.stringify(input), "→", result);
}

// Plugin example: register a custom unit. Here, "h" means "hundred".
const units = createUnitRegistry();
units.register("h", 100);
console.log("custom unit:", parseInput("snack 5h + 50", { units }));

// Currency example: base = USD, snapshot of rates passed in. Glyphs and
// aliases ("$", "€", "₸", "тенге") resolve to their code's rate.
const currencies = createCurrencyRegistry({ usd: 1, eur: 1.17, kzt: 0.0021 });

const currencyCases = [
  "rent 200 eur",
  "rent 200eur",
  "groceries $200",
  "groceries $ 200",
  "snack 500₸",
  "trip 200 eur + 50 usd",
  "trip $200 + 50 eur",
  "rent 1.2k usd",
];

for (const input of currencyCases) {
  console.log(JSON.stringify(input), "→", tryParseInput(input, { currencies }));
}

// Budget example: a KZT budget with provider rates (units per one USD).
const kztBudget = createBudgetCurrencyRegistry("kzt", { usd: 1, kzt: 512.3, eur: 0.86 });
console.log(parseInput("rent 200 usd + 34 eur + 32 kzt", { currencies: kztBudget }));
