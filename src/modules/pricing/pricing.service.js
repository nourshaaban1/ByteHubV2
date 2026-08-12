import env from '../../config/env.js';
import { notFound } from '../../shared/errors/AppError.js';
import { round, convert } from '../../shared/utils/money.js';
import Product from '../product/product.model.js';
import productRepository from '../product/product.repository.js';
import { revalidate } from '../catalog/catalog.transformer.js';
import {
  computePricing,
  classifyMargin,
  priceForTargetMargin,
  breakEvenPrice,
  marginOnCost,
  marginOnRevenue,
} from './pricing.calculator.js';

const BAND_ORDER = ['loss', 'critical', 'low', 'healthy', 'target', 'implausible', 'unknown'];

export const pricingService = {
  /** Policy thresholds in force, so the admin UI never hardcodes them. */
  policy() {
    return {
      base_currency: env.baseCurrency,
      usd_to_egp_rate: env.usdToEgpRate,
      thresholds: env.margin,
      margin_definitions: {
        margin_percentage: '(selling_price - rdp) / rdp * 100  — markup on cost (ByteHub spec)',
        gross_margin_percentage:
          '(selling_price - rdp) / selling_price * 100  — share of revenue (procurement workbook convention)',
      },
      bands: BAND_ORDER,
    };
  },

  /** What-if calculator: no product, no persistence. */
  quote({ rdp, selling_price: sellingPrice, rrp, currency, target_margin: targetMargin }) {
    const effectiveSelling = sellingPrice ?? rrp ?? null;
    const { pricing, alerts } = computePricing(
      { rdp, rrp, selling_price: effectiveSelling, currency },
      { thresholds: env.margin },
    );

    const target = targetMargin ?? env.margin.targetPct;

    return {
      input: { rdp, rrp, selling_price: effectiveSelling, currency },
      margin_percentage: pricing.margin_percentage,
      gross_margin_percentage: pricing.gross_margin_percentage,
      margin_value: pricing.margin_value,
      margin_band: pricing.margin_band,
      normalized: pricing.normalized,
      break_even_price: breakEvenPrice(rdp),
      target_margin_percentage: target,
      price_for_target_margin: priceForTargetMargin(rdp, target),
      price_at_warn_threshold: priceForTargetMargin(rdp, env.margin.warnPct),
      alerts,
    };
  },

  /** Margin alerts across the catalog, worst first. */
  async alerts({ band, limit = 50, includeInactive = false } = {}) {
    const filter = {
      'pricing.margin_percentage': { $ne: null },
      ...(includeInactive ? {} : { 'status.is_active': true }),
      ...(band ? { 'pricing.margin_band': { $in: [].concat(band) } } : {
        'pricing.margin_band': { $in: ['loss', 'critical', 'low', 'implausible'] },
      }),
    };

    const items = await Product.find(filter)
      .select('name sku brand category pricing inventory.quantity inventory.supplier status metadata.source_catalog')
      .sort({ 'pricing.margin_percentage': 1 })
      .limit(limit)
      .lean();

    return items.map((product) => ({
      ...product,
      exposure: round(
        (product.pricing?.normalized?.rdp ?? 0) * (product.inventory?.quantity ?? 0),
      ),
      suggested_price: priceForTargetMargin(product.pricing?.rdp, env.margin.warnPct),
    }));
  },

  /** Products sold at or below cost — the sharpest failure mode. */
  async lossMakers({ limit = 50 } = {}) {
    const items = await Product.find({
      'pricing.rdp': { $gt: 0 },
      $expr: { $lt: ['$pricing.selling_price', '$pricing.rdp'] },
    })
      .select('name sku brand category pricing inventory.quantity')
      .sort({ 'pricing.margin_percentage': 1 })
      .limit(limit)
      .lean();

    return items.map((product) => ({
      ...product,
      loss_per_unit: round((product.pricing?.rdp ?? 0) - (product.pricing?.selling_price ?? 0)),
      total_exposure: round(
        ((product.pricing?.rdp ?? 0) - (product.pricing?.selling_price ?? 0)) *
          (product.inventory?.quantity ?? 0),
      ),
    }));
  },

  /**
   * Recomputes margins and FX-normalised figures for the whole catalog.
   * Needed after an exchange-rate or threshold change — the stored numbers are
   * denormalised for query speed, so they must be refreshed explicitly.
   */
  async recalculateAll({ filter = {}, dryRun = false } = {}) {
    const products = await Product.find(filter).select(
      'pricing issues metadata specs inventory status name brand sku category images description',
    );

    let changed = 0;
    const operations = [];

    for (const product of products) {
      const plain = product.toObject();
      const before = {
        margin: plain.pricing?.margin_percentage ?? null,
        band: plain.pricing?.margin_band ?? null,
        score: plain.metadata?.data_quality_score ?? null,
      };

      const { pricing } = computePricing(plain.pricing ?? {}, { thresholds: env.margin });
      plain.pricing = { ...plain.pricing, ...pricing };
      revalidate(plain, { thresholds: env.margin });

      if (
        before.margin !== pricing.margin_percentage ||
        before.band !== pricing.margin_band ||
        before.score !== plain.metadata.data_quality_score
      ) {
        changed += 1;
      }

      operations.push({
        updateOne: {
          filter: { _id: product._id },
          update: {
            $set: {
              'pricing.margin_percentage': pricing.margin_percentage,
              'pricing.gross_margin_percentage': pricing.gross_margin_percentage,
              'pricing.margin_value': pricing.margin_value,
              'pricing.margin_band': pricing.margin_band,
              'pricing.selling_price': pricing.selling_price,
              'pricing.normalized': pricing.normalized,
              issues: plain.issues,
              'metadata.data_quality_score': plain.metadata.data_quality_score,
              'metadata.completeness': plain.metadata.completeness,
              'metadata.quality_breakdown': plain.metadata.quality_breakdown,
            },
          },
        },
      });
    }

    if (!dryRun) await productRepository.bulkWrite(operations);

    return {
      examined: products.length,
      changed,
      written: dryRun ? 0 : operations.length,
      dry_run: dryRun,
    };
  },

  /** Suggests a price for one product against a target margin. */
  async suggestPrice(id, { targetMargin = env.margin.targetPct } = {}) {
    const product = await Product.findById(id).select('name sku pricing').lean();
    if (!product) throw notFound('Product', id);

    const rdp = product.pricing?.rdp ?? null;
    const suggested = priceForTargetMargin(rdp, targetMargin);

    return {
      id,
      name: product.name,
      sku: product.sku,
      currency: product.pricing?.currency ?? null,
      current: {
        rdp,
        selling_price: product.pricing?.selling_price ?? null,
        margin_percentage: product.pricing?.margin_percentage ?? null,
        margin_band: product.pricing?.margin_band ?? 'unknown',
      },
      target_margin_percentage: targetMargin,
      suggested_selling_price: suggested,
      suggested_margin_band: classifyMargin(targetMargin),
      break_even_price: breakEvenPrice(rdp),
      delta_vs_current: suggested !== null && Number.isFinite(product.pricing?.selling_price)
        ? round(suggested - product.pricing.selling_price)
        : null,
      market: {
        low: product.pricing?.market_low ?? null,
        high: product.pricing?.market_high ?? null,
        // A suggestion above the observed street ceiling will not sell.
        exceeds_market_high:
          Number.isFinite(product.pricing?.market_high) && suggested !== null
            ? suggested > product.pricing.market_high
            : null,
      },
    };
  },

  marginOnCost,
  marginOnRevenue,
  convert,
};

export default pricingService;
