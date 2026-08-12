import env from '../../config/env.js';
import { notFound, badRequest, conflict } from '../../shared/errors/AppError.js';
import { flatten, getPath } from '../../shared/utils/object.js';
import { computeFingerprint } from '../../shared/utils/fingerprint.js';
import productRepository from './product.repository.js';
import { computePricing } from '../pricing/pricing.calculator.js';
import { revalidate } from '../catalog/catalog.transformer.js';

/** Paths a PATCH may touch. Anything else is rejected rather than ignored. */
const EDITABLE_PATHS = new Set([
  'name', 'brand', 'sku', 'category', 'subcategory', 'tags', 'alternate_skus',
  'description.short', 'description.long',
  'pricing.currency', 'pricing.rdp', 'pricing.rrp', 'pricing.selling_price',
  'pricing.market_low', 'pricing.market_high', 'pricing.price_source',
  'specs.power_wattage', 'specs.cable_type', 'specs.compatibility', 'specs.battery_capacity',
  'specs.capacity', 'specs.interface', 'specs.form_factor', 'specs.length_m',
  'specs.color', 'specs.warranty_months', 'specs.condition', 'specs.features', 'specs.attributes',
  'inventory.quantity', 'inventory.supplier', 'inventory.alternate_suppliers',
  'inventory.reorder_point', 'inventory.warehouse', 'inventory.lead_time_days',
  'status.is_active', 'status.is_generic', 'status.is_draft',
  'status.lifecycle', 'status.procurement',
  'images',
]);

/** Changing any of these invalidates the computed pricing block. */
const PRICING_INPUTS = [
  'pricing.currency', 'pricing.rdp', 'pricing.rrp', 'pricing.selling_price',
  'pricing.market_low', 'pricing.market_high',
];

const toDocument = (product) => (typeof product.toObject === 'function' ? product.toObject() : product);

async function loadOrFail(id) {
  const product = await productRepository.findById(id);
  if (!product) throw notFound('Product', id);
  return product;
}

/**
 * Applies an admin edit.
 *
 * Every edited path is recorded in `metadata.locked_fields`, which the import
 * pipeline treats as untouchable. That is what makes a manual correction
 * survive the next catalog import instead of being silently reverted.
 */
async function applyPatch(product, patch, { actor = 'admin', reason = null, lock = true } = {}) {
  const flat = flatten(patch, {
    stopAt: new Set([
      'specs.attributes', 'specs.compatibility', 'specs.features',
      'tags', 'alternate_skus', 'images', 'inventory.alternate_suppliers',
    ]),
  });

  const invalid = Object.keys(flat).filter((path) => !EDITABLE_PATHS.has(path));
  if (invalid.length > 0) {
    throw badRequest('Some fields are not editable', {
      invalid,
      editable: [...EDITABLE_PATHS],
    });
  }

  const overrides = [];
  for (const [path, value] of Object.entries(flat)) {
    const previous = getPath(product, path);
    if (JSON.stringify(previous) === JSON.stringify(value)) continue;

    product.set(path, value);
    overrides.push({ field: path, previous, next: value, reason, by: actor, at: new Date() });
  }

  if (overrides.length === 0) return { product, overrides };

  if (PRICING_INPUTS.some((path) => path in flat)) {
    const { pricing } = computePricing(toDocument(product).pricing, { thresholds: env.margin });
    product.set('pricing', { ...toDocument(product).pricing, ...pricing });
    product.set('pricing.last_priced_at', new Date());
  }

  if (lock) {
    const locked = new Set(product.metadata?.locked_fields ?? []);
    for (const override of overrides) locked.add(override.field);
    product.set('metadata.locked_fields', [...locked]);
  }

  product.set('metadata.overrides', [...(product.metadata?.overrides ?? []), ...overrides].slice(-100));

  // The edit may have fixed — or introduced — data-quality problems.
  const refreshed = toDocument(product);
  revalidate(refreshed, { thresholds: env.margin });
  product.set('issues', refreshed.issues);
  product.set('metadata.data_quality_score', refreshed.metadata.data_quality_score);
  product.set('metadata.completeness', refreshed.metadata.completeness);
  product.set('metadata.quality_breakdown', refreshed.metadata.quality_breakdown);

  return { product, overrides };
}

export const productService = {
  list(query) {
    return productRepository.findMany(query);
  },

  async getById(id) {
    const product = await productRepository.findByIdLean(id);
    if (!product) throw notFound('Product', id);
    return product;
  },

  async create(payload, { actor = 'admin' } = {}) {
    const draft = {
      ...payload,
      metadata: {
        ...(payload.metadata ?? {}),
        source_catalog: payload.metadata?.source_catalog ?? 'manual',
        source_type: 'manual',
        // A hand-created product is authored, not imported: every field it
        // was given is locked so an import cannot overwrite it.
        locked_fields: [...Object.keys(flatten(payload)).filter((path) => EDITABLE_PATHS.has(path))],
      },
    };

    const { pricing } = computePricing(draft.pricing ?? {}, { thresholds: env.margin });
    draft.pricing = pricing;
    revalidate(draft, { thresholds: env.margin });

    const fingerprint = computeFingerprint(draft);
    const existing = await productRepository.findByFingerprint(fingerprint);
    if (existing) {
      throw conflict('A product with this SKU (or brand + name) already exists', {
        id: existing._id,
        sku: existing.sku,
        fingerprint,
      });
    }

    draft.metadata.overrides = [
      { field: '(created)', previous: null, next: null, by: actor, at: new Date() },
    ];

    const created = await productRepository.create(draft);
    return created.toObject();
  },

  async update(id, patch, options) {
    const product = await loadOrFail(id);
    const { product: patched, overrides } = await applyPatch(product, patch, options);
    if (overrides.length === 0) return { product: toDocument(patched), changed: [] };

    await patched.save();
    return { product: patched.toObject(), changed: overrides.map((entry) => entry.field) };
  },

  /** Dedicated price update: same audit trail, narrower surface. */
  async updatePrice(id, patch, options) {
    const pricingPatch = { pricing: patch };
    return productService.update(id, pricingPatch, options);
  },

  /**
   * Applies many edits in one request, for the data-quality fix queue.
   *
   * Deliberately reports per-item outcomes rather than failing the batch or
   * swallowing failures: fixing 20 products and silently dropping 3 is worse
   * than fixing 17 and saying so. Each item takes the same locking and audit
   * path as a single PATCH.
   */
  async bulkUpdate(updates, options = {}) {
    const results = [];

    for (const entry of updates) {
      try {
        const { product, changed } = await productService.update(entry.id, entry.patch, {
          ...options,
          reason: entry.reason ?? options.reason,
        });
        results.push({
          id: entry.id,
          status: changed.length > 0 ? 'updated' : 'unchanged',
          changed,
          sku: product.sku,
          data_quality_score: product.metadata?.data_quality_score ?? null,
        });
      } catch (error) {
        results.push({
          id: entry.id,
          status: 'failed',
          code: error.code ?? 'INTERNAL_ERROR',
          message: error.message,
          details: error.details,
        });
      }
    }

    const count = (status) => results.filter((result) => result.status === status).length;

    return {
      total: updates.length,
      updated: count('updated'),
      unchanged: count('unchanged'),
      failed: count('failed'),
      results,
    };
  },

  /**
   * @param {object} options
   * @param {string[]} [options.allowIssueCodes] Critical issue codes to waive.
   *   Empty by default, so the gate is unchanged unless a caller opts in.
   *   Exists because not every critical issue is critical to a *customer*:
   *   MISSING_COST means the shop has not recorded what it pays, which matters
   *   for margin reporting and not at all for the product page. Waiving is
   *   deliberate, per-code, and recorded in the audit trail below.
   */
  async setVerification(
    id,
    { is_verified: isVerified, actor = 'admin', reason = null, allowIssueCodes = [] },
  ) {
    const product = await loadOrFail(id);

    if (isVerified) {
      const waived = new Set(allowIssueCodes);
      const blocking = (product.issues ?? []).filter(
        (issue) => issue.severity === 'critical' && !waived.has(issue.code),
      );
      if (blocking.length > 0) {
        throw badRequest('Product has unresolved critical issues and cannot be verified', {
          issues: blocking.map((issue) => ({ code: issue.code, message: issue.message, field: issue.field })),
        });
      }
    }

    product.set('status.is_verified', isVerified);
    product.set('status.verified_by', isVerified ? actor : null);
    product.set('status.verified_at', isVerified ? new Date() : null);
    product.set('status.lifecycle', isVerified ? 'approved' : 'review');
    // Which issues were waived is part of why this product went live, so it
    // belongs in the audit trail rather than only in the operator's memory.
    const waivedHere = isVerified
      ? (product.issues ?? [])
          .filter((issue) => issue.severity === 'critical' && allowIssueCodes.includes(issue.code))
          .map((issue) => issue.code)
      : [];

    const auditReason = waivedHere.length > 0
      ? `${reason ?? 'Verified'} (waived: ${[...new Set(waivedHere)].join(', ')})`
      : reason;

    product.set('metadata.overrides', [
      ...(product.metadata?.overrides ?? []),
      { field: 'status.is_verified', previous: !isVerified, next: isVerified, reason: auditReason, by: actor, at: new Date() },
    ].slice(-100));

    await product.save();
    return product.toObject();
  },

  /** Releases fields back to the import pipeline. */
  async unlockFields(id, fields) {
    const product = await loadOrFail(id);
    const locked = new Set(product.metadata?.locked_fields ?? []);
    const removed = fields.filter((field) => locked.delete(field));
    product.set('metadata.locked_fields', [...locked]);
    await product.save();
    return { locked_fields: [...locked], unlocked: removed };
  },

  async remove(id, { hard = false } = {}) {
    const product = hard
      ? await productRepository.deleteById(id)
      : await productRepository.softDeleteById(id);
    if (!product) throw notFound('Product', id);
    return { id, deleted: hard, archived: !hard };
  },

  EDITABLE_PATHS,
};

export default productService;
