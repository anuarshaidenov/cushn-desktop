// Characterization tests for the expression parser copied from the web app (index.ts and friends).
import { describe, expect, it } from "vitest";
import { CURRENCIES } from "@/constants";
import {
  createBudgetCurrencyRegistry,
  createCurrencyRegistry,
  createUnitRegistry,
  parseInput,
  parseInputLenient,
  ParseError,
  tokenize,
  tryParseInput,
} from "./index";

// Same rate snapshot as examples.ts (base = USD).
const currencies = createCurrencyRegistry({ usd: 1, eur: 1.17, kzt: 0.0021 });

function parseErrorOf(fn: () => unknown): ParseError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ParseError);
    return e as ParseError;
  }
  throw new Error("expected a ParseError");
}

describe("examples.ts cases (tryParseInput, default units)", () => {
  it.each([
    ["coffee 20k", { title: "coffee", amount: 20_000, currencies: [] }],
    ["coffee 20k + 300k", { title: "coffee", amount: 320_000, currencies: [] }],
    ["lunch 1.5k + 500", { title: "lunch", amount: 2_000, currencies: [] }],
    ["iced coffee 20k", { title: "iced coffee", amount: 20_000, currencies: [] }],
    ["groceries (10k + 5k) * 2", { title: "groceries", amount: 30_000, currencies: [] }],
    ["  taxi   2.5k  -  500  ", { title: "taxi", amount: 2_000, currencies: [] }],
    ["rent 1.2m", { title: "rent", amount: 1_200_000, currencies: [] }],
    ["broken input", null],
    ["+ 10", null],
  ])("%j", (input, expected) => {
    expect(tryParseInput(input)).toEqual(expected);
  });

  it("supports a custom unit registry", () => {
    const units = createUnitRegistry();
    units.register("h", 100);
    expect(parseInput("snack 5h + 50", { units })).toEqual({
      title: "snack",
      amount: 550,
      currencies: [],
    });
  });
});

describe("examples.ts currency cases", () => {
  it.each([
    ["rent 200 eur", "rent", 234],
    ["rent 200eur", "rent", 234],
    ["groceries $200", "groceries", 200],
    ["groceries $ 200", "groceries", 200],
    ["snack 500₸", "snack", 1.05],
    ["trip 200 eur + 50 usd", "trip", 284],
    ["trip $200 + 50 eur", "trip", 258.5],
    ["rent 1.2k usd", "rent", 1_200],
  ])("%j", (input, title, amount) => {
    const result = tryParseInput(input, { currencies });
    expect(result?.title).toBe(title);
    expect(result?.amount).toBeCloseTo(amount, 10);
  });
});

describe("arithmetic and precedence", () => {
  it.each([
    ["x 2 + 3 * 4", 14],
    ["x (2 + 3) * 4", 20],
    ["x 10 - 4 - 3", 3],
    ["x 100 / 10 / 2", 5],
    ["x 7 / 2", 3.5],
    ["x -5", -5],
    ["x +5", 5],
    ["x 5 - -3", 8],
    ["x 2 * -3", -6],
    ["x --5", 5],
    ["x ((1))", 1],
    ["x .5 + 1.", 1.5],
  ])("%j → %d", (input, amount) => {
    expect(parseInput(input).amount).toBe(amount);
  });

  it("uses plain float arithmetic", () => {
    // Current behaviour: no rounding, so binary float artefacts leak into the amount.
    expect(parseInput("x 0.1 + 0.2").amount).toBe(0.30000000000000004);
  });
});

describe("unit suffixes", () => {
  it.each([
    ["x 20k", 20_000],
    ["x 20K", 20_000],
    ["x 20к", 20_000],
    ["x 2m", 2_000_000],
    ["x 2М", 2_000_000],
    ["x 1b", 1_000_000_000],
    ["x 1б", 1_000_000_000],
    ["x .5k", 500],
  ])("%j → %d", (input, amount) => {
    expect(parseInput(input).amount).toBe(amount);
  });

  it("only accepts a suffix glued to the number", () => {
    expect(parseErrorOf(() => parseInput("x 20 k")).message).toBe(
      'Unexpected word "k" inside numeric expression',
    );
  });

  it("applies only one suffix", () => {
    expect(parseErrorOf(() => parseInput("x 20km")).message).toBe(
      'Unexpected word "m" inside numeric expression',
    );
  });

  it("rejects multi-character unit suffixes at registration", () => {
    expect(() => createUnitRegistry().register("hh", 100)).toThrow(
      'Unit suffix must be a single character, got "hh"',
    );
  });
});

describe("currency annotations", () => {
  it("registers a currency by its glyph", () => {
    const registry = createCurrencyRegistry({ "€": 2 });
    expect(parseInput("x 5 eur", { currencies: registry }).amount).toBe(10);
  });

  it("is case-insensitive for codes", () => {
    expect(parseInput("rent 200 EUR", { currencies }).amount).toBeCloseTo(234, 10);
  });

  it("applies a unit suffix after a prefix symbol", () => {
    expect(parseInput("x $1.5k", { currencies }).amount).toBe(1_500);
  });

  it("converts each leaf independently inside parentheses", () => {
    expect(parseInput("x (100 eur + $100) * 2", { currencies }).amount).toBeCloseTo(434, 10);
  });

  it("treats currency words as plain words without a registry", () => {
    expect(parseErrorOf(() => parseInput("rent 200 eur")).message).toBe(
      'Unexpected word "eur" inside numeric expression',
    );
  });

  it("rejects symbols as unknown characters without a registry", () => {
    const err = parseErrorOf(() => parseInput("x $200"));
    expect(err.message).toBe('Unexpected character "$"');
    expect(err.position).toBe(2);
  });

  it("does not take a currency word before the number (it becomes title)", () => {
    expect(parseInput("eur 200", { currencies })).toEqual({
      title: "eur",
      amount: 200,
      currencies: [],
    });
  });

  it("rejects a prefix symbol combined with a trailing code", () => {
    // Current behaviour: "$1k usd" is an error, while "1k usd" is accepted.
    expect(parseErrorOf(() => parseInput("x $1k usd", { currencies })).message).toBe(
      'Unexpected word "usd" inside numeric expression',
    );
  });

  it("errors on a symbol not followed by a number", () => {
    const err = parseErrorOf(() => parseInput("x $ abc", { currencies }));
    expect(err.message).toBe('Currency symbol "$" must be adjacent to a number');
    expect(err.position).toBe(2);
  });

  it("errors on an unknown glued currency word", () => {
    expect(parseErrorOf(() => parseInput("x 200eurx", { currencies })).message).toBe(
      'Unexpected word "eurx" inside numeric expression',
    );
  });
});

describe("titles and whitespace", () => {
  it("joins multi-word titles with single spaces", () => {
    expect(parseInput("  big\tweekly \n shop  5")).toEqual({
      title: "big weekly shop",
      amount: 5,
      currencies: [],
    });
  });

  it("accepts non-Latin letters and emoji in titles", () => {
    expect(parseInput("кофе ☕ 2к")).toEqual({ title: "кофе ☕", amount: 2_000, currencies: [] });
    expect(parseInput("👨‍👩‍👧‍👦 1")).toEqual({ title: "👨‍👩‍👧‍👦", amount: 1, currencies: [] });
  });

  it("keeps hyphens and underscores inside words", () => {
    expect(parseInput("ice-cream_bar 3")).toEqual({
      title: "ice-cream_bar",
      amount: 3,
      currencies: [],
    });
  });

  it("glues a hyphen after a word into the title", () => {
    // Current behaviour: "a-5" is title "a-" and amount 5, whereas "a -5" is amount -5.
    expect(parseInput("a-5")).toEqual({ title: "a-", amount: 5, currencies: [] });
    expect(parseInput("a -5")).toEqual({ title: "a", amount: -5, currencies: [] });
  });

  it("treats digits inside a would-be title as the expression start", () => {
    expect(parseErrorOf(() => parseInput("coffee 2 go")).message).toBe(
      'Unexpected word "go" inside numeric expression',
    );
  });
});

describe("ParseError cases", () => {
  it.each([
    ["", "Input must be a non-empty string", undefined],
    ["   ", "Input must be a non-empty string", undefined],
    ["broken input", "Missing numeric expression", undefined],
    ["20k", "Missing title", undefined],
    ["+ 10", "Missing title", undefined],
    ["x 1 / 0", "Division by zero", undefined],
    ["x 1 / (2 - 2)", "Division by zero", undefined],
    ["x (1 + 2", "Missing closing parenthesis", 2],
    ["x 1 + 2)", 'Unexpected token ")"', 7],
    ["x )", 'Unexpected token ")"', 2],
    ["x 2 *", "Unexpected end of expression", undefined],
    ["x 2 * / 3", 'Unexpected token "/"', 6],
    ["x 1.2.3", 'Unexpected token ".3"', 5],
    ["x 1 2", 'Unexpected token "2"', 4],
    ["x 5 #", 'Unexpected character "#"', 4],
    ["x 5 coffee", 'Unexpected word "coffee" inside numeric expression', 4],
  ])("%j → %s", (input, message, position) => {
    const err = parseErrorOf(() => parseInput(input));
    expect(err.name).toBe("ParseError");
    expect(err.message).toBe(message);
    expect(err.position).toBe(position);
    expect(tryParseInput(input)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(parseErrorOf(() => parseInput(null as unknown as string)).message).toBe(
      "Input must be a non-empty string",
    );
    expect(tryParseInput(undefined as unknown as string)).toBeNull();
  });
});

describe("parseInputLenient", () => {
  it("returns null for empty input", () => {
    expect(parseInputLenient("")).toBeNull();
    expect(parseInputLenient("  \t")).toBeNull();
  });

  it("defaults the amount to 0 without an expression", () => {
    expect(parseInputLenient("coffee")).toEqual({ title: "coffee", amount: 0, currencies: [] });
  });

  it("defaults the title to an empty string without words", () => {
    expect(parseInputLenient("20k + 5")).toEqual({ title: "", amount: 20_005, currencies: [] });
  });

  it("parses full input like parseInput", () => {
    expect(parseInputLenient("rent 200 eur", { currencies })?.amount).toBeCloseTo(234, 10);
  });

  it.each([
    ["x 1 / 0", "Division by zero"],
    ["x (1", "Missing closing parenthesis"],
    ["x 5 #", 'Unexpected character "#"'],
    ["x 5 coffee", 'Unexpected word "coffee" inside numeric expression'],
  ])("still throws on %j", (input, message) => {
    expect(parseErrorOf(() => parseInputLenient(input)).message).toBe(message);
  });
});

describe("tokenize", () => {
  it("records resolved values and positions", () => {
    expect(tokenize("tea 2k*(3)", { currencies })).toEqual([
      { type: "WORD", value: "tea", position: 0 },
      { type: "NUMBER", value: "2k", numericValue: 2_000, position: 4 },
      { type: "OPERATOR", value: "*", position: 6 },
      { type: "LPAREN", value: "(", position: 7 },
      { type: "NUMBER", value: "3", numericValue: 3, position: 8 },
      { type: "RPAREN", value: ")", position: 9 },
    ]);
  });

  it("includes the currency annotation in the token value", () => {
    expect(tokenize("200 eur", { currencies })[0]).toMatchObject({
      value: "200 eur",
      currency: "eur",
    });
    expect(tokenize("$ 5", { currencies })[0]).toMatchObject({
      value: "$ 5",
      numericValue: 5,
      currency: "usd",
    });
  });
});

describe("budget currency registry", () => {
  const kzt = createBudgetCurrencyRegistry("kzt", { usd: 1, kzt: 500, eur: 0.5, rub: 100 });

  it("converts mixed currencies into the budget currency", () => {
    expect(parseInput("rent 200 usd + 34 eur + 32 kzt", { currencies: kzt })).toEqual({
      title: "rent",
      amount: 134_032,
      currencies: ["usd", "eur", "kzt"],
    });
  });

  it.each([
    ["coffee 5 баксов", 2_500, ["usd"]],
    ["coffee 5баксов", 2_500, ["usd"]],
    ["taxi 1000 тг", 1_000, ["kzt"]],
    ["taxi 1000 теңге", 1_000, ["kzt"]],
    ["taxi 1000 Тенге", 1_000, ["kzt"]],
    ["taxi 1000kzt", 1_000, ["kzt"]],
    ["taxi ₸1000", 1_000, ["kzt"]],
    ["gifts $20 + €10", 20_000, ["usd", "eur"]],
    ["rent 200 USD", 100_000, ["usd"]],
    ["rent 1.2k usd", 600_000, ["usd"]],
    ["bread 100 руб", 500, ["rub"]],
    ["snacks 2 usd + 3 dollars + $1", 3_000, ["usd"]],
    ["lunch 3000", 3_000, []],
  ])("%j", (input, amount, codes) => {
    const result = parseInput(input, { currencies: kzt });
    expect(result.amount).toBeCloseTo(amount, 6);
    expect(result.currencies).toEqual(codes);
  });

  it.each(["usd", "kzt", "eur", "aed", "gbp", "jpy", "inr"])("resolves the %s code", (code) => {
    const usd = createBudgetCurrencyRegistry("usd", {
      usd: 1,
      kzt: 500,
      eur: 0.5,
      aed: 4,
      gbp: 0.8,
      jpy: 150,
      inr: 80,
    });
    expect(parseInput(`x 1 ${code}`, { currencies: usd }).currencies).toEqual([code]);
  });

  it.each(CURRENCIES.map((c) => c.code))("converts the picker's %s into any budget", (code) => {
    const rates = Object.fromEntries(CURRENCIES.map((c, i) => [c.code, i + 1]));
    const usd = createBudgetCurrencyRegistry("usd", rates);
    expect(parseInput(`x 2 ${code}`, { currencies: usd }).amount).toBeCloseTo(2 / rates[code], 10);
    const own = createBudgetCurrencyRegistry(code, rates);
    expect(parseInput("x 2 usd", { currencies: own }).amount).toBeCloseTo(2 * rates[code], 10);
  });

  it.each([
    ["x 100 сом", "kgs"],
    ["x 100 сум", "uzs"],
    ["x ₾10", "gel"],
    ["x 10₼", "azn"],
    ["x 10 zł", "pln"],
  ])("resolves the %j alias", (input, code) => {
    const usd = createBudgetCurrencyRegistry("usd", { usd: 1, [code]: 2 });
    expect(parseInput(input, { currencies: usd }).currencies).toEqual([code]);
  });

  it("converts into a USD budget", () => {
    const usd = createBudgetCurrencyRegistry("usd", { usd: 1, kzt: 500 });
    const result = parseInput("rent 5000 kzt", { currencies: usd });
    expect(result.amount).toBeCloseTo(10, 10);
    expect(result.currencies).toEqual(["kzt"]);
  });

  it("does not depend on the reference currency of the rates", () => {
    const eurBased = createBudgetCurrencyRegistry("kzt", { eur: 1, usd: 2, kzt: 1_000 });
    expect(parseInput("rent 200 usd", { currencies: eurBased }).amount).toBeCloseTo(100_000, 6);
  });

  it.each<Record<string, number> | null | undefined>([null, undefined, {}, { usd: 1 }])(
    "converts the base currency with rates %j",
    (rates) => {
      const offline = createBudgetCurrencyRegistry("kzt", rates);
      expect(parseInput("lunch 500 kzt", { currencies: offline })).toEqual({
        title: "lunch",
        amount: 500,
        currencies: ["kzt"],
      });
      expect(parseInput("coffee ₸500", { currencies: offline }).amount).toBe(500);
    },
  );

  it("errors on a known currency without a rate", () => {
    const offline = createBudgetCurrencyRegistry("kzt", null);
    const err = parseErrorOf(() => parseInput("rent 200 usd", { currencies: offline }));
    expect(err.message).toBe("No exchange rate for USD");
    expect(err.position).toBe(9);
    expect(parseErrorOf(() => parseInputLenient("x $5", { currencies: offline })).message).toBe(
      "No exchange rate for USD",
    );
    expect(parseErrorOf(() => parseInput("x 100 inr", { currencies: kzt })).message).toBe(
      "No exchange rate for INR",
    );
    expect(tryParseInput("x 5 фунтов", { currencies: kzt })).toBeNull();
  });

  it("keeps words outside the alias table as plain words", () => {
    const withCup = createBudgetCurrencyRegistry("kzt", { kzt: 500, cup: 24 });
    expect(parseErrorOf(() => parseInput("tea 5 cup", { currencies: withCup })).message).toBe(
      'Unexpected word "cup" inside numeric expression',
    );
  });
});
