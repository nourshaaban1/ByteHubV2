import { describe, it, expect } from 'vitest';
import {
  marginOnCost,
  marginOnRevenue,
  marginValue,
  classifyMargin,
  priceForTargetMargin,
  breakEvenPrice,
  computePricing,
  detectPricingAlerts,
} from '../../src/modules/pricing/pricing.calculator.js';

const codesOf = (alerts) => alerts.map((alert) => alert.code);

describe('marginOnCost — the brief\'s definition: (selling - rdp) / rdp', () => {
  it('computes a straightforward markup', () => {
    expect(marginOnCost(100, 150)).toBe(50);
  });

  it('matches the Joyroom JR-TCG13 figures from the real catalog', () => {
    // RDP 440, RRP 750 -> 70.45% on cost (the workbook quotes 41.3% on revenue)
    expect(marginOnCost(440, 750)).toBe(70.45);
    expect(marginOnRevenue(440, 750)).toBe(41.33);
  });

  it('returns a negative margin when selling below cost', () => {
    expect(marginOnCost(1665, 1400)).toBe(-15.92);
  });

  it('is null when cost is missing, zero or negative — never Infinity', () => {
    expect(marginOnCost(null, 150)).toBeNull();
    expect(marginOnCost(0, 150)).toBeNull();
    expect(marginOnCost(-10, 150)).toBeNull();
    expect(marginOnCost(undefined, 150)).toBeNull();
  });

  it('is null when the selling price is missing', () => {
    expect(marginOnCost(100, null)).toBeNull();
    expect(marginOnCost(100, undefined)).toBeNull();
  });

  it('is zero, not null, when price equals cost', () => {
    expect(marginOnCost(100, 100)).toBe(0);
  });
});

describe('marginOnRevenue', () => {
  it('computes the retail convention', () => {
    expect(marginOnRevenue(100, 200)).toBe(50);
  });

  it('is null when the selling price is zero — division by zero is not 0%', () => {
    expect(marginOnRevenue(100, 0)).toBeNull();
  });

  it('reproduces the Anker A2667 margin the workbook flags as critical', () => {
    expect(marginOnRevenue(1665, 1995)).toBe(16.54);
  });
});

describe('marginValue', () => {
  it('returns absolute profit per unit', () => {
    expect(marginValue(440, 750)).toBe(310);
  });

  it('goes negative on a loss', () => {
    expect(marginValue(1665, 1400)).toBe(-265);
  });
});

describe('classifyMargin', () => {
  const thresholds = { criticalPct: 10, warnPct: 25, targetPct: 54 };

  it.each([
    [-5, 'loss'],
    [0, 'critical'],
    [9.9, 'critical'],
    [10, 'low'],
    [24.9, 'low'],
    [25, 'healthy'],
    [53.9, 'healthy'],
    [54, 'target'],
    [200, 'target'],
    [1000, 'implausible'],
  ])('classifies %s%% as %s', (margin, expected) => {
    expect(classifyMargin(margin, thresholds)).toBe(expected);
  });

  it('is "unknown" rather than a guess when the margin is unavailable', () => {
    expect(classifyMargin(null, thresholds)).toBe('unknown');
    expect(classifyMargin(undefined, thresholds)).toBe('unknown');
    expect(classifyMargin(Number.NaN, thresholds)).toBe('unknown');
  });
});

describe('priceForTargetMargin / breakEvenPrice', () => {
  it('solves for the price achieving a target margin', () => {
    expect(priceForTargetMargin(100, 54)).toBe(154);
    expect(marginOnCost(100, priceForTargetMargin(100, 54))).toBe(54);
  });

  it('round-trips at an arbitrary target', () => {
    const price = priceForTargetMargin(437.5, 33);
    expect(marginOnCost(437.5, price)).toBeCloseTo(33, 1);
  });

  it('break-even equals cost', () => {
    expect(breakEvenPrice(440)).toBe(440);
    expect(breakEvenPrice(null)).toBeNull();
    expect(breakEvenPrice(0)).toBeNull();
  });
});

describe('computePricing', () => {
  it('falls back to RRP when no selling price is set', () => {
    const { pricing } = computePricing({ currency: 'EGP', rdp: 440, rrp: 750 });
    expect(pricing.selling_price).toBe(750);
    expect(pricing.margin_percentage).toBe(70.45);
  });

  it('prefers an explicit selling price over RRP', () => {
    const { pricing } = computePricing({ currency: 'EGP', rdp: 440, rrp: 750, selling_price: 690 });
    expect(pricing.selling_price).toBe(690);
    expect(pricing.margin_percentage).toBe(56.82);
  });

  it('normalises USD into the EGP reporting currency', () => {
    const { pricing } = computePricing({ currency: 'USD', rdp: 10, rrp: 30 });
    expect(pricing.normalized.currency).toBe('EGP');
    expect(pricing.normalized.rdp).toBe(485);
    expect(pricing.normalized.selling_price).toBe(1455);
    expect(pricing.normalized.fx_rate).toBe(48.5);
  });

  it('leaves EGP untouched at a rate of 1', () => {
    const { pricing } = computePricing({ currency: 'EGP', rdp: 440, rrp: 750 });
    expect(pricing.normalized.rdp).toBe(440);
    expect(pricing.normalized.fx_rate).toBe(1);
  });

  it('does not invent normalised values when the currency is unknown', () => {
    const { pricing } = computePricing({ currency: null, rdp: 440, rrp: 750 });
    expect(pricing.normalized.rdp).toBeNull();
    expect(pricing.margin_percentage).toBe(70.45); // margin is currency-agnostic
  });

  it('handles a completely empty pricing block without throwing', () => {
    const { pricing, alerts } = computePricing({});
    expect(pricing.margin_percentage).toBeNull();
    expect(pricing.margin_band).toBe('unknown');
    expect(codesOf(alerts)).toContain('MISSING_COST');
    expect(codesOf(alerts)).toContain('MISSING_SELLING_PRICE');
  });
});

describe('detectPricingAlerts', () => {
  it('flags a product sold below cost, with the loss per unit', () => {
    const alerts = detectPricingAlerts({ rdp: 1665, selling_price: 1400, currency: 'EGP', margin_percentage: -15.92 });
    const loss = alerts.find((alert) => alert.code === 'SELLING_BELOW_COST');
    expect(loss).toBeDefined();
    expect(loss.context.loss_per_unit).toBe(265);
  });

  it('flags the real Anker A2667 defect: market price below wholesale cost', () => {
    const alerts = detectPricingAlerts({
      rdp: 1665,
      rrp: 1995,
      selling_price: 1995,
      market_low: 1000,
      market_high: 1400,
      currency: 'EGP',
      margin_percentage: 19.82,
    });
    expect(codesOf(alerts)).toContain('MARKET_BELOW_COST');
    expect(codesOf(alerts)).toContain('LOW_MARGIN');
  });

  it('flags RRP below RDP', () => {
    const alerts = detectPricingAlerts({ rdp: 500, rrp: 400, selling_price: 400, currency: 'EGP' });
    expect(codesOf(alerts)).toContain('RRP_BELOW_COST');
  });

  it('flags an implausible margin as a data error rather than a win', () => {
    const alerts = detectPricingAlerts({ rdp: 1, selling_price: 5000, currency: 'EGP', margin_percentage: 499_900 });
    expect(codesOf(alerts)).toContain('IMPLAUSIBLE_MARGIN');
    expect(codesOf(alerts)).not.toContain('LOW_MARGIN');
  });

  it('flags a missing currency only when there is a price to interpret', () => {
    expect(codesOf(detectPricingAlerts({ rdp: 100, selling_price: 200 }))).toContain('MISSING_CURRENCY');
    expect(codesOf(detectPricingAlerts({}))).not.toContain('MISSING_CURRENCY');
  });

  it('flags negative prices', () => {
    expect(codesOf(detectPricingAlerts({ rdp: -5, selling_price: 10 }))).toContain('NEGATIVE_PRICE');
  });

  it('raises no margin alert for a healthy product', () => {
    const alerts = detectPricingAlerts({
      rdp: 120,
      rrp: 325,
      selling_price: 325,
      currency: 'EGP',
      margin_percentage: 170.83,
    });
    expect(codesOf(alerts)).toEqual([]);
  });
});
