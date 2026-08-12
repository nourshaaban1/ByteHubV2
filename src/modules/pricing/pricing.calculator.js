import env from '../../config/env.js';
import { round, convert, rateFor } from '../../shared/utils/money.js';

/** Anything above this is almost certainly a unit or currency mistake. */
export const IMPLAUSIBLE_MARGIN_PCT = 900;

const isPositive = (value) => Number.isFinite(value) && value > 0;

/**
 * Margin on cost — the definition in the ByteHub brief:
 *   margin = (selling_price - rdp) / rdp
 * Returned as a percentage.
 */
export function marginOnCost(rdp, sellingPrice) {
  if (!isPositive(rdp) || !Number.isFinite(sellingPrice)) return null;
  return round(((sellingPrice - rdp) / rdp) * 100);
}

/**
 * Margin on revenue — the convention the ByteHub procurement workbooks use:
 *   gross margin = (selling_price - rdp) / selling_price
 * Both are reported because the two answer different questions and the
 * source spreadsheets quote the revenue-basis figure.
 */
export function marginOnRevenue(rdp, sellingPrice) {
  if (!Number.isFinite(rdp) || !isPositive(sellingPrice)) return null;
  return round(((sellingPrice - rdp) / sellingPrice) * 100);
}

export function marginValue(rdp, sellingPrice) {
  if (!Number.isFinite(rdp) || !Number.isFinite(sellingPrice)) return null;
  return round(sellingPrice - rdp);
}

/**
 * Classifies a cost-basis margin against the configured policy thresholds.
 * Bands: loss < 0 <= critical < warn <= low < target <= healthy/target.
 */
export function classifyMargin(marginPct, thresholds = env.margin) {
  if (marginPct === null || marginPct === undefined || !Number.isFinite(marginPct)) return 'unknown';
  if (marginPct > IMPLAUSIBLE_MARGIN_PCT) return 'implausible';
  if (marginPct < 0) return 'loss';
  if (marginPct < thresholds.criticalPct) return 'critical';
  if (marginPct < thresholds.warnPct) return 'low';
  if (marginPct < thresholds.targetPct) return 'healthy';
  return 'target';
}

/**
 * Solves for the selling price that achieves a target cost-basis margin.
 *   selling = rdp * (1 + target/100)
 */
export function priceForTargetMargin(rdp, targetMarginPct = env.margin.targetPct) {
  if (!isPositive(rdp) || !Number.isFinite(targetMarginPct)) return null;
  return round(rdp * (1 + targetMarginPct / 100));
}

/** Break-even selling price (equals cost). Anything below loses money. */
export function breakEvenPrice(rdp) {
  return isPositive(rdp) ? round(rdp) : null;
}

/**
 * Full pricing computation for one product.
 * Pure: takes and returns plain objects, touches no database.
 *
 * @param {object} pricing  Partial pricing block ({ currency, rdp, rrp, selling_price, market_low, market_high }).
 * @returns {{ pricing: object, alerts: Array<{code:string, severity:string, message:string, field?:string, context?:object}> }}
 */
export function computePricing(pricing = {}, options = {}) {
  const thresholds = options.thresholds ?? env.margin;
  const baseCurrency = options.baseCurrency ?? env.baseCurrency;

  const currency = pricing.currency ? String(pricing.currency).toUpperCase() : null;
  const rdp = Number.isFinite(pricing.rdp) ? pricing.rdp : null;
  const rrp = Number.isFinite(pricing.rrp) ? pricing.rrp : null;

  // Selling price defaults to RRP: that is what ByteHub actually lists at
  // until someone sets a deliberate price.
  const sellingPrice = Number.isFinite(pricing.selling_price) ? pricing.selling_price : rrp;

  const marginPct = marginOnCost(rdp, sellingPrice);
  const grossPct = marginOnRevenue(rdp, sellingPrice);
  const band = classifyMargin(marginPct, thresholds);

  const fx = currency ? rateFor(currency) : null;

  const computed = {
    ...pricing,
    currency,
    rdp,
    rrp,
    selling_price: sellingPrice ?? null,
    margin_percentage: marginPct,
    gross_margin_percentage: grossPct,
    margin_value: marginValue(rdp, sellingPrice),
    margin_band: band,
    normalized: {
      currency: baseCurrency,
      rdp: convert(rdp, currency, baseCurrency),
      rrp: convert(rrp, currency, baseCurrency),
      selling_price: convert(sellingPrice, currency, baseCurrency),
      fx_rate: fx,
      fx_rate_at: fx ? new Date() : null,
    },
  };

  return { pricing: computed, alerts: detectPricingAlerts(computed, thresholds) };
}

/**
 * Pricing-only issue detection: loss making, thin margins, impossible numbers,
 * and market prices that sit below cost (a real defect in ByteHub's plan —
 * Anker A2667 was budgeted to sell for less than it costs).
 */
export function detectPricingAlerts(pricing = {}, thresholds = env.margin) {
  const alerts = [];
  const push = (code, field, context) => alerts.push({ code, field, context });

  const { rdp, rrp, selling_price: selling, currency, margin_percentage: margin } = pricing;

  if (rdp !== null && rdp !== undefined && rdp < 0) push('NEGATIVE_PRICE', 'pricing.rdp', { rdp });
  if (selling !== null && selling !== undefined && selling < 0) {
    push('NEGATIVE_PRICE', 'pricing.selling_price', { selling });
  }

  if (!Number.isFinite(rdp) || rdp === 0) push('MISSING_COST', 'pricing.rdp');
  if (!Number.isFinite(selling) || selling === 0) push('MISSING_SELLING_PRICE', 'pricing.selling_price');
  if (!currency && (Number.isFinite(rdp) || Number.isFinite(selling))) {
    push('MISSING_CURRENCY', 'pricing.currency');
  }

  if (Number.isFinite(rdp) && Number.isFinite(rrp) && rrp > 0 && rrp < rdp) {
    push('RRP_BELOW_COST', 'pricing.rrp', { rdp, rrp });
  }

  if (Number.isFinite(rdp) && Number.isFinite(selling) && selling > 0 && selling < rdp) {
    push('SELLING_BELOW_COST', 'pricing.selling_price', {
      rdp,
      selling_price: selling,
      loss_per_unit: round(rdp - selling),
    });
  }

  if (Number.isFinite(rdp) && Number.isFinite(pricing.market_high) && pricing.market_high < rdp) {
    push('MARKET_BELOW_COST', 'pricing.market_high', {
      rdp,
      market_high: pricing.market_high,
    });
  }

  if (Number.isFinite(margin)) {
    if (margin > IMPLAUSIBLE_MARGIN_PCT) {
      push('IMPLAUSIBLE_MARGIN', 'pricing.margin_percentage', { margin_percentage: margin });
    } else if (margin >= 0 && margin < thresholds.criticalPct) {
      push('CRITICAL_MARGIN', 'pricing.margin_percentage', {
        margin_percentage: margin,
        threshold: thresholds.criticalPct,
      });
    } else if (margin >= 0 && margin < thresholds.warnPct) {
      push('LOW_MARGIN', 'pricing.margin_percentage', {
        margin_percentage: margin,
        threshold: thresholds.warnPct,
      });
    }
  }

  if (pricing.is_estimated) push('ESTIMATED_PRICE', 'pricing');

  return alerts;
}

export default {
  marginOnCost,
  marginOnRevenue,
  marginValue,
  classifyMargin,
  priceForTargetMargin,
  breakEvenPrice,
  computePricing,
  detectPricingAlerts,
  IMPLAUSIBLE_MARGIN_PCT,
};
