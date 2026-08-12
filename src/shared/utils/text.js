const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Converts Arabic-Indic and Persian digits to ASCII digits. */
export function normalizeDigits(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/[٠-٩۰-۹]/g, (char) => {
    const arabic = ARABIC_INDIC.indexOf(char);
    if (arabic >= 0) return String(arabic);
    return String(EASTERN_ARABIC_INDIC.indexOf(char));
  });
}

/**
 * Collapses the many dash-like characters spreadsheets use (en dash, em dash,
 * Arabic tatweel, non-breaking hyphen) into a plain ASCII hyphen.
 */
export function normalizeDashes(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/[‐-―−⁃﹘﹣－ـ]/g, '-');
}

/** Trims, collapses internal whitespace (including newlines), strips zero-width chars. */
export function squish(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[​-‏‪-‮﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Full cleanup used before any parsing: digits, dashes, whitespace. */
export function cleanText(input) {
  return squish(normalizeDashes(normalizeDigits(input)));
}

const ARABIC_RANGE = /[؀-ۿ]/;
export const containsArabic = (input) => ARABIC_RANGE.test(String(input ?? ''));

/**
 * Comparison key: lowercase, punctuation-free, sorted-insensitive token string.
 * Used for dedupe and fuzzy matching, never for display.
 */
export function normalizeKey(input) {
  return cleanText(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** URL-safe slug. Keeps Arabic letters (Mongo/URLs handle UTF-8 fine). */
export function slugify(input) {
  return cleanText(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function titleCase(input) {
  return cleanText(input).replace(/\b([a-z])(\w*)/g, (_, a, b) => a.toUpperCase() + b);
}

/** Levenshtein distance, capped for performance on long strings. */
export function levenshtein(a, b) {
  const s = String(a ?? '');
  const t = String(b ?? '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  const curr = new Array(t.length + 1);

  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = [...curr];
  }
  return prev[t.length];
}

/**
 * 0..1 similarity combining token overlap with edit distance.
 *
 * Token overlap catches reordered or partially-shared phrases; edit distance
 * catches typos, which share no whole tokens at all ("Prodct Name"). Edit
 * distance alone is only trusted on strings long enough for one changed
 * character to be meaningful — on short codes it would rate "RDP" and "RRP"
 * as near-identical.
 */
export function similarity(a, b) {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const xs = new Set(x.split(' '));
  const ys = new Set(y.split(' '));
  const intersection = [...xs].filter((token) => ys.has(token)).length;
  const jaccard = intersection / new Set([...xs, ...ys]).size;

  const distance = levenshtein(x, y);
  const editScore = 1 - distance / Math.max(x.length, y.length);

  const blended = jaccard * 0.4 + editScore * 0.6;
  const longEnough = Math.min(x.length, y.length) >= 6;

  return Math.max(0, blended, longEnough ? editScore * 0.95 : 0);
}

export default {
  normalizeDigits,
  normalizeDashes,
  squish,
  cleanText,
  containsArabic,
  normalizeKey,
  slugify,
  titleCase,
  levenshtein,
  similarity,
};
