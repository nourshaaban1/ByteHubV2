import env from '../../config/env.js';

/** Rounds to `dp` decimal places without float drift on .5 boundaries. */
export function round(value, dp = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * FX table. Keyed by currency, expressed as "1 unit = N base-currency units".
 * Deliberately data-driven so adding SAR/AED needs no code change.
 */
export function fxTable() {
  return {
    EGP: env.baseCurrency === 'EGP' ? 1 : 1 / env.usdToEgpRate,
    USD: env.baseCurrency === 'EGP' ? env.usdToEgpRate : 1,
  };
}

export function convert(amount, from, to = env.baseCurrency) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  const source = String(from ?? '').toUpperCase();
  const target = String(to ?? '').toUpperCase();

  // An unknown source currency yields null, never the raw amount. Assuming the
  // base currency here would silently add USD figures to EGP totals — which is
  // exactly the defect this catalog already suffers from.
  if (!source) return null;
  if (source === target) return round(amount);

  const table = fxTable();
  const rate = table[source];
  if (!Number.isFinite(rate)) return null;

  const inBase = amount * rate;
  if (target === env.baseCurrency) return round(inBase);

  const targetRate = table[target];
  if (!Number.isFinite(targetRate) || targetRate === 0) return null;
  return round(inBase / targetRate);
}

export function rateFor(currency) {
  return fxTable()[String(currency ?? '').toUpperCase()] ?? null;
}

export default { round, convert, rateFor, fxTable };
