import { buildIssue } from '../../shared/constants/issues.js';
import { detectPricingAlerts } from '../pricing/pricing.calculator.js';

const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Map) return value.size > 0;
  return true;
};

const specCount = (specs = {}) => {
  const typed = [
    specs.power_wattage,
    specs.cable_type,
    specs.battery_capacity,
    specs.capacity,
    specs.interface,
    specs.form_factor,
    specs.length_m,
    specs.color,
    specs.warranty_months,
  ].filter(hasValue).length;
  const attrs = specs.attributes instanceof Map
    ? specs.attributes.size
    : Object.keys(specs.attributes ?? {}).length;
  return typed + attrs + (specs.compatibility?.length ? 1 : 0) + (specs.features?.length ? 1 : 0);
};

/**
 * Document-local validation. Everything that can be judged from one product
 * without touching the database. Cross-document checks (duplicate SKUs,
 * near-duplicate products) live in quality.service.
 *
 * @returns {Array<{code, severity, message, penalty, field?, context?}>}
 */
export function validateProduct(rawProduct = {}, options = {}) {
  // Callers include the merge path and admin edits, where a null or partially
  // built document is reachable. Validation must report on bad input, never
  // throw on it.
  const product = rawProduct ?? {};
  const issues = [];
  const add = (code, extra = {}) => issues.push(buildIssue(code, extra));

  /* ---- identity ---- */
  if (!hasValue(product.name)) add('MISSING_NAME', { field: 'name' });
  if (!hasValue(product.brand)) add('MISSING_BRAND', { field: 'brand' });
  if (!hasValue(product.category)) add('MISSING_CATEGORY', { field: 'category' });

  if (!hasValue(product.sku)) {
    add('MISSING_SKU', { field: 'sku' });
  } else if (product.metadata?.sku_generated) {
    add('GENERATED_SKU', { field: 'sku', context: { sku: product.sku } });
  }

  /* ---- pricing ---- */
  for (const alert of detectPricingAlerts(product.pricing ?? {}, options.thresholds)) {
    add(alert.code, { field: alert.field, context: alert.context });
  }

  const detail = product.pricing?.detail ?? {};
  const rangeOnly = ['rdp', 'rrp', 'selling_price'].some((key) => detail[key]?.is_range);
  if (rangeOnly) add('PRICE_RANGE_ONLY', { field: 'pricing' });

  /* ---- specs & commercial ---- */
  if (specCount(product.specs ?? {}) === 0) add('MISSING_SPECS', { field: 'specs' });
  if (!hasValue(product.inventory?.supplier)) add('MISSING_SUPPLIER', { field: 'inventory.supplier' });
  if (!Number.isFinite(product.inventory?.quantity) || product.inventory.quantity <= 0) {
    add('MISSING_QUANTITY', { field: 'inventory.quantity' });
  }
  if (!product.images?.length) add('MISSING_IMAGES', { field: 'images' });

  /* ---- provenance flags ---- */
  if (product.status?.is_generic) add('GENERIC_ITEM', { field: 'status.is_generic' });
  if (product.status?.is_draft) add('DRAFT_ITEM', { field: 'status.is_draft' });

  if (product.metadata?.unmapped_columns?.length) {
    add('UNPARSED_COLUMNS', {
      field: 'metadata.raw',
      context: { columns: product.metadata.unmapped_columns },
    });
  }
  if (product.metadata?.category_unmapped) add('UNMAPPED_CATEGORY', { field: 'category' });
  if (product.metadata?.sku_corrected) {
    add('SKU_CORRECTED', {
      field: 'sku',
      context: { from: product.metadata.sku_corrected, to: product.sku },
    });
  }
  if (product.metadata?.cost_mismatch) {
    add('COST_MISMATCH', { field: 'pricing.rdp', context: product.metadata.cost_mismatch });
  }

  return issues;
}

export default validateProduct;
