import env from '../../config/env.js';
import { round } from '../../shared/utils/money.js';
import productRepository from '../product/product.repository.js';

/**
 * Every monetary aggregate uses `pricing.normalized.*`, which is the value
 * converted into BASE_CURRENCY at import time. Summing `pricing.rdp` directly
 * would add EGP and USD figures together — ByteHub's catalogs contain both.
 */
const ACTIVE = { 'status.is_active': true };

const money = (path) => ({ $ifNull: [path, 0] });

export const analyticsService = {
  /** Headline numbers for the admin dashboard. */
  async summary() {
    const [result] = await productRepository.aggregate([
      { $match: ACTIVE },
      {
        $project: {
          quantity: money('$inventory.quantity'),
          cost: money('$pricing.normalized.rdp'),
          price: money('$pricing.normalized.selling_price'),
          margin: '$pricing.margin_percentage',
          gross_margin: '$pricing.gross_margin_percentage',
          quality: money('$metadata.data_quality_score'),
          verified: { $cond: ['$status.is_verified', 1, 0] },
          generic: { $cond: ['$status.is_generic', 1, 0] },
          has_price: { $cond: [{ $gt: [money('$pricing.normalized.selling_price'), 0] }, 1, 0] },
        },
      },
      {
        $group: {
          _id: null,
          products: { $sum: 1 },
          total_units: { $sum: '$quantity' },
          inventory_cost_value: { $sum: { $multiply: ['$cost', '$quantity'] } },
          inventory_retail_value: { $sum: { $multiply: ['$price', '$quantity'] } },
          average_margin: { $avg: '$margin' },
          average_gross_margin: { $avg: '$gross_margin' },
          average_quality: { $avg: '$quality' },
          verified: { $sum: '$verified' },
          generic: { $sum: '$generic' },
          priced: { $sum: '$has_price' },
        },
      },
    ]);

    const costValue = round(result?.inventory_cost_value ?? 0);
    const retailValue = round(result?.inventory_retail_value ?? 0);

    return {
      currency: env.baseCurrency,
      products: result?.products ?? 0,
      priced_products: result?.priced ?? 0,
      verified_products: result?.verified ?? 0,
      generic_products: result?.generic ?? 0,
      total_units: result?.total_units ?? 0,
      inventory_cost_value: costValue,
      inventory_retail_value: retailValue,
      // What the current stock would earn if it all sold at the listed price.
      potential_gross_profit: round(retailValue - costValue),
      average_margin_percentage: result?.average_margin ? round(result.average_margin) : null,
      average_gross_margin_percentage: result?.average_gross_margin
        ? round(result.average_gross_margin)
        : null,
      average_quality_score: result?.average_quality ? round(result.average_quality, 1) : null,
    };
  },

  /** Inventory value split by any dimension the admin cares about. */
  async inventoryValue({ groupBy = 'category' } = {}) {
    const dimensions = {
      category: '$category',
      subcategory: '$subcategory',
      brand: '$brand',
      supplier: '$inventory.supplier',
      procurement: '$status.procurement',
      source: '$metadata.source_catalog',
      currency: '$pricing.currency',
    };
    const field = dimensions[groupBy] ?? dimensions.category;

    const rows = await productRepository.aggregate([
      { $match: ACTIVE },
      {
        $group: {
          _id: { $ifNull: [field, '(unassigned)'] },
          products: { $sum: 1 },
          units: { $sum: money('$inventory.quantity') },
          cost_value: {
            $sum: { $multiply: [money('$pricing.normalized.rdp'), money('$inventory.quantity')] },
          },
          retail_value: {
            $sum: {
              $multiply: [money('$pricing.normalized.selling_price'), money('$inventory.quantity')],
            },
          },
          average_margin: { $avg: '$pricing.margin_percentage' },
        },
      },
      { $sort: { cost_value: -1 } },
    ]);

    return {
      currency: env.baseCurrency,
      group_by: groupBy,
      groups: rows.map((row) => ({
        key: row._id,
        products: row.products,
        units: row.units,
        cost_value: round(row.cost_value),
        retail_value: round(row.retail_value),
        potential_profit: round(row.retail_value - row.cost_value),
        average_margin_percentage: row.average_margin ? round(row.average_margin) : null,
      })),
    };
  },

  /**
   * Most profitable products.
   * `by=total` ranks by profit actually on the shelf (unit margin × quantity);
   * `by=unit` ranks by margin per unit regardless of stock.
   */
  async topProfitable({ limit = 20, by = 'total', minMargin } = {}) {
    const sortKey = by === 'unit' ? 'unit_profit' : 'total_profit';

    return productRepository.aggregate([
      {
        $match: {
          ...ACTIVE,
          'pricing.normalized.rdp': { $gt: 0 },
          'pricing.normalized.selling_price': { $gt: 0 },
          ...(minMargin !== undefined ? { 'pricing.margin_percentage': { $gte: minMargin } } : {}),
        },
      },
      {
        $addFields: {
          unit_profit: {
            $subtract: [money('$pricing.normalized.selling_price'), money('$pricing.normalized.rdp')],
          },
        },
      },
      {
        $addFields: {
          total_profit: { $multiply: ['$unit_profit', money('$inventory.quantity')] },
        },
      },
      { $sort: { [sortKey]: -1 } },
      { $limit: limit },
      {
        $project: {
          name: 1,
          sku: 1,
          brand: 1,
          category: 1,
          quantity: '$inventory.quantity',
          supplier: '$inventory.supplier',
          currency: '$pricing.currency',
          rdp: '$pricing.rdp',
          selling_price: '$pricing.selling_price',
          margin_percentage: '$pricing.margin_percentage',
          gross_margin_percentage: '$pricing.gross_margin_percentage',
          margin_band: '$pricing.margin_band',
          unit_profit: { $round: ['$unit_profit', 2] },
          total_profit: { $round: ['$total_profit', 2] },
          quality: '$metadata.data_quality_score',
        },
      },
    ]);
  },

  /** Margin distribution across the configured policy bands. */
  async marginBands() {
    const rows = await productRepository.aggregate([
      { $match: { ...ACTIVE, 'pricing.margin_percentage': { $ne: null } } },
      {
        $group: {
          _id: '$pricing.margin_band',
          products: { $sum: 1 },
          average_margin: { $avg: '$pricing.margin_percentage' },
          exposure: {
            $sum: { $multiply: [money('$pricing.normalized.rdp'), money('$inventory.quantity')] },
          },
        },
      },
      { $sort: { average_margin: 1 } },
    ]);

    return {
      currency: env.baseCurrency,
      thresholds: env.margin,
      bands: rows.map((row) => ({
        band: row._id ?? 'unknown',
        products: row.products,
        average_margin_percentage: row.average_margin ? round(row.average_margin) : null,
        capital_at_risk: round(row.exposure),
      })),
    };
  },

  /** Products trading below the warning threshold, ranked by capital exposed. */
  async lowMarginAlerts({ threshold = env.margin.warnPct, limit = 25 } = {}) {
    const rows = await productRepository.aggregate([
      {
        $match: {
          ...ACTIVE,
          'pricing.margin_percentage': { $ne: null, $lt: threshold },
        },
      },
      {
        $addFields: {
          exposure: {
            $multiply: [money('$pricing.normalized.rdp'), money('$inventory.quantity')],
          },
        },
      },
      { $sort: { exposure: -1, 'pricing.margin_percentage': 1 } },
      { $limit: limit },
      {
        $project: {
          name: 1,
          sku: 1,
          brand: 1,
          category: 1,
          supplier: '$inventory.supplier',
          quantity: '$inventory.quantity',
          currency: '$pricing.currency',
          rdp: '$pricing.rdp',
          selling_price: '$pricing.selling_price',
          margin_percentage: '$pricing.margin_percentage',
          margin_band: '$pricing.margin_band',
          exposure: { $round: ['$exposure', 2] },
        },
      },
    ]);

    return { threshold_percentage: threshold, currency: env.baseCurrency, products: rows };
  },

  /** Per-supplier roll-up — ByteHub buys from two suppliers on different terms. */
  async supplierBreakdown() {
    const rows = await productRepository.aggregate([
      { $match: ACTIVE },
      {
        $group: {
          _id: { $ifNull: ['$inventory.supplier', '(unknown)'] },
          products: { $sum: 1 },
          units: { $sum: money('$inventory.quantity') },
          spend: {
            $sum: { $multiply: [money('$pricing.normalized.rdp'), money('$inventory.quantity')] },
          },
          average_margin: { $avg: '$pricing.margin_percentage' },
          average_quality: { $avg: '$metadata.data_quality_score' },
          must_buy: { $sum: { $cond: [{ $eq: ['$status.procurement', 'must_buy'] }, 1, 0] } },
          avoid: { $sum: { $cond: [{ $eq: ['$status.procurement', 'avoid'] }, 1, 0] } },
        },
      },
      { $sort: { spend: -1 } },
    ]);

    return {
      currency: env.baseCurrency,
      suppliers: rows.map((row) => ({
        supplier: row._id,
        products: row.products,
        units: row.units,
        planned_spend: round(row.spend),
        average_margin_percentage: row.average_margin ? round(row.average_margin) : null,
        average_quality_score: row.average_quality ? round(row.average_quality, 1) : null,
        must_buy: row.must_buy,
        avoid: row.avoid,
      })),
    };
  },

  /**
   * Procurement basket totals — the figure ByteHub's own plan got wrong by ~3x
   * because it did not re-multiply quantity by the verified cost.
   */
  async procurementBaskets() {
    const rows = await productRepository.aggregate([
      {
        $group: {
          _id: '$status.procurement',
          products: { $sum: 1 },
          units: { $sum: money('$inventory.quantity') },
          basket_cost: {
            $sum: { $multiply: [money('$pricing.normalized.rdp'), money('$inventory.quantity')] },
          },
          basket_retail: {
            $sum: {
              $multiply: [money('$pricing.normalized.selling_price'), money('$inventory.quantity')],
            },
          },
          average_margin: { $avg: '$pricing.margin_percentage' },
        },
      },
      { $sort: { basket_cost: -1 } },
    ]);

    const baskets = rows.map((row) => ({
      basket: row._id ?? 'unclassified',
      products: row.products,
      units: row.units,
      basket_cost: round(row.basket_cost),
      basket_retail: round(row.basket_retail),
      expected_profit: round(row.basket_retail - row.basket_cost),
      average_margin_percentage: row.average_margin ? round(row.average_margin) : null,
    }));

    const committed = baskets.filter((basket) => ['must_buy', 'test_buy'].includes(basket.basket));

    return {
      currency: env.baseCurrency,
      baskets,
      committed_total: {
        products: committed.reduce((sum, basket) => sum + basket.products, 0),
        basket_cost: round(committed.reduce((sum, basket) => sum + basket.basket_cost, 0)),
        expected_profit: round(committed.reduce((sum, basket) => sum + basket.expected_profit, 0)),
      },
    };
  },

  /** Everything the dashboard needs in one round trip. */
  async dashboard() {
    const [summary, byCategory, topProducts, bands, alerts, suppliers, baskets] = await Promise.all([
      analyticsService.summary(),
      analyticsService.inventoryValue({ groupBy: 'category' }),
      analyticsService.topProfitable({ limit: 10 }),
      analyticsService.marginBands(),
      analyticsService.lowMarginAlerts({ limit: 10 }),
      analyticsService.supplierBreakdown(),
      analyticsService.procurementBaskets(),
    ]);

    return {
      summary,
      inventory_by_category: byCategory.groups,
      top_profitable: topProducts,
      margin_bands: bands.bands,
      low_margin_alerts: alerts.products,
      suppliers: suppliers.suppliers,
      procurement: baskets,
    };
  },
};

export default analyticsService;
