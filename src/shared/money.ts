/**
 * Amounts stay REAL in major units, but every money value a repository writes
 * (`budgets.income`, `budget_allocations.amount`, `expenses.amount`) goes
 * through `roundMoney` first. Percentages are stored as given.
 */

/**
 * Rounds to 2 decimals, half away from zero. The relative epsilon nudges
 * values like `1.005`, whose binary form sits just below the half
 * (`1.005 * 100 === 100.49999999999999`), onto the side their decimal form is on.
 */
export function roundMoney(value: number): number {
  // Above 2^50 cents the nudge plus the float error of `value * 100` can reach half a cent.
  if (Math.abs(value) * 100 >= 2 ** 50) return value;
  const cents = Math.round(Math.abs(value) * 100 * (1 + Number.EPSILON));
  return cents === 0 ? 0 : (Math.sign(value) * cents) / 100;
}

/**
 * Whether template percentages sum to 100: the left-to-right
 * float sum, rounded to cents by `roundMoney`, must equal 100. So
 * 33.4/33.3/33.3 (`99.99999999999999`) passes, 49.99/50 does not. The
 * repository and the template form both check with this.
 */
export function sumsTo100(percentages: readonly number[]): boolean {
  const sum = percentages.reduce((acc, percentage) => acc + percentage, 0);
  return roundMoney(sum) === 100;
}
