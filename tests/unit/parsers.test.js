import { describe, it, expect } from 'vitest';
import {
  mapColumns,
  matchHeader,
  currencyHintFrom,
  inferSheetCurrency,
} from '../../src/modules/catalog/parsers/columnMapper.js';
import { detectHeaderRow } from '../../src/modules/catalog/parsers/headerDetector.js';
import { classifyRow, ROW_TYPES } from '../../src/modules/catalog/parsers/rowClassifier.js';

const row = (index, cells) => ({ index, cells });

/* ------------------------------------------------------------------ */

describe('matchHeader', () => {
  it('matches an exact alias', () => {
    expect(matchHeader('Product Name')).toMatchObject({ field: 'name', strategy: 'exact' });
  });

  it('is case- and punctuation-insensitive', () => {
    expect(matchHeader('  PRODUCT  NAME ')).toMatchObject({ field: 'name' });
  });

  it('matches Arabic headers', () => {
    expect(matchHeader('اسم المنتج')).toMatchObject({ field: 'name' });
    expect(matchHeader('الفئة')).toMatchObject({ field: 'category' });
    expect(matchHeader('المورد')).toMatchObject({ field: 'supplier' });
  });

  it('handles the "#" column, which normalises to an empty string', () => {
    expect(matchHeader('#')).toMatchObject({ field: 'row_number' });
  });

  it('falls back to fuzzy matching for a near-miss', () => {
    const match = matchHeader('Prodct Name');
    expect(match.field).toBe('name');
    expect(match.strategy).toBe('fuzzy');
    expect(match.confidence).toBeLessThan(1);
  });

  it('returns null for a header it cannot place', () => {
    expect(matchHeader('Talking point')).toBeNull();
  });

  it('flattens multi-line headers before matching', () => {
    expect(matchHeader('RDP\n(verified, EGP)')).toMatchObject({ field: 'rdp' });
  });
});

describe('currencyHintFrom', () => {
  it.each([
    ['RDP (verified, EGP)', 'EGP'],
    ['Est. Price (USD)', 'USD'],
    ['Price ($)', 'USD'],
    ['السعر (ج.م)', 'EGP'],
    ['Quantity', null],
  ])('reads %s as %s', (header, expected) => {
    expect(currencyHintFrom(header)).toBe(expected);
  });

  it('does not see "LE" inside an ordinary word', () => {
    // "Example SKU" contains the letters "le" — an unanchored match tagged the
    // whole column as Egyptian pounds.
    expect(currencyHintFrom('Example SKU')).toBeNull();
  });
});

describe('mapColumns', () => {
  const procurementHeader = [
    '#', 'Product', 'Category', 'Supplier', 'Model / SKU',
    'RDP\n(plan, EGP)', 'RDP\n(verified, EGP)', 'RRP\n(verified, EGP)',
    'Local Market\n(EGP)', 'Margin %\n(RRP basis)', 'Qty',
    'Est. Cost\n(EGP, formula)', 'Verification Notes',
  ];

  it('maps the real ByteHub procurement header with full confidence', () => {
    const mapping = mapColumns(procurementHeader);
    expect(mapping.confidence).toBe(1);
    expect(mapping.unmapped).toHaveLength(0);
    expect(mapping.byField.name.index).toBe(1);
    expect(mapping.byField.sku.index).toBe(4);
    expect(mapping.byField.quantity.index).toBe(10);
  });

  it('keeps the verified cost apart from the plan\'s claimed cost', () => {
    const mapping = mapColumns(procurementHeader);
    expect(mapping.byField.rdp.index).toBe(6); // "(verified, EGP)"
    expect(mapping.byField.rdp_reported.index).toBe(5); // "(plan, EGP)"
  });

  it('never lets the quantity x cost roll-up become a unit price', () => {
    const mapping = mapColumns(procurementHeader);
    expect(mapping.byField.extended_cost.index).toBe(11);
    expect(mapping.byField.rdp.index).not.toBe(11);
  });

  it('tags each money column with its own currency', () => {
    const mapping = mapColumns(['Product', 'RDP (EGP)', 'Est. Price (USD)']);
    expect(mapping.byField.rdp.currency).toBe('EGP');
    expect(mapping.byField.selling_price.currency).toBe('USD');
  });

  it('records unmapped columns instead of dropping them', () => {
    const mapping = mapColumns(['Product', 'Talking point', 'Ask']);
    expect(mapping.byField.name).toBeDefined();
    expect(mapping.unmapped.map((column) => column.header)).toContain('Talking point');
  });

  it('gives a contested field to the more specific header and keeps the loser', () => {
    const mapping = mapColumns(['Product', 'RDP', 'RDP (verified, EGP)']);
    expect(mapping.byField.rdp.header).toBe('RDP (verified, EGP)');
    expect(mapping.unmapped.map((column) => column.header)).toContain('RDP');
  });

  it('ignores blank header cells', () => {
    const mapping = mapColumns(['Product', null, '', 'Brand']);
    expect(mapping.columns).toHaveLength(2);
  });
});

describe('inferSheetCurrency', () => {
  it('takes the majority vote across money columns', () => {
    expect(inferSheetCurrency(mapColumns(['Product', 'RDP (EGP)', 'RRP (EGP)']))).toBe('EGP');
  });

  it('is null when no column declares a currency', () => {
    expect(inferSheetCurrency(mapColumns(['Product', 'Brand']))).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('detectHeaderRow', () => {
  it('finds a header on row 2, under a title banner', () => {
    const sheet = {
      width: 4,
      rows: [
        row(1, ['ByteHub Procurement — Must Buy', null, null, null]),
        row(2, ['#', 'Product', 'Supplier', 'RDP (verified, EGP)']),
        row(3, [1, 'شاحن 45W GaN', 'Joyroom', 440]),
      ],
    };
    expect(detectHeaderRow(sheet).index).toBe(2);
  });

  it('finds a header on row 4, under three banner lines', () => {
    const sheet = {
      width: 3,
      rows: [
        row(1, ['PRODUCT CATALOG — MERGED MASTER LIST', null, null]),
        row(2, ['Combined from Product_Catalog_1 & _2', null, null]),
        row(3, [null, null, null]),
        row(4, ['#', 'Product Name', 'Brand']),
        row(5, [1, 'Soundcore R50i', 'Soundcore by Anker']),
      ],
    };
    expect(detectHeaderRow(sheet).index).toBe(4);
  });

  it('returns null for a prose sheet with no table', () => {
    const sheet = {
      width: 2,
      rows: [
        row(1, ['ByteHub — Master Merged Catalog & Procurement Review', null]),
        row(2, ['⚠ HEADLINE FINDING — the budget math does not add up', null]),
        row(3, ['•', 'Re-multiplying the plan\'s own quantities gives a different basket total.']),
      ],
    };
    expect(detectHeaderRow(sheet)).toBeNull();
  });

  it('does not mistake a data row for a header', () => {
    const sheet = {
      width: 4,
      rows: [
        row(1, ['#', 'Product', 'Supplier', 'RDP']),
        row(2, [1, 'شاحن 45W GaN', 'Joyroom', 440]),
        row(3, [2, 'شاحن 20W PD', 'Joyroom', 290]),
      ],
    };
    expect(detectHeaderRow(sheet).index).toBe(1);
  });
});

/* ------------------------------------------------------------------ */

describe('classifyRow', () => {
  const context = { headerIndex: 3, width: 8 };

  it('classifies an ordinary product row as data', () => {
    const result = classifyRow(row(4, [1, 'HDMI Cable 1m', 'Generic', 'Display Cable', '45 – 70']), context);
    expect(result.type).toBe(ROW_TYPES.DATA);
  });

  it('classifies an ALL-CAPS divider as a section header', () => {
    const result = classifyRow(row(5, ['CHARGING & DATA CABLES', null, null, null]), context);
    expect(result.type).toBe(ROW_TYPES.SECTION);
    expect(result.text).toBe('CHARGING & DATA CABLES');
  });

  it('classifies a TOTAL row as a total, not a product', () => {
    const result = classifyRow(row(12, [null, null, null, null, null, null, 'TOTAL', 82075]), context);
    expect(result.type).toBe(ROW_TYPES.TOTAL);
  });

  it('recognises an Arabic total row', () => {
    const result = classifyRow(row(12, [null, null, 'الإجمالي', 82075]), context);
    expect(result.type).toBe(ROW_TYPES.TOTAL);
  });

  it('classifies rows above the header as title text', () => {
    const result = classifyRow(row(1, ['ByteHub Procurement — Must Buy', null]), context);
    expect(result.type).toBe(ROW_TYPES.TITLE);
  });

  it('classifies a fully blank row as empty', () => {
    expect(classifyRow(row(9, [null, null, null]), context).type).toBe(ROW_TYPES.EMPTY);
  });

  it('treats a long single-cell sentence as prose, not a section divider', () => {
    const prose = 'Re-multiplying the plan\'s own quantities by its own RDP figures gives a very different basket total than the one stated.';
    expect(classifyRow(row(6, [prose, null, null]), context).type).toBe(ROW_TYPES.TITLE);
  });

  it('treats a bullet marker plus prose as title text', () => {
    const result = classifyRow(
      row(7, ['•', 'Three RDP figures quoted in the plan do not match the supplier price lists it was built from.']),
      context,
    );
    expect(result.type).toBe(ROW_TYPES.TITLE);
  });
});
