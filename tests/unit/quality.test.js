import { describe, it, expect } from 'vitest';
import { scoreProduct, computeCompleteness, computePenalties, gradeFor } from '../../src/modules/quality/quality.scorer.js';
import { validateProduct } from '../../src/modules/quality/quality.validator.js';
import { ISSUES } from '../../src/shared/constants/issues.js';

const completeProduct = () => ({
  name: 'شاحن 45W GaN',
  brand: 'Joyroom',
  sku: 'JR-TCG13',
  category: 'Chargers',
  description: { short: 'A 45W GaN wall charger', long: null },
  pricing: {
    currency: 'EGP',
    rdp: 440,
    rrp: 750,
    selling_price: 750,
    market_low: 550,
    market_high: 720,
    margin_percentage: 70.45,
  },
  specs: { power_wattage: 45, condition: 'new', compatibility: [], features: [], attributes: {} },
  inventory: { quantity: 30, supplier: 'Joyroom' },
  status: { is_active: true, is_verified: false, is_generic: false, is_draft: false },
  images: [{ path: 'Catalog/Charger/x.jpg', is_primary: true }],
  metadata: {},
});

const codes = (issues) => issues.map((issue) => issue.code);

describe('computeCompleteness', () => {
  it('scores a fully populated product at 100', () => {
    expect(computeCompleteness(completeProduct()).score).toBe(100);
  });

  it('scores an empty product at 0', () => {
    expect(computeCompleteness({}).score).toBe(0);
  });

  it('reports which fields are missing, by group', () => {
    const product = completeProduct();
    product.pricing.rdp = null;
    product.images = [];

    const result = computeCompleteness(product);
    expect(result.groups.pricing.missing).toContain('rdp');
    expect(result.groups.media.missing).toContain('images');
    expect(result.score).toBeLessThan(100);
  });

  it('does not credit a condition of "unknown"', () => {
    const product = completeProduct();
    product.specs.condition = 'unknown';
    expect(computeCompleteness(product).groups.specs.missing).toContain('condition');
  });

  it('counts free-form attributes as specs, so a new category needs no schema change', () => {
    const product = { specs: { attributes: { 'Noise Cancelling': 'Adaptive ANC 3.0' } } };
    expect(computeCompleteness(product).groups.specs.missing).not.toContain('any_spec');
  });
});

describe('computePenalties', () => {
  it('charges each issue code at most once', () => {
    const penalties = computePenalties([
      { code: 'DUPLICATE_PRODUCT', penalty: 15 },
      { code: 'DUPLICATE_PRODUCT', penalty: 15 },
    ]);
    expect(penalties.total).toBe(15);
  });

  it('falls back to the registry when an issue carries no penalty', () => {
    expect(computePenalties([{ code: 'GENERIC_ITEM' }]).total).toBe(ISSUES.GENERIC_ITEM.penalty);
  });

  it('charges nothing for a merely absent field', () => {
    // Absence is already priced into completeness; charging again would
    // double-count the same fact.
    expect(computePenalties([{ code: 'MISSING_IMAGES' }, { code: 'MISSING_SPECS' }]).total).toBe(0);
  });
});

describe('scoreProduct', () => {
  it('gives a clean, fully-specified product a top score', () => {
    const product = completeProduct();
    const result = scoreProduct(product, validateProduct(product));
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('penalises a loss-making product heavily', () => {
    const product = completeProduct();
    product.pricing.selling_price = 300; // below the 440 cost
    product.pricing.margin_percentage = -31.8;

    const result = scoreProduct(product, validateProduct(product));
    expect(result.score).toBeLessThan(80);
    expect(result.breakdown.blocking).toBe(true);
  });

  it('clamps to the 0-100 range', () => {
    const result = scoreProduct({}, [
      { code: 'MISSING_NAME', penalty: 25 },
      { code: 'DUPLICATE_SKU', penalty: 25 },
      { code: 'SELLING_BELOW_COST', penalty: 25 },
      { code: 'NEGATIVE_PRICE', penalty: 25 },
    ]);
    expect(result.score).toBe(0);
  });

  it('is never above 100', () => {
    expect(scoreProduct(completeProduct(), []).score).toBeLessThanOrEqual(100);
  });

  it.each([
    [95, 'A'], [90, 'A'], [80, 'B'], [75, 'B'], [65, 'C'], [45, 'D'], [10, 'F'],
  ])('grades %i as %s', (score, grade) => {
    expect(gradeFor(score)).toBe(grade);
  });
});

describe('validateProduct', () => {
  it('reports nothing for a clean product', () => {
    expect(validateProduct(completeProduct())).toEqual([]);
  });

  it('reports the absences of an empty product', () => {
    const found = codes(validateProduct({}));
    expect(found).toEqual(
      expect.arrayContaining([
        'MISSING_NAME', 'MISSING_BRAND', 'MISSING_CATEGORY', 'MISSING_SKU',
        'MISSING_COST', 'MISSING_SELLING_PRICE', 'MISSING_SPECS', 'MISSING_IMAGES',
      ]),
    );
  });

  it('flags a generated SKU without also claiming the SKU is missing', () => {
    const product = completeProduct();
    product.metadata.sku_generated = true;
    const found = codes(validateProduct(product));
    expect(found).toContain('GENERATED_SKU');
    expect(found).not.toContain('MISSING_SKU');
  });

  it('flags a price that was only ever supplied as a range', () => {
    const product = completeProduct();
    product.pricing.detail = { selling_price: { is_range: true, min: 25, max: 35 } };
    expect(codes(validateProduct(product))).toContain('PRICE_RANGE_ONLY');
  });

  it('surfaces a cost that disagrees with the verified supplier list', () => {
    const product = completeProduct();
    product.metadata.cost_mismatch = { reported: 280, verified: 460, delta: 180 };
    expect(codes(validateProduct(product))).toContain('COST_MISMATCH');
  });

  it('surfaces a corrected SKU', () => {
    const product = completeProduct();
    product.metadata.sku_corrected = 'JR-PK1';
    expect(codes(validateProduct(product))).toContain('SKU_CORRECTED');
  });

  it('records unmapped source columns rather than dropping them silently', () => {
    const product = completeProduct();
    product.metadata.unmapped_columns = ['Talking point'];
    expect(codes(validateProduct(product))).toContain('UNPARSED_COLUMNS');
  });

  it('never throws on malformed input', () => {
    expect(() => validateProduct(null)).not.toThrow();
    expect(() => validateProduct({ pricing: null, specs: null })).not.toThrow();
    expect(() => validateProduct({ pricing: { rdp: 'abc' } })).not.toThrow();
  });
});
