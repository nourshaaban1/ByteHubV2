/**
 * Display formatting.
 *
 * A price the backend could not determine renders as "Price on request", never
 * as 0 and never as a guess. Quoting a wrong number to a customer is worse than
 * asking them to call.
 */
const isNil = (value) => value === null || value === undefined || Number.isNaN(value);

const CURRENCY_SYMBOLS = { EGP: 'EGP', USD: '$' };

export function formatPrice(price) {
  if (!price || isNil(price.amount)) return null;

  const symbol = CURRENCY_SYMBOLS[price.currency] ?? price.currency ?? '';
  // Sub-unit precision only where it exists: "450 EGP", but "462.50 EGP".
  const decimals = Number.isInteger(price.amount) ? 0 : 2;
  const text = price.amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return price.currency === 'USD' ? `${symbol}${text}` : `${text} ${symbol}`;
}

export function formatCount(value, singular, plural = `${singular}s`) {
  const number = Number(value ?? 0).toLocaleString('en-US');
  return `${number} ${value === 1 ? singular : plural}`;
}

/**
 * Right-to-left detection.
 *
 * Roughly half the ByteHub catalog is named in Arabic ("كابل StarTalk 100W").
 * Rendering that in a left-to-right container pushes the Latin part to the
 * wrong end and reads as broken, so every product name carries its own `dir`.
 */
const RTL = /[؀-ۿݐ-ݿ]/;
export const isRtl = (value) => RTL.test(String(value ?? ''));
export const dirFor = (value) => (isRtl(value) ? 'rtl' : 'ltr');

/** "power_wattage" -> "Power wattage", for spec rows with no explicit label. */
export function humanize(key) {
  if (!key) return '';
  const text = String(key).replace(/[_-]+/g, ' ').trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default { formatPrice, formatCount, isRtl, dirFor, humanize };
