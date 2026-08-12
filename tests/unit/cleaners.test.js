import { describe, it, expect } from 'vitest';
import { normalizeSku, generateSku, isGeneratedSku } from '../../src/modules/catalog/cleaners/sku.cleaner.js';
import { normalizeBrand, inferBrandFromName } from '../../src/modules/catalog/cleaners/brand.normalizer.js';
import { normalizeCategory } from '../../src/modules/catalog/cleaners/category.normalizer.js';
import { detectGeneric, detectProcurementStatus } from '../../src/modules/catalog/cleaners/generic.detector.js';
import {
  extractWattage,
  extractBatteryCapacity,
  extractCableType,
  extractCapacity,
  extractLength,
  extractWarrantyMonths,
  extractCondition,
  extractInterface,
  splitFeatures,
  splitCompatibility,
} from '../../src/modules/catalog/cleaners/spec.extractor.js';

/* ------------------------------- SKUs -------------------------------- */

describe('normalizeSku', () => {
  it('passes a clean model code through unchanged', () => {
    expect(normalizeSku('JR-TCG13').sku).toBe('JR-TCG13');
  });

  it('keeps a meaningful suffix — JR-QP192 Mini is its own product', () => {
    expect(normalizeSku('JR-QP192 Mini').sku).toBe('JR-QP192 Mini');
  });

  it('applies an inline correction and remembers the wrong code', () => {
    // The real catalog writes the fix directly in the cell.
    const result = normalizeSku('JR-PK1 → JR-PR1');
    expect(result.sku).toBe('JR-PR1');
    expect(result.corrected_from).toBe('JR-PK1');
  });

  it('prefers a bracketed model code over marketing text', () => {
    expect(normalizeSku('Glow Mini (A3136)').sku).toBe('A3136');
    expect(normalizeSku('Robovac G50 Hybrid (T2212)').sku).toBe('T2212');
    expect(normalizeSku('SmartTrack Card, Android (T87B5011)').sku).toBe('T87B5011');
  });

  it('extracts a code out of a prose cell', () => {
    expect(normalizeSku('A3969 · RDP 880 / RRP 1,099').sku).toBe('A3969');
  });

  it('flags a model-family cell as ambiguous', () => {
    const result = normalizeSku('iP Series (model varies per phone, e.g. JR-PF843)');
    expect(result.is_ambiguous).toBe(true);
  });

  it.each(['', '-', '—', 'n/a', 'unassigned', '— (unassigned)', 'TBD'])(
    'treats %s as no SKU',
    (input) => {
      expect(normalizeSku(input).sku).toBeNull();
    },
  );

  it('returns no SKU when the prose contains no model code', () => {
    expect(normalizeSku('No verified EGP source yet').sku).toBeNull();
    expect(normalizeSku('USD $5-15 est., unverified EGP').sku).toBeNull();
  });
});

describe('generateSku', () => {
  const input = { name: 'HDMI Cable 1m', brand: 'Generic', category: 'Cables' };

  it('is deterministic for the same product', () => {
    expect(generateSku(input)).toBe(generateSku(input));
  });

  it('differs for different products', () => {
    expect(generateSku(input)).not.toBe(generateSku({ ...input, name: 'VGA Cable 1.5m' }));
  });

  it('encodes category and brand so the SKU is readable', () => {
    expect(generateSku(input)).toMatch(/^BH-CBL-GEN-[0-9A-F]{6}$/);
  });

  it('is recognisable as generated', () => {
    expect(isGeneratedSku(generateSku(input))).toBe(true);
    expect(isGeneratedSku('JR-TCG13')).toBe(false);
  });

  it('depends only on product identity, not on where the row was read', () => {
    // Two sheets listing the same draft product must produce one SKU, or the
    // rows will not deduplicate.
    expect(generateSku({ ...input, sheet: 'Sheet A', row: 4 })).toBe(
      generateSku({ ...input, sheet: 'Sheet B', row: 19 }),
    );
  });

  it('distinguishes capacity variants of one product', () => {
    expect(generateSku({ ...input, capacity: '64GB' })).not.toBe(
      generateSku({ ...input, capacity: '128GB' }),
    );
  });
});

/* ------------------------------ brands ------------------------------- */

describe('normalizeBrand', () => {
  it.each([
    ['Soundcore by Anker', 'Soundcore'],
    ['Anker/Soundcore', 'Soundcore'],
    ['anker', 'Anker'],
    ['Anker (eufy line)', 'eufy'],
    ['JOYROOM', 'Joyroom'],
    ['WD', 'Western Digital'],
  ])('canonicalises %s to %s', (input, expected) => {
    expect(normalizeBrand(input).brand).toBe(expected);
  });

  it('flags placeholder brands as generic', () => {
    expect(normalizeBrand('Generic')).toMatchObject({ brand: 'Generic', is_generic: true });
    expect(normalizeBrand('Mixed').is_generic).toBe(true);
  });

  it('flags a multi-brand cell without discarding it', () => {
    const result = normalizeBrand('Dell / HP');
    expect(result.is_multi).toBe(true);
    expect(result.all).toEqual(['Dell', 'HP']);
  });

  it('records the parent manufacturer for sub-brands', () => {
    expect(normalizeBrand('Soundcore').parent).toBe('Anker');
    expect(normalizeBrand('Joyroom').parent).toBeNull();
  });

  it('keeps an unknown brand rather than dropping it', () => {
    expect(normalizeBrand('Acme Cables').brand).toBe('Acme Cables');
  });

  it('handles null', () => {
    expect(normalizeBrand(null).brand).toBeNull();
  });
});

describe('inferBrandFromName', () => {
  it('finds a brand inside the product name when there is no brand column', () => {
    expect(inferBrandFromName('Anker Soundcore R50i (ERBD-ANKR-R50I)')).toBe('Soundcore');
    expect(inferBrandFromName('Kingston DataTraveler Exodia')).toBe('Kingston');
  });

  it('returns null when no known brand appears', () => {
    expect(inferBrandFromName('HDMI Cable 1m – Standard')).toBeNull();
  });
});

/* ---------------------------- categories ----------------------------- */

describe('normalizeCategory', () => {
  it.each([
    ['شواحن', 'Chargers'],
    ['كابلات', 'Cables'],
    ['باور بانك', 'Power Banks'],
    ['سماعات', 'Audio'],
    ['إكسسوارات', 'Accessories'],
  ])('maps the Arabic category %s to %s', (input, expected) => {
    expect(normalizeCategory(input, '').category).toBe(expected);
  });

  it.each([
    ['Earbuds / Audio', 'Audio'],
    ['Earbuds / Audio (Premium)', 'Audio'],
    ['USB Flash Drives', 'Storage'],
    ['Internal SSD', 'Storage'],
    ['RAM / Memory', 'Memory'],
    ['Display Cable', 'Cables'],
    ['Wi-Fi USB Adapter', 'Networking'],
  ])('collapses the English variant %s to %s', (input, expected) => {
    expect(normalizeCategory(input, '').category).toBe(expected);
  });

  it('resolves a subcategory', () => {
    expect(normalizeCategory('Display Cable', 'HDMI Cable 1m')).toMatchObject({
      category: 'Cables',
      subcategory: 'Display Cables',
    });
  });

  it('prefers Mouse Pads over Mice for "Gaming mouse pads"', () => {
    // "mouse pad" contains "mouse"; order in the taxonomy decides.
    expect(normalizeCategory('Mouse Pads / Accessories', 'Gaming mouse pads').subcategory).toBe('Mouse Pads');
  });

  it('classifies from the product name when there is no category cell', () => {
    const result = normalizeCategory(null, 'Anker PowerPort III 65W GaN Charger');
    expect(result.category).toBe('Chargers');
    expect(result.matched).toBe(true);
  });

  it('weights the category cell above the name', () => {
    // The name mentions a cable, but the row is filed under chargers.
    expect(normalizeCategory('شواحن', 'شاحن 20W PD + كابل').category).toBe('Chargers');
  });

  it('keeps an unrecognised category verbatim and flags it', () => {
    // Was 'Joyroom stylus pen' until the taxonomy learned 'stylus'. The
    // behaviour under test is the unmatched fallback, not that particular
    // string, so it needs a category the taxonomy genuinely has no term for.
    const result = normalizeCategory('Office furniture', 'Swivel chair');
    expect(result.category).toBe('Office furniture');
    expect(result.matched).toBe(false);
  });

  it('maps the category cells that used to fall through', () => {
    // Both of these reached the storefront as categories of their own, because
    // the cell held a product description rather than a category.
    expect(normalizeCategory('Joyroom stylus pen', 'Stylus').category).toBe('Accessories');
    expect(normalizeCategory('Joyroom wired earphones', 'EC05 half in-ear').category).toBe('Audio');
  });

  it('reads ANC as a feature, not as a form factor', () => {
    // 'anc' appears on earbuds and over-ear headphones alike, so it must not
    // outrank an explicit 'over-ear'.
    expect(normalizeCategory('Audio', 'Q20i ANC over-ear (A3004)').subcategory).toBe('Headphones');
    expect(normalizeCategory('Audio', 'R50i NC (A3959, ANC)').subcategory).toBe(
      'True Wireless Earbuds',
    );
  });

  it('returns nulls for an empty input', () => {
    expect(normalizeCategory(null, null)).toMatchObject({ category: null, matched: false });
  });
});

/* ------------------------ generic / draft ---------------------------- */

describe('detectGeneric', () => {
  it('flags an ALL-CAPS folder-style label', () => {
    expect(detectGeneric({ name: 'GENERAL CABLE TYPE C TO TYPE C' }).is_generic).toBe(true);
  });

  it('does not flag an Arabic name containing a Latin acronym', () => {
    // Arabic is caseless, so "سماعات TWS" looked ALL-CAPS to a naive test.
    expect(detectGeneric({ name: 'سماعات TWS', sku: 'JR-T03S' }).is_generic).toBe(false);
    expect(detectGeneric({ name: 'سماعات ANC TWS', sku: 'JR-FN3' }).is_generic).toBe(false);
  });

  it('does not flag a real product name', () => {
    expect(detectGeneric({ name: 'Anker Wall Charger 25W Compact', sku: 'A2149' }).is_generic).toBe(false);
  });

  it('flags a generic brand', () => {
    expect(detectGeneric({ name: 'SATA Data Cable', brand: 'Generic' }).is_generic).toBe(true);
  });

  it('detects an Arabic draft marker', () => {
    expect(detectGeneric({ name: 'قرص SSD بمنفذ SATA (مسودة)' }).is_draft).toBe(true);
  });

  it('detects an English draft marker', () => {
    expect(detectGeneric({ name: 'SSD drive', notes: 'coming_soon' }).is_draft).toBe(true);
  });
});

describe('detectProcurementStatus', () => {
  it.each([
    ['APPROVE — Must Buy, matches source exactly', 'must_buy'],
    ['HOLD — below 35% bar, re-check street price', 'test_buy'],
    ['AVOID — priced above market', 'avoid'],
    ['DROP unless a refurb line is a priority', 'avoid'],
  ])('reads %s as %s', (input, expected) => {
    expect(detectProcurementStatus(input)).toBe(expected);
  });

  it('is null for text carrying no verdict', () => {
    expect(detectProcurementStatus('Matches Joyroom list exactly.')).toBeNull();
  });
});

/* ------------------------------ specs -------------------------------- */

describe('spec extraction', () => {
  it.each([
    ['شاحن 45W GaN', 45],
    ['735 PowerPort III, 3-Port 65W POD', 65],
    ['20W PD + كابل', 20],
    ['22.5W power bank', 22.5],
  ])('reads the wattage out of %s', (input, expected) => {
    expect(extractWattage(input)).toBe(expected);
  });

  it('does not invent a wattage', () => {
    expect(extractWattage('USB 3.2 Gen 1 flash drive')).toBeNull();
  });

  it('reads an explicit mAh capacity', () => {
    expect(extractBatteryCapacity('10,000mAh battery')).toBe(10_000);
  });

  it('expands the K shorthand only for power banks', () => {
    expect(extractBatteryCapacity('باور بانك 20K 22.5W', { isPowerBank: true })).toBe(20_000);
    expect(extractBatteryCapacity('Cable 3-in-1 20K', { isPowerBank: false })).toBeNull();
  });

  it.each([
    ['Anker Cable 322 USB-A to USB-C 3ft', 'USB-A to USB-C'],
    ['كابل PowerLine III C-C', 'USB-C to USB-C'],
    ['Crystal-Clear C-L cable', 'USB-C to Lightning'],
    ['HDMI 2.0 Cable 4K', 'HDMI'],
    ['VGA Monitor Cable', 'VGA'],
  ])('reads the cable type of %s', (input, expected) => {
    expect(extractCableType(input)).toBe(expected);
  });

  it('reads capacity and converts to GB', () => {
    expect(extractCapacity('128GB')).toMatchObject({ capacity: '128GB', capacity_gb: 128 });
    expect(extractCapacity('1TB drive')).toMatchObject({ capacity: '1TB', capacity_gb: 1024 });
  });

  it('reads cable length and normalises to metres', () => {
    expect(extractLength('DisplayPort Cable 1.5m')).toBe(1.5);
    expect(extractLength('USB-A to USB-C 3ft')).toBeCloseTo(0.914, 2);
  });

  it('does not read "10,000mAh" as a length in metres', () => {
    expect(extractLength('10,000mAh power bank')).toBeNull();
  });

  it('normalises warranty to months', () => {
    expect(extractWarrantyMonths('5-Year Warranty')).toBe(60);
    expect(extractWarrantyMonths('18 months')).toBe(18);
    expect(extractWarrantyMonths('3')).toBe(36);
    expect(extractWarrantyMonths('no warranty')).toBeNull();
  });

  it.each([
    ['New', 'new'],
    ['Used – Original Pull', 'original_pull'],
    ['Original Used', 'original_pull'],
    ['Refurbished', 'refurbished'],
    ['Used', 'used'],
  ])('reads the condition %s', (input, expected) => {
    expect(extractCondition(input)).toBe(expected);
  });

  it('reads an interface', () => {
    expect(extractInterface('USB 3.2 Gen 1 | Up to 400MB/s')).toBe('USB 3.2 GEN 1');
    expect(extractInterface('SATA III (6 Gb/s)')).toBe('SATA III');
  });

  it('splits pipe-separated feature lists', () => {
    const features = splitFeatures('BassUp 10mm driver | 10H/30H battery | IPX5 | Bluetooth 5.3');
    expect(features).toEqual(['BassUp 10mm driver', '10H/30H battery', 'IPX5', 'Bluetooth 5.3']);
  });

  it('splits comma-separated compatibility lists', () => {
    expect(splitCompatibility('PCs, Laptops, Gaming Monitors')).toEqual([
      'PCs', 'Laptops', 'Gaming Monitors',
    ]);
  });

  it('returns empty arrays for empty input', () => {
    expect(splitFeatures(null)).toEqual([]);
    expect(splitCompatibility('')).toEqual([]);
  });
});
