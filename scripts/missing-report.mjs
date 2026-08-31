#!/usr/bin/env node
/**
 * What is in the catalog but not on the site, and why.
 *
 * Two different gaps, and they need different work to close:
 *
 *   1. Folders with photos that have no agreed sell price. Every one of these
 *      is a pricing decision, not a technical problem — the product is
 *      described, categorised and photographed, and goes live the moment a
 *      price exists.
 *
 *   2. SKUs the workbook has already approved and priced that no folder
 *      photographs. These are the cheap wins: the money question is settled,
 *      what is missing is pictures.
 *
 * Generated rather than written by hand, so it can be re-run after every
 * import instead of going stale:
 *
 *   npm run report:missing
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

import { PRODUCTS, CATALOG_ROOT } from '../catalog/new-catalog.manifest.js';

const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'ByteHub-products-not-live.xlsx';

const WORKBOOK = path.join(CATALOG_ROOT, 'ByteHub Catalog.xlsx');
const PHOTO = /\.(jpe?g|png|webp|avif|jfif|gif)$/i;

/* ------------------------------------------------------------------ photos */

function countPhotos(folder) {
  const root = path.join(CATALOG_ROOT, folder);
  if (!fs.existsSync(root)) return 0;

  let total = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (PHOTO.test(entry.name)) total += 1;
    }
  };
  walk(root);
  return total;
}

/* ----------------------------------------------------------------- reasons */

/**
 * The one-line blocker, and the work that clears it.
 *
 * Derived from what the manifest already recorded rather than restated, so
 * this cannot drift from the catalog it describes.
 */
function classify(entry) {
  const gaps = entry.gaps ?? [];
  const said = gaps.join(' ');

  if (/Not approved for sale/i.test(said)) {
    return {
      blocker: 'Not approved for sale',
      action:
        'Decide whether to stock it despite the thin margin. If yes, agree a sell price and it lists like any other.',
    };
  }
  if (/No agreed sell price/i.test(said)) {
    return {
      blocker: 'No agreed sell price',
      action:
        'Agree a sell price. The list price is that plus 45 EGP shipping — the workbook quotes only a reference RRP, which is not a price we can charge.',
    };
  }
  if (/Photos belong to/i.test(said)) {
    return {
      blocker: 'Wrong photos, no price',
      action:
        'Photograph the actual unit, confirm the model code, then get a supplier quote. The photos here are of a different product.',
    };
  }
  if (/Unbranded placeholder/i.test(said)) {
    return {
      blocker: 'Unidentified product',
      action:
        'Say what this actually is — brand, model, length or wattage — then get a supplier quote. Nothing about it is known beyond the photo.',
    };
  }
  if (/No model code confirmed|unresolved|disputed|different model/i.test(said)) {
    return {
      blocker: 'Model code unconfirmed, no price',
      action: 'Confirm which model this is, then get a supplier quote for that exact code.',
    };
  }
  return {
    blocker: 'No price quoted',
    action: 'Get a supplier quote, then agree a sell price.',
  };
}

/* ------------------------------------------------- sheet 1: catalog, not live */

const live = PRODUCTS.filter((entry) => entry.pricing?.selling_price > 0);
const notLive = PRODUCTS.filter((entry) => !(entry.pricing?.selling_price > 0));

const notLiveRows = notLive
  .map((entry) => {
    const { blocker, action } = classify(entry);
    return {
      Category: entry.category ?? '',
      Product: entry.name,
      SKU: entry.sku ?? '—',
      Photos: countPhotos(entry.folder),
      Blocker: blocker,
      'Why it is not live': (entry.gaps ?? []).join(' · ') || 'No price recorded',
      'What would make it live': action,
      'Also needs resolving': (entry.conflicts ?? []).join(' · '),
      Folder: entry.folder,
    };
  })
  .sort((a, b) => a.Blocker.localeCompare(b.Blocker) || a.Category.localeCompare(b.Category));

/* --------------------------------------- sheet 2: priced, but nothing to show */

const clean = (value) => String(value ?? '').replace(/\r?\n/g, ' ').trim();

function approvedSkus() {
  if (!fs.existsSync(WORKBOOK)) return [];
  const wb = XLSX.readFile(WORKBOOK);
  const rows = [];

  for (const sheet of ['Must Buy', 'Test Buy']) {
    if (!wb.Sheets[sheet]) continue;
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
      header: 1,
      defval: null,
      blankrows: false,
    });
    const head = grid[1].map(clean);
    const at = (label) => head.findIndex((h) => h.toLowerCase().includes(label.toLowerCase()));
    const col = {
      product: at('Product'),
      sku: at('Model / SKU'),
      rdp: at('RDP (verified'),
      rrp: at('RRP (verified'),
      list: at('Free-Ship List Price'),
      margin: at('Margin % (after free ship)'),
      qty: at('Qty'),
      note: at('Verification Notes'),
    };

    for (const row of grid.slice(2)) {
      if (row[col.product] == null || row[col.list] == null || row[col.list] === '') continue;
      rows.push({
        sheet,
        sku: clean(row[col.sku]),
        product: clean(row[col.product]),
        rdp: row[col.rdp],
        rrp: row[col.rrp],
        list: row[col.list],
        margin: typeof row[col.margin] === 'number' ? row[col.margin] : null,
        qty: row[col.qty],
        note: clean(row[col.note]),
      });
    }
  }
  return rows;
}

// A workbook SKU counts as photographed if any manifest entry claims it. The
// PBF12 folder is still named PBF15, which is exactly why this matches on the
// manifest's SKU rather than on the folder name.
const photographed = new Set(PRODUCTS.map((entry) => entry.sku).filter(Boolean));

const pricedNoPhotos = approvedSkus()
  .filter((row) => ![...photographed].some((sku) => row.sku.includes(sku)))
  .map((row) => ({
    SKU: row.sku,
    Product: row.product,
    'Approved on': row.sheet,
    'Cost (EGP)': row.rdp,
    'RRP (EGP)': row.rrp,
    'List price (EGP)': row.list,
    'Margin after free ship': row.margin == null ? '' : `${(row.margin * 100).toFixed(1)}%`,
    'Planned qty': row.qty,
    'Why it is not live':
      row.margin != null && row.margin < 0
        ? 'No photos in New Catalog/ — and it sells below cost at this list price'
        : 'No photos in New Catalog/ — nothing to show a customer',
    'What would make it live':
      row.margin != null && row.margin < 0
        ? 'Re-check the cost before anything else: at this list price the sale loses money. Then photograph it.'
        : 'Add a folder of product photos under New Catalog/ and re-import.',
    'Workbook note': row.note,
  }))
  .sort((a, b) => String(a.SKU).localeCompare(String(b.SKU)));

/* ------------------------------------------------------- sheet 3: on sale now */

const liveRows = live
  .map((entry) => ({
    Category: entry.category,
    Product: entry.name,
    SKU: entry.sku,
    'List price (EGP)': entry.pricing.selling_price,
    'RRP (EGP)': entry.pricing.rrp,
    'Cost (EGP)': entry.pricing.rdp,
    Photos: countPhotos(entry.folder),
  }))
  .sort((a, b) => a.Category.localeCompare(b.Category) || a['List price (EGP)'] - b['List price (EGP)']);

/* ------------------------------------------------------------------- write */

const wb = XLSX.utils.book_new();

const widths = (rows) =>
  Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.min(
      70,
      Math.max(key.length + 2, ...rows.map((row) => String(row[key] ?? '').length + 2)),
    ),
  }));

for (const [name, rows] of [
  ['Not live', notLiveRows],
  ['Priced, no photos', pricedNoPhotos],
  ['On sale now', liveRows],
]) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = widths(rows);
  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { c: 0, r: 0 },
      e: { c: Math.max(0, Object.keys(rows[0] ?? {}).length - 1), r: rows.length },
    }),
  };
  XLSX.utils.book_append_sheet(wb, sheet, name);
}

XLSX.writeFile(wb, OUT);

console.log(`${OUT}\n`);
console.log(`  On sale now          ${liveRows.length}`);
console.log(`  In the catalog, not live  ${notLiveRows.length}`);
for (const [blocker, count] of Object.entries(
  notLiveRows.reduce((acc, row) => ({ ...acc, [row.Blocker]: (acc[row.Blocker] ?? 0) + 1 }), {}),
)) {
  console.log(`      ${String(count).padStart(2)}  ${blocker}`);
}
console.log(`  Priced but unphotographed ${pricedNoPhotos.length}`);
