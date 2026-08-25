/**
 * Presentation vocabulary for backend concepts.
 *
 * This file maps backend values onto labels and colours. It does not decide
 * them: margin bands, issue severities and quality grades are all computed
 * server-side, and duplicating that logic here is how a UI starts disagreeing
 * with its own API.
 */

export const MARGIN_BANDS = {
  loss: { label: 'Loss', tone: 'loss', description: 'Sells below cost — every unit loses money' },
  critical: { label: 'Critical', tone: 'critical', description: 'Below the critical margin threshold' },
  low: { label: 'Low', tone: 'warn', description: 'Below the warning margin threshold' },
  healthy: { label: 'Healthy', tone: 'healthy', description: 'Above the warning threshold' },
  target: { label: 'Target', tone: 'target', description: 'At or above the target margin' },
  implausible: {
    label: 'Implausible',
    tone: 'critical',
    description: 'Margin is too high to be real — likely a unit or currency error',
  },
  unknown: { label: 'Unknown', tone: 'unknown', description: 'Not enough price data to compute a margin' },
};

export const SEVERITIES = {
  critical: { label: 'Critical', tone: 'loss', rank: 0 },
  high: { label: 'High', tone: 'critical', rank: 1 },
  medium: { label: 'Medium', tone: 'warn', rank: 2 },
  low: { label: 'Low', tone: 'unknown', rank: 3 },
  info: { label: 'Info', tone: 'unknown', rank: 4 },
};

export const PROCUREMENT = {
  must_buy: { label: 'Must buy', tone: 'target' },
  test_buy: { label: 'Test buy', tone: 'healthy' },
  opportunity: { label: 'Opportunity', tone: 'brand' },
  avoid: { label: 'Avoid', tone: 'loss' },
  unclassified: { label: 'Unclassified', tone: 'unknown' },
};

export const LIFECYCLE = {
  not_started: 'Not started',
  draft: 'Draft',
  review: 'In review',
  approved: 'Approved',
  published: 'Published',
  archived: 'Archived',
};

export function gradeFor(score) {
  if (score === null || score === undefined) return { letter: '—', tone: 'unknown' };
  if (score >= 90) return { letter: 'A', tone: 'target' };
  if (score >= 75) return { letter: 'B', tone: 'healthy' };
  if (score >= 60) return { letter: 'C', tone: 'warn' };
  if (score >= 40) return { letter: 'D', tone: 'critical' };
  return { letter: 'F', tone: 'loss' };
}

export const bandOf = (band) => MARGIN_BANDS[band] ?? MARGIN_BANDS.unknown;
export const severityOf = (severity) => SEVERITIES[severity] ?? SEVERITIES.info;

/**
 * Issues an operator can actually resolve by typing a value, mapped to the
 * field the fix queue should focus. Issues absent from this map are real but
 * need a decision rather than a keystroke (duplicates, cost mismatches).
 */
export const FIXABLE_ISSUES = {
  MISSING_COST: { field: 'pricing.rdp', label: 'Wholesale cost', type: 'money' },
  MISSING_SELLING_PRICE: { field: 'pricing.selling_price', label: 'Selling price', type: 'money' },
  MISSING_CURRENCY: { field: 'pricing.currency', label: 'Currency', type: 'currency' },
  MISSING_QUANTITY: { field: 'inventory.quantity', label: 'Quantity', type: 'integer' },
  MISSING_SUPPLIER: { field: 'inventory.supplier', label: 'Supplier', type: 'text' },
  MISSING_BRAND: { field: 'brand', label: 'Brand', type: 'text' },
  MISSING_CATEGORY: { field: 'category', label: 'Category', type: 'text' },
  PRICE_RANGE_ONLY: { field: 'pricing.selling_price', label: 'Exact selling price', type: 'money' },
  ESTIMATED_PRICE: { field: 'pricing.selling_price', label: 'Confirmed selling price', type: 'money' },
  SELLING_BELOW_COST: { field: 'pricing.selling_price', label: 'Selling price', type: 'money' },
  MISSING_SPECS: { field: 'specs.capacity', label: 'Capacity / spec', type: 'text' },
};

/** Issues that need a human judgement call, not a data entry fix. */
export const DECISION_ISSUES = new Set([
  'DUPLICATE_SKU',
  'AMBIGUOUS_SKU',
  'DUPLICATE_PRODUCT',
  'COST_MISMATCH',
  'MARKET_BELOW_COST',
  'IMPLAUSIBLE_MARGIN',
  'GENERIC_ITEM',
  'DRAFT_ITEM',
]);

export const isFixable = (code) => Boolean(FIXABLE_ISSUES[code]);
export const needsDecision = (code) => DECISION_ISSUES.has(code);

/** Sorts issues worst-first for display. */
export const bySeverity = (a, b) =>
  severityOf(a.severity).rank - severityOf(b.severity).rank || a.code.localeCompare(b.code);

export default { MARGIN_BANDS, SEVERITIES, PROCUREMENT, LIFECYCLE, gradeFor, bandOf, severityOf };
