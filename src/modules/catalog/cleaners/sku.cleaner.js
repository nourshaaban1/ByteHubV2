import crypto from 'node:crypto';
import { cleanText, normalizeKey, normalizeDashes } from '../../../shared/utils/text.js';

// Stored as comparison keys: normalizeKey strips punctuation, so "n/a" must be
// looked up as "n a" or it will fall through and be split into a SKU of "n".
const PLACEHOLDER_SKUS = new Set(
  [
    '', '-', '--', 'n/a', 'na', 'n.a.', 'none', 'null', 'nil', 'tbd', 'tba',
    'unassigned', 'unknown', 'x', '?', 'no sku', 'pending', 'model varies',
  ].map((entry) => normalizeKey(entry)),
);

/** "— (unassigned)" and friends. */
const isPlaceholder = (value) => {
  const key = normalizeKey(value);
  if (!key) return true;
  if (PLACEHOLDER_SKUS.has(key)) return true;
  return /^\W*unassigned\W*$/i.test(cleanText(value));
};

/**
 * A model code: starts with a letter, contains at least one digit, and is made
 * only of upper-case letters, digits and hyphens. Matches A3969, JR-TCG13,
 * S-A59, SA21-1T3, A2667G12, T2212 — and rejects RDP, RRP, USB, EGP.
 */
const MODEL_CODE = /\b(?=[A-Z0-9-]*\d)[A-Z][A-Z0-9-]{2,}\b/g;

/** Words that mark a cell as commentary rather than an identifier. */
const PROSE_MARKERS = /\b(rdp|rrp|est|price|source|matched|verified|no\b|none|yet|usd|egp)\b|·|\$/i;

const isProse = (value) => {
  const text = cleanText(value);
  return text.split(/\s+/).length > 3 || PROSE_MARKERS.test(text);
};

const RESERVED_CODES = /^(RDP|RRP|USD|EGP|USB|HDMI|VGA|SATA|ANC|OTG)$/i;

const codesIn = (value) =>
  [...new Set(cleanText(value).match(MODEL_CODE) ?? [])].filter((code) => !RESERVED_CODES.test(code));

/**
 * Model codes in priority order. A code in parentheses wins: these catalogs
 * write "Robovac G50 Hybrid (T2212)" and "Glow Mini (A3136)", where the
 * bracketed value is the orderable SKU and the rest is marketing.
 */
const extractModelCodes = (value) => {
  const text = cleanText(value);

  for (const group of text.match(/\(([^)]*)\)/g) ?? []) {
    const inside = codesIn(group);
    if (inside.length === 1) return { codes: inside, confident: true };
  }

  return { codes: codesIn(text), confident: false };
};

/**
 * Cleans a raw SKU / model cell.
 *
 * ByteHub's catalogs carry three real defects this has to survive:
 *   - corrections written inline: "JR-PK1 → JR-PR1"
 *   - one code covering a whole family: "iP Series (model varies per phone, e.g. JR-PF843)"
 *   - one code genuinely reused for two products: "JR-ZS259", "SA21-1T3"
 *
 * @returns {{ sku:string|null, corrected_from:string|null, is_ambiguous:boolean,
 *             alternates:string[], raw:string|null }}
 */
export function normalizeSku(rawSku) {
  const raw = cleanText(rawSku) || null;
  const result = {
    sku: null,
    corrected_from: null,
    is_ambiguous: false,
    alternates: [],
    raw,
  };

  if (!raw || isPlaceholder(raw)) return result;

  let working = normalizeDashes(raw);

  // Inline correction: keep the right-hand side, remember the wrong one.
  const correction = working.match(/^(.+?)\s*(?:→|=>|->)\s*(.+)$/);
  if (correction) {
    result.corrected_from = cleanText(correction[1]);
    working = cleanText(correction[2]);
  }

  // "e.g. JR-PF843" inside a family description: take the example, flag it.
  const example = working.match(/e\.?g\.?\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})/i);
  if (example && /varies|series|per phone/i.test(working)) {
    result.is_ambiguous = true;
    result.alternates.push(cleanText(working));
    working = example[1];
  }

  // Ambiguity is judged on the original text — it is lost once a model code
  // is extracted out of it.
  if (/\bvaries\b|\bseries\b/i.test(working)) result.is_ambiguous = true;

  // "Glow Mini (A3136)" and "A3969 · RDP 880 / RRP 1,099" both name a product
  // rather than identify one. Pull the model code out instead of storing the
  // whole phrase — a bracketed code is taken as authoritative.
  const { codes, confident } = extractModelCodes(working);

  if (confident) {
    result.extracted_from_prose = true;
    working = codes[0];
  } else if (isProse(working)) {
    if (codes.length === 0) return result;
    if (codes.length > 1) {
      result.is_ambiguous = true;
      result.alternates.push(...codes.slice(1));
    }
    result.extracted_from_prose = true;
    working = codes[0];
  } else {
    // Drop trailing parenthetical commentary but keep meaningful suffixes
    // ("JR-QP192 Mini" is a different product from "JR-QP192").
    working = cleanText(working.replace(/\([^)]*\)/g, ' '));
  }

  // Several codes in one cell.
  const parts = working.split(/\s*[/,]\s*/).map((part) => cleanText(part)).filter(Boolean);
  if (parts.length > 1) {
    result.is_ambiguous = true;
    result.alternates.push(...parts.slice(1));
    working = parts[0];
  }

  const finalSku = cleanText(working).replace(/\s{2,}/g, ' ');
  result.sku = finalSku && !isPlaceholder(finalSku) ? finalSku : null;
  if (!result.sku) result.is_ambiguous = false;

  return result;
}

const CATEGORY_CODES = {
  Cables: 'CBL',
  Chargers: 'CHG',
  'Power Banks': 'PWB',
  Audio: 'AUD',
  Storage: 'STO',
  Memory: 'MEM',
  'Input Devices': 'INP',
  Networking: 'NET',
  'Hubs & Adapters': 'HUB',
  Accessories: 'ACC',
  'Smart Home': 'SMH',
  Wearables: 'WER',
};

const code = (value, length, fallback) => {
  const letters = normalizeKey(value).replace(/[^a-z0-9]/g, '');
  if (!letters) return fallback;
  return letters.slice(0, length).toUpperCase().padEnd(length, 'X');
};

/**
 * Deterministic placeholder SKU for rows that have none — the generic and
 * Arabic-only rows in ByteHub's files. Same input always yields the same SKU,
 * which is what keeps re-imports idempotent and lets the same product listed
 * in two different sheets deduplicate.
 *
 * The hash covers product identity only. Anything about *where* the row was
 * read from is deliberately excluded.
 *
 * Format: BH-<CAT>-<BRAND>-<HASH6>
 */
export function generateSku({ name, brand, category, capacity } = {}) {
  const digest = crypto
    .createHash('sha1')
    .update([normalizeKey(brand), normalizeKey(name), normalizeKey(capacity)].join('|'))
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();

  const categoryCode = CATEGORY_CODES[category] ?? code(category, 3, 'GEN');
  const brandCode = code(brand, 3, 'GEN');

  return `BH-${categoryCode}-${brandCode}-${digest}`;
}

export const isGeneratedSku = (sku) => /^BH-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-F0-9]{6}$/.test(String(sku ?? ''));

export default { normalizeSku, generateSku, isGeneratedSku };
