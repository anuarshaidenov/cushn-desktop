/** The currencies a budget can be in, in the pickers' order. `code` is what gets stored. */
export const CURRENCIES = [
  { code: "usd", symbol: "$", name: "US Dollar" },
  { code: "kzt", symbol: "₸", name: "Kazakhstani Tenge" },
  { code: "eur", symbol: "€", name: "Euro" },
  { code: "rub", symbol: "₽", name: "Russian Ruble" },
  { code: "amd", symbol: "֏", name: "Armenian Dram" },
  { code: "aud", symbol: "A$", name: "Australian Dollar" },
  { code: "azn", symbol: "₼", name: "Azerbaijani Manat" },
  { code: "byn", symbol: "Br", name: "Belarusian Ruble" },
  { code: "brl", symbol: "R$", name: "Brazilian Real" },
  { code: "gbp", symbol: "£", name: "British Pound" },
  { code: "cad", symbol: "CA$", name: "Canadian Dollar" },
  { code: "cny", symbol: "CN¥", name: "Chinese Yuan" },
  { code: "czk", symbol: "Kč", name: "Czech Koruna" },
  { code: "dkk", symbol: "DKK", name: "Danish Krone" },
  { code: "gel", symbol: "₾", name: "Georgian Lari" },
  { code: "hkd", symbol: "HK$", name: "Hong Kong Dollar" },
  { code: "huf", symbol: "Ft", name: "Hungarian Forint" },
  { code: "inr", symbol: "₹", name: "Indian Rupee" },
  { code: "idr", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "ils", symbol: "₪", name: "Israeli New Shekel" },
  { code: "jpy", symbol: "¥", name: "Japanese Yen" },
  { code: "kgs", symbol: "сом", name: "Kyrgyzstani Som" },
  { code: "myr", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "mxn", symbol: "MX$", name: "Mexican Peso" },
  { code: "mnt", symbol: "₮", name: "Mongolian Tugrik" },
  { code: "nzd", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "nok", symbol: "NOK", name: "Norwegian Krone" },
  { code: "php", symbol: "₱", name: "Philippine Peso" },
  { code: "pln", symbol: "zł", name: "Polish Zloty" },
  { code: "sar", symbol: "SAR", name: "Saudi Riyal" },
  { code: "sgd", symbol: "S$", name: "Singapore Dollar" },
  { code: "zar", symbol: "R", name: "South African Rand" },
  { code: "krw", symbol: "₩", name: "South Korean Won" },
  { code: "sek", symbol: "SEK", name: "Swedish Krona" },
  { code: "chf", symbol: "CHF", name: "Swiss Franc" },
  { code: "tjs", symbol: "SM", name: "Tajikistani Somoni" },
  { code: "thb", symbol: "฿", name: "Thai Baht" },
  { code: "try", symbol: "₺", name: "Turkish Lira" },
  { code: "aed", symbol: "د.إ", name: "United Arab Emirates Dirham" },
  { code: "uzs", symbol: "soʻm", name: "Uzbekistani Som" },
  { code: "vnd", symbol: "₫", name: "Vietnamese Dong" },
] as const;

export type Currency = (typeof CURRENCIES)[number];
export type CurrencyCode = Currency["code"];

export const CURRENCY_CODES: readonly CurrencyCode[] = CURRENCIES.map((currency) => currency.code);

const codes = new Set<string>(CURRENCY_CODES);

export const isCurrencyCode = (value: string): value is CurrencyCode => codes.has(value);
