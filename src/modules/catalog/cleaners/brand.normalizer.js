import { cleanText, normalizeKey, titleCase } from '../../../shared/utils/text.js';

/**
 * Canonical brand names. ByteHub's sources spell the same brand five ways
 * ("Soundcore by Anker", "Anker/Soundcore", "Anker (eufy line)"), which is what
 * makes per-brand analytics meaningless until it is normalised.
 */
const BRAND_ALIASES = new Map(
  Object.entries({
    anker: 'Anker',
    'anker eufy line': 'eufy',
    'anker eufy': 'eufy',
    eufy: 'eufy',
    soundcore: 'Soundcore',
    'soundcore by anker': 'Soundcore',
    'anker soundcore': 'Soundcore',
    'soundcore anker': 'Soundcore',
    joyroom: 'Joyroom',
    kingston: 'Kingston',
    hikvision: 'Hikvision',
    lexar: 'Lexar',
    sandisk: 'SanDisk',
    crucial: 'Crucial',
    'western digital': 'Western Digital',
    wd: 'Western Digital',
    pny: 'PNY',
    dell: 'Dell',
    hp: 'HP',
    lenovo: 'Lenovo',
    logitech: 'Logitech',
    havit: 'Havit',
    airlive: 'AirLive',
    'wild wolf': 'Wild Wolf',
    baseus: 'Baseus',
    ugreen: 'UGREEN',
  }),
);

/** Values that name no brand at all. */
const GENERIC_BRANDS = new Set([
  'generic', 'generics', 'no brand', 'nobrand', 'unbranded', 'oem', 'unknown',
  'n/a', 'na', 'none', 'various', 'mixed', 'assorted', 'other', 'tbd',
]);

/** Brands that belong to a parent manufacturer, used for supplier roll-ups. */
const BRAND_PARENTS = new Map([
  ['Soundcore', 'Anker'],
  ['eufy', 'Anker'],
]);

/**
 * @returns {{ brand:string|null, parent:string|null, is_generic:boolean, is_multi:boolean, raw:string|null }}
 */
export function normalizeBrand(rawBrand) {
  const raw = cleanText(rawBrand) || null;
  if (!raw) return { brand: null, parent: null, is_generic: false, is_multi: false, raw: null };

  const key = normalizeKey(raw);

  if (GENERIC_BRANDS.has(key)) {
    return { brand: 'Generic', parent: null, is_generic: true, is_multi: false, raw };
  }

  const exact = BRAND_ALIASES.get(key);
  if (exact) {
    return { brand: exact, parent: BRAND_PARENTS.get(exact) ?? null, is_generic: false, is_multi: false, raw };
  }

  // "Dell / HP", "Anker / Joyroom" — a cell covering several SKUs at once.
  const parts = raw
    .split(/\s*[/,&]\s*|\s+\+\s+/)
    .map((part) => cleanText(part))
    .filter(Boolean);

  if (parts.length > 1) {
    const resolved = parts.map((part) => BRAND_ALIASES.get(normalizeKey(part)) ?? titleCase(part));
    const unique = [...new Set(resolved)];
    if (unique.length > 1) {
      return { brand: unique[0], parent: null, is_generic: false, is_multi: true, raw, all: unique };
    }
    return {
      brand: unique[0],
      parent: BRAND_PARENTS.get(unique[0]) ?? null,
      is_generic: false,
      is_multi: false,
      raw,
    };
  }

  // Unknown brand: keep it, tidied. Losing it would be worse than not knowing it.
  const display = /[a-z]/.test(raw) && /[A-Z]/.test(raw) ? raw : titleCase(raw);
  return { brand: display, parent: null, is_generic: false, is_multi: false, raw };
}

export const knownBrands = () => [...new Set(BRAND_ALIASES.values())];

/**
 * Last resort when a sheet has no brand column at all: look for a known brand
 * name inside the product name ("Anker Soundcore R50i (ERBD-ANKR-R50I)").
 * Longest alias first so "soundcore by anker" beats "anker".
 */
export function inferBrandFromName(name) {
  const key = normalizeKey(name ?? '');
  if (!key) return null;

  const aliases = [...BRAND_ALIASES.keys()].sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const pattern = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
    if (pattern.test(key)) return BRAND_ALIASES.get(alias);
  }
  return null;
}

export default normalizeBrand;
