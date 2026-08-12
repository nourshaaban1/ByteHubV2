import { cleanText, normalizeDigits, normalizeDashes } from '../../../shared/utils/text.js';
import { round } from '../../../shared/utils/money.js';

/** Cells that mean "no value", not "zero". */
const NULL_TOKENS = new Set([
  '', '-', '--', 'n/a', 'na', 'n.a.', 'none', 'null', 'nil', 'tbd', 'tba',
  'not purchased', 'unknown', 'unpriced', '?', 'x', 'لا يوجد', 'غير متاح',
]);

const CURRENCY_PATTERNS = [
  { currency: 'USD', test: /\$|\busd\b|dollar/i },
  { currency: 'EGP', test: /ج\.?\s*م|\begp\b|جنيه|\ble\b/i },
];

const ESTIMATE_PATTERN = /\b(est|estimate[d]?|approx|around|about|circa|guess|~)\b|~/i;

const emptyResult = (raw, note) => ({
  value: null,
  min: null,
  max: null,
  is_range: false,
  is_estimated: false,
  currency: null,
  variants: [],
  raw: raw ?? null,
  note: note ?? null,
  ok: false,
});

const toNumber = (token) => {
  if (token === null || token === undefined) return null;
  // Strip thousands separators, keep one decimal point.
  const cleaned = String(token).replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!cleaned || cleaned === '.') return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
};

function detectCurrency(text, fallback = null) {
  for (const pattern of CURRENCY_PATTERNS) {
    if (pattern.test.test(text)) return pattern.currency;
  }
  return fallback;
}

/**
 * Pulls "64GB: $6-$9 | 128GB: $9-$13" style variant pricing apart.
 * Returns null when the cell is not a variant list.
 */
function parseVariants(text, fallbackCurrency) {
  if (!text.includes('|') || !text.includes(':')) return null;

  const variants = [];
  for (const segment of text.split('|')) {
    const [label, priceText] = segment.split(':');
    if (!label || !priceText) continue;

    const bounds = extractBounds(priceText);
    if (!bounds) continue;

    variants.push({
      label: cleanText(label),
      min: bounds.min,
      max: bounds.max,
      value: bounds.value,
      currency: detectCurrency(priceText, fallbackCurrency),
    });
  }

  return variants.length > 0 ? variants : null;
}

/** Extracts a single value or a low-high range from a price fragment. */
function extractBounds(fragment) {
  const text = normalizeDashes(normalizeDigits(String(fragment))).trim();

  // Range: "25 - 35", "$25 – $35", "1,100-1,400". Requires digits on both
  // sides so a negative number is never mistaken for a range, and tolerates a
  // currency symbol repeated on the upper bound.
  const range = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(?:-|to|إلى)\s*[$£€]?\s*(?:ج\.?\s*م\s*)?(\d[\d,]*(?:\.\d+)?)/i,
  );
  if (range) {
    const min = toNumber(range[1]);
    const max = toNumber(range[2]);
    if (min !== null && max !== null) {
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      // Midpoint: a defensible single figure, with min/max kept alongside.
      return { min: low, max: high, value: round((low + high) / 2), is_range: true };
    }
  }

  const single = text.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (single) {
    const value = toNumber(single[0]);
    if (value === null) return null;
    const signed = single[0].trim().startsWith('-') ? -value : value;
    return { min: signed, max: signed, value: signed, is_range: false };
  }

  return null;
}

/**
 * Parses any price cell ByteHub's catalogs contain.
 *
 * Handles: plain numbers, "225-270", "1,100-1,400", "$25 – $35",
 * "64GB: $6–$9 | 128GB: $9–$13", trailing commentary
 * ("1,000-1,400 (plan's guess — unverified)"), Arabic-Indic digits,
 * "ج.م" / "$" currency markers, and "n/a — priced above market".
 *
 * @param {string|number|null} raw
 * @param {{ defaultCurrency?: string|null, assumeEstimate?: boolean }} options
 */
export function parseMoney(raw, options = {}) {
  const { defaultCurrency = null, assumeEstimate = false } = options;

  if (raw === null || raw === undefined) return emptyResult(null);

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return emptyResult(String(raw));
    return {
      value: round(raw),
      min: round(raw),
      max: round(raw),
      is_range: false,
      is_estimated: assumeEstimate,
      currency: defaultCurrency,
      variants: [],
      raw: String(raw),
      note: null,
      ok: true,
    };
  }

  const original = String(raw);
  const text = cleanText(original);
  if (NULL_TOKENS.has(text.toLowerCase())) return emptyResult(original, text || null);

  // Separate trailing/parenthetical commentary from the numeric part.
  let note = null;
  let numericPart = text;

  const parenthetical = text.match(/\(([^)]*)\)/);
  if (parenthetical) {
    note = cleanText(parenthetical[1]);
    numericPart = text.replace(/\([^)]*\)/g, ' ');
  }

  // "n/a — priced above market": a null token, then commentary after a dash.
  // The head must be a real null token — an empty head would swallow "-25",
  // reading a negative number as commentary.
  const commentary = numericPart.match(/^([^0-9]*?)(?:-|—|–)\s*(.+)$/);
  if (commentary) {
    const head = cleanText(commentary[1]).toLowerCase();
    if (head !== '' && NULL_TOKENS.has(head)) {
      const tail = cleanText(commentary[2]);
      return emptyResult(original, note ? `${tail} (${note})` : tail);
    }
  }

  const currency = detectCurrency(text, defaultCurrency);
  const isEstimated = assumeEstimate || ESTIMATE_PATTERN.test(text) || (note ? ESTIMATE_PATTERN.test(note) : false);

  const variants = parseVariants(numericPart, currency);
  if (variants) {
    const values = variants.map((variant) => variant.value).filter(Number.isFinite);
    const mins = variants.map((v) => v.min).filter(Number.isFinite);
    const maxes = variants.map((v) => v.max).filter(Number.isFinite);
    return {
      // A variant list has no single price; the low end is the honest headline.
      value: mins.length ? Math.min(...mins) : null,
      min: mins.length ? Math.min(...mins) : null,
      max: maxes.length ? Math.max(...maxes) : null,
      is_range: true,
      is_estimated: true,
      currency,
      variants,
      raw: original,
      note: note ?? `${values.length} price variants`,
      ok: values.length > 0,
    };
  }

  const bounds = extractBounds(numericPart);
  if (!bounds) return emptyResult(original, note ?? text);

  return {
    value: bounds.value,
    min: bounds.min,
    max: bounds.max,
    is_range: bounds.is_range,
    is_estimated: isEstimated || bounds.is_range,
    currency,
    variants: [],
    raw: original,
    note,
    ok: true,
  };
}

/**
 * Parses a percentage cell. Excel stores "41.3%" as the number 0.413, while
 * the Action Plan sheet stores the literal string "41.3%" — both appear in
 * ByteHub's files, so both are accepted.
 */
export function parsePercent(raw) {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    // A bare fraction between -1 and 1 is Excel's percent representation.
    return Math.abs(raw) <= 1 ? round(raw * 100) : round(raw);
  }

  const text = cleanText(raw);
  if (!text || NULL_TOKENS.has(text.toLowerCase())) return null;

  const hasSymbol = text.includes('%');
  const match = normalizeDashes(normalizeDigits(text)).match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;

  const value = Number.parseFloat(match[0].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;

  if (hasSymbol) return round(value);
  return Math.abs(value) <= 1 ? round(value * 100) : round(value);
}

/** Parses an integer cell (quantities). Rejects anything non-integral. */
export function parseInteger(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.trunc(raw) : null;

  const text = cleanText(raw);
  if (!text || NULL_TOKENS.has(text.toLowerCase())) return null;

  const match = normalizeDigits(text).match(/-?\d[\d,]*/);
  if (!match) return null;
  const value = Number.parseInt(match[0].replace(/,/g, ''), 10);
  return Number.isFinite(value) ? value : null;
}

export const isNullToken = (value) => NULL_TOKENS.has(cleanText(value).toLowerCase());

export default { parseMoney, parsePercent, parseInteger, isNullToken };
