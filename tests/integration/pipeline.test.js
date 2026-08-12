/**
 * Runs the full parse pipeline against ByteHub's actual spreadsheets.
 *
 * These are the real files, with their real defects: Arabic names, mixed
 * currencies, price ranges, prose sheets, a wrong SKU, and three costs that
 * disagree with the supplier price lists. If the parser regresses, this is
 * where it shows up.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { readWorkbookFile } from '../../src/modules/catalog/parsers/workbookReader.js';
import { parseWorkbook, dedupeDrafts } from '../../src/modules/catalog/catalog.service.js';

const ROOT = process.cwd();
const FILES = {
  master: 'ByteHub_Master_Catalog.xlsx',
  merged: 'Merged_Catalog.xlsx',
  retail: 'product_catalog.xlsx',
  plan: 'ByteHub_Action_Plan.xlsx',
};

const available = Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => [key, fs.existsSync(path.join(ROOT, file))]),
);
const allPresent = Object.values(available).every(Boolean);

const parse = (file) => {
  const workbook = readWorkbookFile(path.join(ROOT, file));
  return parseWorkbook(workbook, { sourceCatalog: file });
};

const describeIf = allPresent ? describe : describe.skip;

describeIf('real catalog: ByteHub_Master_Catalog.xlsx', () => {
  let drafts;
  let report;
  let bySku;

  beforeAll(() => {
    const parsed = parse(FILES.master);
    report = parsed.report;
    // Deduplicate first, exactly as ingest() does. Within this one workbook two
    // sheets can resolve to the same SKU — the "Website Readiness" draft row
    // for a Joyroom wall charger names "JR-TCG13" in its recommended-fix text,
    // which is the same product the "Must Buy" sheet lists.
    ({ drafts } = dedupeDrafts(parsed.drafts));
    bySku = new Map(drafts.map((draft) => [draft.sku, draft]));
  });

  it('skips prose and roll-up sheets, and processes the product sheets', () => {
    const processed = report.sheets.filter((sheet) => sheet.processed).map((sheet) => sheet.name);
    expect(processed).toEqual(
      expect.arrayContaining(['Must Buy', 'Test Buy', 'Avoid', 'Generic Catalog (USD)']),
    );

    const skipped = Object.fromEntries(
      report.sheets.filter((sheet) => !sheet.processed).map((sheet) => [sheet.name, sheet.skip_reason]),
    );
    expect(skipped.Overview).toBe('prose_sheet');
    expect(skipped['Investment Summary']).toBe('rollup_sheet');
    expect(skipped['Negotiation & KPIs']).toBe('prose_sheet');
  });

  it('finds the header row despite each sheet having a different banner depth', () => {
    const headers = Object.fromEntries(
      report.sheets.filter((sheet) => sheet.processed).map((sheet) => [sheet.name, sheet.header_row]),
    );
    expect(headers['Must Buy']).toBe(2);
    expect(headers['Generic Catalog (USD)']).toBe(4 - 1); // banner, note, blank, header
  });

  it('maps the procurement columns with no losses', () => {
    const mustBuy = report.sheets.find((sheet) => sheet.name === 'Must Buy');
    expect(mustBuy.mapping_confidence).toBe(1);
    expect(mustBuy.unmapped_columns).toHaveLength(0);
  });

  it('preserves Arabic product names', () => {
    const product = bySku.get('JR-TCG13');
    expect(product.name).toBe('شاحن 45W GaN');
  });

  it('computes the Joyroom JR-TCG13 margin both ways', () => {
    const product = bySku.get('JR-TCG13');
    expect(product.pricing).toMatchObject({
      currency: 'EGP',
      rdp: 440,
      rrp: 750,
      selling_price: 750,
      margin_percentage: 70.45, // (750-440)/440 — the brief's definition
      gross_margin_percentage: 41.33, // matches the workbook's own figure
      margin_band: 'target',
    });
  });

  it('takes the verified cost, not the plan\'s claimed cost, for Anker A8852', () => {
    const product = bySku.get('A8852');
    expect(product.pricing.rdp).toBe(460);
    expect(product.metadata.cost_mismatch).toMatchObject({ reported: 280, verified: 460, delta: 180 });
    expect(product.issues.map((issue) => issue.code)).toContain('COST_MISMATCH');
  });

  it('flags the Anker A2667 defect: the assumed market price sits below cost', () => {
    const product = bySku.get('A2667');
    expect(product.pricing.rdp).toBe(1665);
    expect(product.pricing.market_high).toBe(1400);
    expect(product.issues.map((issue) => issue.code)).toContain('MARKET_BELOW_COST');
  });

  it('applies the JR-PK1 -> JR-PR1 SKU correction written into the cell', () => {
    expect(bySku.has('JR-PR1')).toBe(true);
    expect(bySku.has('JR-PK1')).toBe(false);
    expect(bySku.get('JR-PR1').metadata.sku_corrected).toBe('JR-PK1');
  });

  it('normalises the Arabic categories onto the taxonomy', () => {
    expect(bySku.get('JR-TCG13').category).toBe('Chargers');
    expect(bySku.get('S-A59').category).toBe('Cables');
    expect(bySku.get('JR-PBF12').category).toBe('Power Banks');
    expect(bySku.get('JR-T03S').category).toBe('Audio');
  });

  it('inherits each sheet\'s procurement verdict', () => {
    expect(bySku.get('JR-TCG13').status.procurement).toBe('must_buy');
    expect(bySku.get('JR-FN3').status.procurement).toBe('test_buy');
    expect(bySku.get('A8843').status.procurement).toBe('avoid');
  });

  it('reads USD prices from the generic sheet and converts them for reporting', () => {
    const usd = drafts.filter((draft) => draft.pricing.currency === 'USD');
    expect(usd.length).toBeGreaterThan(5);
    for (const product of usd) {
      expect(product.pricing.normalized.currency).toBe('EGP');
      expect(product.pricing.normalized.fx_rate).toBe(48.5);
    }
  });

  it('never mistakes the quantity x cost roll-up for a unit price', () => {
    // "Est. Cost (EGP, formula)" is 13,200 for JR-TCG13; its unit cost is 440.
    expect(bySku.get('JR-TCG13').pricing.rdp).toBe(440);
    expect(bySku.get('JR-TCG13').metadata.extended_cost).toBe(13_200);
  });

  it('does not import TOTAL rows as products', () => {
    expect(drafts.some((draft) => /^total$/i.test(draft.name ?? ''))).toBe(false);
  });

  it('retires a draft placeholder into the real SKU it points at', () => {
    // The Website Readiness sheet's own advice is to retire the generic
    // "شاحن جداري Joyroom (مسودة)" draft and link the listing to an approved
    // Joyroom SKU. The merge does exactly that: one product, priced.
    const product = bySku.get('JR-TCG13');
    expect(product.name).toBe('شاحن 45W GaN');
    expect(product.pricing.rdp).toBe(440);
    expect(product.issues.map((issue) => issue.code)).toContain('DUPLICATE_PRODUCT');
    expect(drafts.filter((draft) => draft.sku === 'JR-TCG13')).toHaveLength(1);
  });
});

describeIf('real catalog: product_catalog.xlsx (section-divider layout)', () => {
  let drafts;

  beforeAll(() => {
    ({ drafts } = parse(FILES.retail));
  });

  it('assigns categories from ALL-CAPS section dividers', () => {
    const hdmi = drafts.find((draft) => /HDMI Cable 1m/i.test(draft.name));
    expect(hdmi.category).toBe('Cables');
    expect(hdmi.subcategory).toBe('Display Cables');
  });

  it('does not import the section dividers themselves as products', () => {
    expect(drafts.some((draft) => draft.name === 'CHARGING & DATA CABLES')).toBe(false);
    expect(drafts.some((draft) => draft.name === 'INTERNAL PC CABLES')).toBe(false);
  });

  it('parses EGP price ranges into min/max and a midpoint', () => {
    const hdmi = drafts.find((draft) => /HDMI Cable 1m/i.test(draft.name));
    expect(hdmi.pricing.currency).toBe('EGP');
    expect(hdmi.pricing.detail.selling_price).toMatchObject({ min: 45, max: 70, is_range: true });
    expect(hdmi.pricing.selling_price).toBe(57.5);
    expect(hdmi.issues.map((issue) => issue.code)).toContain('PRICE_RANGE_ONLY');
  });

  it('generates a stable SKU for rows that have none', () => {
    const hdmi = drafts.find((draft) => /HDMI Cable 1m/i.test(draft.name));
    expect(hdmi.metadata.sku_generated).toBe(true);
    expect(hdmi.sku).toMatch(/^BH-[A-Z0-9]{3}-[A-Z0-9]{3}-[0-9A-F]{6}$/);
  });

  it('extracts the "Used – Original Pull" condition', () => {
    const sata = drafts.find((draft) => /SATA Data Cable/i.test(draft.name));
    expect(sata.specs.condition).toBe('original_pull');
  });
});

describeIf('real catalog: Merged_Catalog.xlsx', () => {
  let drafts;
  let report;

  beforeAll(() => {
    ({ drafts, report } = parse(FILES.merged));
  });

  it('does not import solutions, services or build blockers as products', () => {
    const skipped = Object.fromEntries(
      report.sheets.filter((sheet) => !sheet.processed).map((sheet) => [sheet.name, sheet.skip_reason]),
    );
    expect(skipped['Readiness - Solutions']).toBe('not_a_product_entity');
    expect(skipped['Readiness - Services']).toBe('not_a_product_entity');
    expect(skipped['Readiness - Build Blockers']).toBe('not_a_product_entity');
  });

  it('splits variant pricing into per-capacity entries', () => {
    const kingston = drafts.find((draft) => /DataTraveler Exodia/i.test(draft.name));
    expect(kingston.pricing.variants.length).toBeGreaterThanOrEqual(3);
    expect(kingston.pricing.variants[0]).toMatchObject({ label: '64GB', currency: 'USD' });
  });

  it('pulls warranty months out of the feature text', () => {
    const kingston = drafts.find((draft) => /DataTraveler Exodia/i.test(draft.name));
    expect(kingston.specs.warranty_months).toBe(60);
  });

  it('canonicalises "Soundcore by Anker"', () => {
    const r50i = drafts.find((draft) => /R50i True Wireless/i.test(draft.name));
    expect(r50i.brand).toBe('Soundcore');
  });
});

describeIf('cross-catalog behaviour', () => {
  let all;

  beforeAll(() => {
    all = Object.values(FILES).flatMap((file) => parse(file).drafts);
  });

  it('merges the same product appearing in several catalogs', () => {
    const { drafts, duplicates } = dedupeDrafts(all);
    expect(duplicates).toBeGreaterThan(0);
    expect(drafts.length).toBe(all.length - duplicates);

    const fingerprints = drafts.map((draft) => draft.fingerprint);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('keeps the richer row and fills its gaps from the poorer one', () => {
    const { drafts } = dedupeDrafts(all);
    const a8852 = drafts.find((draft) => draft.sku === 'A8852');
    // The Action Plan row quotes only the verified cost; the Master Catalog
    // row is the one that records the plan's own figure disagreeing with it.
    expect(a8852.metadata.cost_mismatch).toBeTruthy();
    expect(a8852.issues.map((issue) => issue.code)).toContain('COST_MISMATCH');
  });

  it('reports issues that are consistent with the merged product', () => {
    const { drafts } = dedupeDrafts(all);
    for (const product of drafts) {
      const codes = product.issues.map((issue) => issue.code);
      if (Number.isFinite(product.pricing.rdp) && product.pricing.rdp > 0) {
        expect(codes).not.toContain('MISSING_COST');
      }
      if (Number.isFinite(product.pricing.selling_price) && product.pricing.selling_price > 0) {
        expect(codes).not.toContain('MISSING_SELLING_PRICE');
      }
    }
  });

  it('is deterministic: parsing twice yields identical fingerprints', () => {
    const first = dedupeDrafts(all).drafts.map((draft) => draft.fingerprint).sort();
    const second = dedupeDrafts(
      Object.values(FILES).flatMap((file) => parse(file).drafts),
    ).drafts.map((draft) => draft.fingerprint).sort();
    expect(second).toEqual(first);
  });

  it('every product has a name, a SKU and a quality score', () => {
    const { drafts } = dedupeDrafts(all);
    for (const product of drafts) {
      expect(product.name).toBeTruthy();
      expect(product.sku).toBeTruthy();
      expect(product.metadata.data_quality_score).toBeGreaterThanOrEqual(0);
      expect(product.metadata.data_quality_score).toBeLessThanOrEqual(100);
    }
  });

  it('never sums mixed currencies: an unknown currency normalises to null', () => {
    const { drafts } = dedupeDrafts(all);
    for (const product of drafts) {
      if (!product.pricing.currency) {
        expect(product.pricing.normalized.rdp).toBeNull();
        expect(product.pricing.normalized.selling_price).toBeNull();
      }
    }
  });
});
