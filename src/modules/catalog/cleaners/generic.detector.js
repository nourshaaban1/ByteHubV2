import { cleanText, normalizeKey, containsArabic } from '../../../shared/utils/text.js';

/**
 * Words that mark a row as a placeholder rather than a real, orderable SKU.
 * ByteHub's folders and sheets are full of these: "GENERAL CABLE TYPE C TO
 * TYPE C", "قرص SSD بمنفذ SATA (مسودة)", "— (unassigned)".
 */
const GENERIC_TOKENS = [
  'general', 'generic', 'assorted', 'various', 'misc', 'miscellaneous',
  'placeholder', 'sample', 'example', 'unassigned', 'tbd', 'tba', 'unknown',
  'any', 'standard type',
];

const DRAFT_TOKENS = ['draft', 'مسودة', 'coming soon', 'قريبا', 'قريباً', 'not started', 'wip'];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasToken = (haystack, tokens) =>
  tokens.some((token) => new RegExp(`(^|\\s)${escapeRegExp(normalizeKey(token))}(\\s|$)`).test(haystack));

/**
 * Flags placeholder / draft rows so they can be imported and tracked without
 * ever being treated as sellable inventory.
 *
 * @returns {{ is_generic:boolean, is_draft:boolean, reasons:string[] }}
 */
export function detectGeneric({ name, brand, sku, notes, action, condition } = {}) {
  const reasons = [];
  const nameKey = normalizeKey(name ?? '');
  const brandKey = normalizeKey(brand ?? '');
  const noteKey = normalizeKey(`${notes ?? ''} ${action ?? ''}`);

  if (hasToken(nameKey, GENERIC_TOKENS)) reasons.push('name_contains_generic_token');
  if (brandKey && hasToken(brandKey, GENERIC_TOKENS)) reasons.push('brand_is_generic');

  // A fully upper-case Latin name with no digits reads as a folder label rather
  // than a product ("GENERAL USB-A CHARGER" vs "Anker Wall Charger 25W Compact").
  // Arabic is caseless, so "سماعات TWS" would trip this test on its acronym
  // alone — those names are excluded.
  const displayName = cleanText(name ?? '');
  if (
    displayName.length > 3 &&
    !containsArabic(displayName) &&
    displayName === displayName.toUpperCase() &&
    /[A-Z]/.test(displayName) &&
    !/\d/.test(displayName)
  ) {
    reasons.push('name_is_all_caps_label');
  }

  if (!sku && reasons.length > 0) reasons.push('no_sku');

  const isDraft =
    hasToken(nameKey, DRAFT_TOKENS) ||
    hasToken(noteKey, DRAFT_TOKENS) ||
    /\(مسودة\)|\(draft\)/i.test(displayName) ||
    normalizeKey(condition ?? '') === 'draft';

  return {
    is_generic: reasons.length > 0,
    is_draft: isDraft,
    reasons,
  };
}

/** Maps a free-text "Recommended Action" cell onto a procurement status. */
export function detectProcurementStatus(text) {
  const value = cleanText(text).toLowerCase();
  if (!value) return null;
  if (/\bavoid\b|\bdrop\b|\bdelete\b|do not (buy|order)/.test(value)) return 'avoid';
  if (/\bhold\b|\btest\b|\btrial\b|sample/.test(value)) return 'test_buy';
  if (/\bapprove\b|must buy|\border\b|\bbuy\b/.test(value)) return 'must_buy';
  if (/opportunit|consider|upsell|cross-sell/.test(value)) return 'opportunity';
  return null;
}

export default { detectGeneric, detectProcurementStatus };
