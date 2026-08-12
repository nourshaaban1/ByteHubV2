import { cleanText, normalizeDigits, normalizeDashes } from '../../../shared/utils/text.js';
import { round } from '../../../shared/utils/money.js';

const FEATURE_SEPARATOR = /\s*[|•·;]\s*|\s+\/\s+(?=[A-Z])/;
const LIST_SEPARATOR = /\s*[,،;|]\s*/;

/* --------------------------------- power --------------------------------- */

/** "45W GaN", "20 Watt", "3-Port 65W POD" -> 45 / 20 / 65 */
export function extractWattage(text) {
  if (!text) return null;
  const match = normalizeDigits(text).match(/(\d+(?:\.\d+)?)\s*(?:w\b|watts?\b)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 1000 ? value : null;
}

/* -------------------------------- battery -------------------------------- */

/**
 * "10,000mAh" -> 10000. Also understands the "10K / 20K / 30K" shorthand the
 * Arabic rows use ("باور بانك 20K 22.5W"), but only when the text is actually
 * about a power bank — "20K" means nothing on a cable.
 */
export function extractBatteryCapacity(text, { isPowerBank = false } = {}) {
  if (!text) return null;
  const normalized = normalizeDigits(text);

  const mah = normalized.match(/(\d[\d,]*)\s*mah/i);
  if (mah) {
    const value = Number.parseInt(mah[1].replace(/,/g, ''), 10);
    return Number.isFinite(value) ? value : null;
  }

  if (isPowerBank) {
    const shorthand = normalized.match(/\b(\d{1,3})\s*k\b/i);
    if (shorthand) {
      const value = Number.parseInt(shorthand[1], 10) * 1000;
      return value >= 1000 && value <= 100_000 ? value : null;
    }
  }

  return null;
}

/* --------------------------------- cables -------------------------------- */

const CONNECTORS = [
  { canonical: 'USB-C', patterns: [/type[\s-]?c/i, /usb[\s-]?c/i, /\bc\b/i] },
  { canonical: 'USB-A', patterns: [/usb[\s-]?a/i, /\busb\s*3\.\d/i, /\busb\s*2\.0/i, /\busb\b/i] },
  { canonical: 'Lightning', patterns: [/lightning/i, /iphone/i, /\bl\b/i] },
  { canonical: 'Micro-USB', patterns: [/micro[\s-]?usb/i, /\bmicro\b/i] },
  { canonical: 'HDMI', patterns: [/hdmi/i] },
  { canonical: 'DisplayPort', patterns: [/display\s*port/i, /\bdp\b/i] },
  { canonical: 'VGA', patterns: [/\bvga\b/i] },
  { canonical: 'SATA', patterns: [/\bsata\b/i] },
  { canonical: 'DVI', patterns: [/\bdvi\b/i] },
  { canonical: 'AUX 3.5mm', patterns: [/3\.5\s*mm/i, /\baux\b/i] },
];

const matchConnector = (fragment) => {
  for (const connector of CONNECTORS) {
    if (connector.patterns.some((pattern) => pattern.test(fragment))) return connector.canonical;
  }
  return null;
};

/**
 * "USB-A to USB-C", "C-C", "Type-C to Lightning", "HDMI" -> a canonical
 * "X to Y" (or single-ended) cable type.
 */
export function extractCableType(text) {
  if (!text) return null;
  const normalized = normalizeDashes(cleanText(text));

  const pair = normalized.match(/([\w.\s-]{1,18}?)\s*(?:to|->|→)\s*([\w.\s-]{1,18})/i);
  if (pair) {
    const from = matchConnector(pair[1]);
    const to = matchConnector(pair[2]);
    if (from && to) return `${from} to ${to}`;
  }

  // Shorthand used in the procurement sheets: "C-C", "C-L", "A-C".
  const shorthand = normalized.match(/\b([ACL])\s*-\s*([ACL])\b/);
  if (shorthand) {
    const expand = { A: 'USB-A', C: 'USB-C', L: 'Lightning' };
    return `${expand[shorthand[1].toUpperCase()]} to ${expand[shorthand[2].toUpperCase()]}`;
  }

  const single = ['HDMI', 'DisplayPort', 'VGA', 'SATA', 'DVI'].find((type) =>
    new RegExp(`\\b${type.replace(/\s/g, '\\s*')}\\b`, 'i').test(normalized),
  );
  return single ?? null;
}

/* -------------------------------- capacity ------------------------------- */

const CAPACITY_TO_GB = { MB: 1 / 1024, GB: 1, TB: 1024 };

export function extractCapacity(text) {
  if (!text) return { capacity: null, capacity_gb: null };
  const match = normalizeDigits(text).match(/\b(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i);
  if (!match) return { capacity: null, capacity_gb: null };

  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  return {
    capacity: `${match[1]}${unit}`,
    capacity_gb: round(amount * CAPACITY_TO_GB[unit], 3),
  };
}

/* --------------------------------- length -------------------------------- */

const LENGTH_TO_M = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, feet: 0.3048, foot: 0.3048, in: 0.0254 };

export function extractLength(text) {
  if (!text) return null;
  // Negative lookahead keeps "10mAh" and "3.5mm jack" out of the length slot.
  const match = normalizeDigits(text).match(/\b(\d+(?:\.\d+)?)\s*(m|cm|mm|ft|feet|foot|in)\b(?!ah)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]) * LENGTH_TO_M[match[2].toLowerCase()];
  return Number.isFinite(value) && value > 0 && value < 100 ? round(value, 3) : null;
}

/* -------------------------------- warranty ------------------------------- */

export function extractWarrantyMonths(text) {
  if (!text) return null;
  const normalized = normalizeDashes(normalizeDigits(String(text)));

  const years = normalized.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:year|yr|yrs|years|سنة|سنوات)/i);
  if (years) return Math.round(Number.parseFloat(years[1]) * 12);

  const months = normalized.match(/(\d+)\s*-?\s*(?:month|months|شهر|أشهر)/i);
  if (months) return Number.parseInt(months[1], 10);

  // A bare number in a column headed "Warranty" means years.
  const bare = normalized.match(/^\s*(\d{1,2})\s*$/);
  if (bare) return Number.parseInt(bare[1], 10) * 12;

  return null;
}

/* ------------------------------- condition ------------------------------- */

export function extractCondition(text) {
  if (!text) return null;
  const value = cleanText(text).toLowerCase();
  if (!value) return null;
  // "Used – Original Pull" and "Original Used" are the same thing in these
  // catalogs: a part harvested from working equipment.
  if (/pull|original\s+used/.test(value)) return 'original_pull';
  if (/refurb|renew/.test(value)) return 'refurbished';
  if (/used|مستعمل|second/.test(value)) return 'used';
  if (/new|جديد|brand new|sealed/.test(value)) return 'new';
  return null;
}

/* ------------------------------- interface ------------------------------- */

const INTERFACE_PATTERNS = [
  /usb\s*\d(?:\.\d)?(?:\s*gen\s*\d)?/i,
  /sata\s*(?:i{1,3}|\d)/i,
  /\bnvme\b/i,
  /\bm\.2\b/i,
  /pcie\s*\d(?:\.\d)?(?:\s*x\d+)?/i,
  /bluetooth\s*\d(?:\.\d)?/i,
  /wi-?fi\s*\d?/i,
  /ddr\d(?:l)?(?:\s*\d{3,4})?/i,
];

export function extractInterface(text) {
  if (!text) return null;
  const normalized = cleanText(text);
  for (const pattern of INTERFACE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) return match[0].toUpperCase().replace(/\s+/g, ' ');
  }
  return null;
}

/* --------------------------------- colour -------------------------------- */

const COLORS = [
  'black', 'white', 'blue', 'navy blue', 'space gray', 'space grey', 'grey', 'gray',
  'silver', 'gold', 'pink', 'red', 'green', 'yellow', 'teal', 'purple', 'orange',
];

export function extractColor(text) {
  if (!text) return null;
  const normalized = cleanText(text).toLowerCase();

  const labelled = normalized.match(/colou?rs?\s*[:：]\s*([^|,;]+)/i);
  if (labelled) return cleanText(labelled[1]).replace(/\b\w/g, (c) => c.toUpperCase());

  const found = COLORS.filter((color) => new RegExp(`\\b${color}\\b`).test(normalized));
  if (found.length === 0) return null;
  // Prefer the longest match so "navy blue" beats "blue".
  const best = found.sort((a, b) => b.length - a.length)[0];
  return best.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* --------------------------------- lists --------------------------------- */

export function splitFeatures(text) {
  if (!text) return [];
  return String(text)
    .split(FEATURE_SEPARATOR)
    .map((part) => cleanText(part))
    .filter((part) => part.length > 1)
    .slice(0, 40);
}

export function splitCompatibility(text) {
  if (!text) return [];
  return String(text)
    .split(LIST_SEPARATOR)
    .map((part) => cleanText(part))
    .filter((part) => part.length > 1)
    .slice(0, 30);
}

/**
 * Runs every extractor over the fields that can carry specs and returns a
 * populated specs block. Sources are searched in priority order so an explicit
 * column always beats something scraped out of the product name.
 *
 * @param {object} fields  Canonical field values from one row.
 * @param {{ category?:string|null }} context
 */
export function extractSpecs(fields = {}, context = {}) {
  const name = fields.name ?? '';
  const specsRaw = fields.specs_raw ?? '';
  const capacityRaw = fields.capacity ?? '';
  const haystack = [specsRaw, capacityRaw, name, fields.short_description, fields.long_description]
    .filter(Boolean)
    .join(' | ');

  const isPowerBank = /power bank|باور بانك/i.test(`${context.category ?? ''} ${name}`);

  // An explicit capacity column wins; otherwise fall back to scraping the text.
  const fromColumn = extractCapacity(capacityRaw);
  const capacity = fromColumn.capacity ? fromColumn : extractCapacity(haystack);

  const features = splitFeatures(specsRaw);
  const compatibility = splitCompatibility(fields.compatibility);

  const specs = {
    power_wattage: extractWattage(haystack),
    cable_type: extractCableType(`${name} ${specsRaw}`),
    compatibility,
    battery_capacity: extractBatteryCapacity(haystack, { isPowerBank }),
    capacity: capacity.capacity,
    capacity_gb: capacity.capacity_gb,
    interface: fields.interface ? cleanText(fields.interface) : extractInterface(haystack),
    form_factor: fields.form_factor ? cleanText(fields.form_factor) : null,
    length_m: extractLength(`${name} ${specsRaw}`),
    color: fields.color ? cleanText(fields.color) : extractColor(`${capacityRaw} ${specsRaw} ${name}`),
    warranty_months: extractWarrantyMonths(fields.warranty ?? haystack),
    condition: extractCondition(fields.condition) ?? 'unknown',
    features,
    attributes: {},
  };

  return specs;
}

export default {
  extractSpecs,
  extractWattage,
  extractBatteryCapacity,
  extractCableType,
  extractCapacity,
  extractLength,
  extractWarrantyMonths,
  extractCondition,
  extractInterface,
  extractColor,
  splitFeatures,
  splitCompatibility,
};
