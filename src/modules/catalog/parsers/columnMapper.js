import { COLUMN_DEFINITIONS } from '../config/columnAliases.js';
import { cleanText, normalizeKey, similarity } from '../../../shared/utils/text.js';

export const FUZZY_THRESHOLD = 0.7;

const CURRENCY_HINTS = [
  // "LE" needs both boundaries — without the leading one it matches inside
  // ordinary words such as "Example SKU".
  { currency: 'EGP', test: /\begp\b|ج\.?\s*م|جنيه|\ble\b/i },
  { currency: 'USD', test: /\busd\b|\$|dollar/i },
];

/** Reads "(…, EGP)" / "$" out of a header so mixed-currency sheets self-describe. */
export function currencyHintFrom(header) {
  const text = cleanText(header);
  for (const hint of CURRENCY_HINTS) {
    if (hint.test.test(text)) return hint.currency;
  }
  return null;
}

/** True when a header advertises its value as an estimate rather than a quote. */
export function estimateHintFrom(header) {
  return /\best\.?\b|estimat|approx|~|guess|range/i.test(cleanText(header));
}

// Alias index built once: normalized alias -> best definition for that alias.
const ALIAS_INDEX = (() => {
  const index = new Map();
  for (const definition of COLUMN_DEFINITIONS) {
    for (const alias of definition.aliases ?? []) {
      const key = normalizeKey(alias);
      const existing = index.get(key);
      if (!existing || (definition.specificity ?? 0) > (existing.specificity ?? 0)) {
        index.set(key, definition);
      }
    }
  }
  return index;
})();

/**
 * Resolves one header cell to a canonical field.
 * Exact alias -> regex pattern -> fuzzy similarity, each with a confidence.
 */
/** Headers that survive no normalisation because they are pure punctuation. */
const SYMBOL_HEADERS = new Map([
  ['#', 'row_number'],
  ['№', 'row_number'],
  ['#.', 'row_number'],
]);

export function matchHeader(header) {
  const raw = cleanText(header);
  if (!raw) return null;

  const symbol = SYMBOL_HEADERS.get(raw);
  if (symbol) return { field: symbol, confidence: 1, strategy: 'exact', specificity: 1 };

  const key = normalizeKey(raw);
  if (!key) return null;

  const exact = ALIAS_INDEX.get(key);
  if (exact) {
    return { field: exact.field, confidence: 1, strategy: 'exact', specificity: exact.specificity ?? 0 };
  }

  let best = null;
  for (const definition of COLUMN_DEFINITIONS) {
    for (const pattern of definition.patterns ?? []) {
      if (!pattern.test(raw)) continue;
      const candidate = {
        field: definition.field,
        confidence: 0.9,
        strategy: 'pattern',
        specificity: definition.specificity ?? 0,
      };
      if (!best || candidate.specificity > best.specificity) best = candidate;
    }
  }
  if (best) return best;

  for (const definition of COLUMN_DEFINITIONS) {
    for (const alias of definition.aliases ?? []) {
      const score = similarity(key, alias);
      if (score < FUZZY_THRESHOLD) continue;
      const candidate = {
        field: definition.field,
        confidence: Number(score.toFixed(3)),
        strategy: 'fuzzy',
        specificity: definition.specificity ?? 0,
        matched_alias: alias,
      };
      if (!best || candidate.confidence > best.confidence) best = candidate;
    }
  }

  return best;
}

/**
 * Maps a whole header row.
 *
 * Every column ends up in exactly one of `columns` (mapped) or `unmapped`;
 * unmapped columns are still carried into the product as raw attributes so no
 * source data is silently dropped.
 *
 * @param {Array} headerCells
 * @returns {{ columns: Array, byField: Object, unmapped: Array, confidence: number }}
 */
export function mapColumns(headerCells = []) {
  const columns = [];
  const unmapped = [];
  const claimed = new Map(); // field -> column entry with the best claim

  headerCells.forEach((cell, index) => {
    const header = cleanText(cell);
    if (!header) return;

    const match = matchHeader(header);
    const entry = {
      index,
      header,
      field: match?.field ?? null,
      confidence: match?.confidence ?? 0,
      strategy: match?.strategy ?? 'none',
      specificity: match?.specificity ?? 0,
      currency: currencyHintFrom(header),
      is_estimate: estimateHintFrom(header),
    };

    if (!match) {
      unmapped.push(entry);
      return;
    }

    const incumbent = claimed.get(match.field);
    if (!incumbent) {
      claimed.set(match.field, entry);
      columns.push(entry);
      return;
    }

    // Two columns claim the same field ("RDP (plan)" vs "RDP (verified)").
    // The more specific / more confident header keeps it; the loser is
    // retained as a raw attribute rather than being thrown away.
    const incumbentRank = incumbent.specificity * 10 + incumbent.confidence;
    const challengerRank = entry.specificity * 10 + entry.confidence;

    if (challengerRank > incumbentRank) {
      claimed.set(match.field, entry);
      columns.splice(columns.indexOf(incumbent), 1, entry);
      unmapped.push({ ...incumbent, field: null, displaced_by: entry.header });
    } else {
      unmapped.push({ ...entry, field: null, displaced_by: incumbent.header });
    }
  });

  const byField = Object.fromEntries(columns.map((column) => [column.field, column]));
  const confidence = columns.length
    ? Number((columns.reduce((sum, c) => sum + c.confidence, 0) / columns.length).toFixed(3))
    : 0;

  return { columns, byField, unmapped, confidence };
}

/** Sheet-level currency: majority vote across money columns. */
export function inferSheetCurrency(mapping) {
  const votes = mapping.columns
    .filter((column) => column.currency)
    .reduce((acc, column) => {
      acc[column.currency] = (acc[column.currency] ?? 0) + 1;
      return acc;
    }, {});

  const [winner] = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  return winner?.[0] ?? null;
}

export default { mapColumns, matchHeader, currencyHintFrom, inferSheetCurrency };
