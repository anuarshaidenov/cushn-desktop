import type { Rates } from "../repositories/rates";
import { type CushnHandlers, noArgs } from "./handler";

export function createRatesHandlers(rates: Rates): CushnHandlers["rates"] {
  return {
    get: {
      args: noArgs,
      run: ({ db }) => rates.get(db),
    },
  };
}
