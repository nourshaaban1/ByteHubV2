import { normalizeKey } from './text.js';

/** Canonical SKU comparison key: case- and punctuation-insensitive, no spaces. */
export const skuKey = (sku) => {
  const key = normalizeKey(sku ?? '').replace(/\s+/g, '');
  return key || null;
};

/**
 * Stable identity for a product across imports.
 *
 * A real SKU is the identity when there is one; otherwise brand + name is the
 * best available anchor. Keeping this in one place is what makes re-running an
 * import update rows instead of duplicating them.
 */
export function computeFingerprint({ sku, brand, name } = {}) {
  const key = skuKey(sku);
  if (key) return `sku:${key}`;
  return `nm:${normalizeKey(brand ?? '') || 'nobrand'}|${normalizeKey(name ?? '')}`;
}

export default { computeFingerprint, skuKey };
