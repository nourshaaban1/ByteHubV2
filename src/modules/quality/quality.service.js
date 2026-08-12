import env from '../../config/env.js';
import { notFound } from '../../shared/errors/AppError.js';
import { ISSUES, SEVERITY } from '../../shared/constants/issues.js';
import { normalizeKey, similarity } from '../../shared/utils/text.js';
import Product from '../product/product.model.js';
import productRepository from '../product/product.repository.js';
import { revalidate } from '../catalog/catalog.transformer.js';
import { scoreProduct, FIELD_WEIGHTS } from './quality.scorer.js';

/** Similarity above which two differently-SKU'd rows are probably one product. */
const NEAR_DUPLICATE_THRESHOLD = 0.86;

export const qualityService = {
  /** The scoring model itself, so the admin UI can explain a score. */
  rubric() {
    return {
      scale: '0-100: weighted field completeness, minus penalties for defects',
      min_publishable: env.quality.minPublishable,
      completeness_weights: Object.fromEntries(
        Object.entries(FIELD_WEIGHTS).map(([group, definition]) => [
          group,
          {
            weight: definition.weight,
            fields: Object.fromEntries(
              Object.entries(definition.fields).map(([field, spec]) => [field, spec.weight]),
            ),
          },
        ]),
      ),
      issues: Object.fromEntries(
        Object.entries(ISSUES).map(([code, definition]) => [
          code,
          { severity: definition.severity, penalty: definition.penalty, message: definition.message },
        ]),
      ),
      grades: { A: '>=90', B: '>=75', C: '>=60', D: '>=40', F: '<40' },
    };
  },

  /** Catalog-wide quality picture. */
  async overview() {
    const [totals] = await productRepository.aggregate([
      {
        $group: {
          _id: null,
          products: { $sum: 1 },
          avg_score: { $avg: '$metadata.data_quality_score' },
          avg_completeness: { $avg: '$metadata.completeness' },
          verified: { $sum: { $cond: ['$status.is_verified', 1, 0] } },
          generic: { $sum: { $cond: ['$status.is_generic', 1, 0] } },
          drafts: { $sum: { $cond: ['$status.is_draft', 1, 0] } },
          publishable: {
            $sum: { $cond: [{ $gte: ['$metadata.data_quality_score', env.quality.minPublishable] }, 1, 0] },
          },
          with_issues: { $sum: { $cond: [{ $gt: [{ $size: '$issues' }, 0] }, 1, 0] } },
        },
      },
    ]);

    const [byCode, bySeverity, distribution] = await Promise.all([
      productRepository.aggregate([
        { $unwind: '$issues' },
        { $group: { _id: '$issues.code', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      productRepository.aggregate([
        { $unwind: '$issues' },
        { $group: { _id: '$issues.severity', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      productRepository.aggregate([
        {
          $bucket: {
            groupBy: '$metadata.data_quality_score',
            boundaries: [0, 40, 60, 75, 90, 101],
            default: 'unscored',
            output: { count: { $sum: 1 } },
          },
        },
      ]),
    ]);

    const gradeLabels = { 0: 'F (0-39)', 40: 'D (40-59)', 60: 'C (60-74)', 75: 'B (75-89)', 90: 'A (90-100)' };

    return {
      totals: {
        products: totals?.products ?? 0,
        verified: totals?.verified ?? 0,
        generic: totals?.generic ?? 0,
        drafts: totals?.drafts ?? 0,
        publishable: totals?.publishable ?? 0,
        with_issues: totals?.with_issues ?? 0,
        average_score: totals?.avg_score ? Math.round(totals.avg_score * 10) / 10 : null,
        average_completeness: totals?.avg_completeness
          ? Math.round(totals.avg_completeness * 10) / 10
          : null,
      },
      min_publishable: env.quality.minPublishable,
      issues_by_code: Object.fromEntries(byCode.map((entry) => [entry._id, entry.count])),
      issues_by_severity: Object.fromEntries(bySeverity.map((entry) => [entry._id, entry.count])),
      score_distribution: distribution.map((bucket) => ({
        band: gradeLabels[bucket._id] ?? String(bucket._id),
        count: bucket.count,
      })),
    };
  },

  /**
   * SKU collisions.
   * Two products sharing a SKU is not automatically an error — Joyroom really
   * does reuse JR-ZS259 and SA21-1T3 — so the kinds are reported separately.
   */
  async duplicateSkus() {
    const groups = await productRepository.duplicateSkuGroups();

    return groups.map((group) => {
      const distinctNames = new Set(group.products.map((product) => normalizeKey(product.name)));
      return {
        sku_key: group._id,
        count: group.count,
        kind: distinctNames.size === 1 ? 'duplicate_row' : 'reused_model_code',
        severity: distinctNames.size === 1 ? SEVERITY.CRITICAL : SEVERITY.HIGH,
        products: group.products,
      };
    });
  },

  /**
   * Products that are probably the same item under different SKUs.
   * Compared in-process against a projection: the catalog is a few hundred
   * rows, so an O(n²) pass is cheaper and far more accurate than a text index.
   */
  async nearDuplicates({ threshold = NEAR_DUPLICATE_THRESHOLD, limit = 50 } = {}) {
    const products = await Product.find({ 'status.is_active': true })
      .select('name brand sku category metadata.source_catalog metadata.data_quality_score')
      .lean();

    const pairs = [];
    for (let i = 0; i < products.length; i += 1) {
      for (let j = i + 1; j < products.length; j += 1) {
        const a = products[i];
        const b = products[j];
        if (normalizeKey(a.brand ?? '') !== normalizeKey(b.brand ?? '')) continue;

        const score = similarity(a.name, b.name);
        if (score < threshold) continue;

        pairs.push({
          score: Number(score.toFixed(3)),
          products: [a, b].map((product) => ({
            _id: product._id,
            name: product.name,
            sku: product.sku,
            brand: product.brand,
            source: product.metadata?.source_catalog,
            quality: product.metadata?.data_quality_score,
          })),
        });
      }
    }

    return pairs.sort((a, b) => b.score - a.score).slice(0, limit);
  },

  /** Worst-scoring products, for a triage queue. */
  async worst({ limit = 25, severity } = {}) {
    const filter = severity ? { 'issues.severity': severity } : {};
    return Product.find(filter)
      .select('name sku brand category metadata.data_quality_score metadata.completeness issues status')
      .sort({ 'metadata.data_quality_score': 1 })
      .limit(limit)
      .lean();
  },

  /** Explains one product's score field by field. */
  async explain(id) {
    const product = await Product.findById(id).lean();
    if (!product) throw notFound('Product', id);

    const scored = scoreProduct(product, product.issues ?? []);
    return {
      id,
      name: product.name,
      sku: product.sku,
      score: scored.score,
      grade: scored.grade,
      completeness: scored.completeness,
      publishable: scored.score >= env.quality.minPublishable,
      breakdown: scored.breakdown,
      issues: product.issues ?? [],
    };
  },

  /**
   * Re-runs validation and scoring across the catalog, and writes cross-document
   * issues (duplicate SKUs) that a single-row pass cannot see.
   */
  async rescoreAll({ dryRun = false } = {}) {
    const collisions = await qualityService.duplicateSkus();
    const collisionByProduct = new Map();

    for (const group of collisions) {
      for (const product of group.products) {
        collisionByProduct.set(String(product._id), {
          code: group.kind === 'duplicate_row' ? 'DUPLICATE_SKU' : 'AMBIGUOUS_SKU',
          severity: group.severity,
          penalty: group.kind === 'duplicate_row' ? ISSUES.DUPLICATE_SKU.penalty : ISSUES.AMBIGUOUS_SKU.penalty,
          message:
            group.kind === 'duplicate_row'
              ? 'SKU is used by another product'
              : 'Supplier reuses this model code for more than one product',
          field: 'sku',
          context: {
            sku_key: group.sku_key,
            others: group.products
              .filter((other) => String(other._id) !== String(product._id))
              .map((other) => ({ _id: other._id, name: other.name, source: other.source })),
          },
        });
      }
    }

    const products = await Product.find().lean();
    const operations = [];
    let improved = 0;
    let degraded = 0;

    for (const product of products) {
      const before = product.metadata?.data_quality_score ?? 0;
      const collision = collisionByProduct.get(String(product._id));

      revalidate(product, {
        thresholds: env.margin,
        extraIssues: collision ? [collision] : [],
      });

      const after = product.metadata.data_quality_score;
      if (after > before) improved += 1;
      if (after < before) degraded += 1;

      operations.push({
        updateOne: {
          filter: { _id: product._id },
          update: {
            $set: {
              issues: product.issues,
              'metadata.data_quality_score': after,
              'metadata.completeness': product.metadata.completeness,
              'metadata.quality_breakdown': product.metadata.quality_breakdown,
            },
          },
        },
      });
    }

    if (!dryRun) await productRepository.bulkWrite(operations);

    return {
      examined: products.length,
      improved,
      degraded,
      sku_collisions: collisions.length,
      dry_run: dryRun,
    };
  },
};

export default qualityService;
