import { TAXONOMY } from '../config/taxonomy.js';
import { cleanText, normalizeKey } from '../../../shared/utils/text.js';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-token match with a tolerant plural, run against a normalised string. */
function containsTerm(haystack, term) {
  const needle = normalizeKey(term);
  if (!needle) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(needle)}(s|es)?(\\s|$)`);
  return pattern.test(haystack);
}

/**
 * Resolves a messy category cell onto the ByteHub taxonomy.
 *
 * The category cell is weighted above the product name, so "شواحن" and
 * "Wall Chargers" both land on Chargers, and a row with no category at all
 * still gets classified from its name.
 *
 * @param {string|null} rawCategory
 * @param {string|null} productName
 * @returns {{ category:string|null, subcategory:string|null, path:string[], matched:boolean, confidence:number, raw:string|null }}
 */
export function normalizeCategory(rawCategory, productName = '') {
  const raw = cleanText(rawCategory) || null;
  const categoryHay = normalizeKey(rawCategory ?? '');
  const nameHay = normalizeKey(productName ?? '');
  const combined = `${categoryHay} ${nameHay}`.trim();

  let best = null;

  for (const entry of TAXONOMY) {
    let score = 0;
    for (const term of entry.match) {
      if (categoryHay && containsTerm(categoryHay, term)) score += 3;
      else if (nameHay && containsTerm(nameHay, term)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }

  if (!best) {
    return {
      category: raw,
      subcategory: null,
      path: raw ? [raw] : [],
      matched: false,
      confidence: 0,
      raw,
    };
  }

  let subcategory = null;
  for (const candidate of best.entry.subcategories ?? []) {
    if (candidate.match.some((term) => containsTerm(combined, term))) {
      subcategory = candidate.name;
      break;
    }
  }

  return {
    category: best.entry.category,
    subcategory,
    path: subcategory ? [best.entry.category, subcategory] : [best.entry.category],
    matched: true,
    // 3 = matched on the category cell itself; anything less leaned on the name.
    confidence: Math.min(1, Number((best.score / 3).toFixed(2))),
    raw,
  };
}

export const taxonomyCategories = () => TAXONOMY.map((entry) => entry.category);

export default normalizeCategory;
