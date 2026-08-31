/**
 * The curated New Catalog: the manifest, the folders it points at, and the
 * products it produces.
 *
 * The manifest is hand-authored data about real money, so these tests are
 * mostly about it staying honest — every folder real, every price traceable,
 * nothing published that has no price.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { PRODUCTS, CATALOG_ROOT, pricedProducts, openQuestions } from '../../catalog/new-catalog.manifest.js';
import {
  buildAllDrafts,
  buildDraft,
  scanProductImages,
  generatePlaceholderSku,
} from '../../src/modules/catalog/manifest.importer.js';
import { isPublishable } from '../../src/modules/product/product.publishable.js';

const ROOT = process.cwd();
const catalogExists = fs.existsSync(path.join(ROOT, CATALOG_ROOT));
const describeIf = catalogExists ? describe : describe.skip;

describeIf('the manifest matches what is on disk', () => {
  it('points every entry at a folder that exists', () => {
    for (const product of PRODUCTS) {
      const dir = path.join(ROOT, CATALOG_ROOT, product.folder);
      expect(fs.existsSync(dir), `missing folder: ${product.folder}`).toBe(true);
    }
  });

  it('covers every product folder on disk — none silently dropped', () => {
    const onDisk = [];
    for (const category of fs.readdirSync(path.join(ROOT, CATALOG_ROOT), { withFileTypes: true })) {
      if (!category.isDirectory()) continue;
      for (const entry of fs.readdirSync(path.join(ROOT, CATALOG_ROOT, category.name), { withFileTypes: true })) {
        if (entry.isDirectory()) onDisk.push(`${category.name}/${entry.name}`);
      }
    }
    const claimed = new Set(PRODUCTS.map((product) => product.folder));
    expect(onDisk.filter((folder) => !claimed.has(folder))).toEqual([]);
    expect(PRODUCTS).toHaveLength(onDisk.length);
  });

  it('finds photos for every product', () => {
    for (const product of PRODUCTS) {
      expect(scanProductImages(product.folder).length, `no photos: ${product.folder}`).toBeGreaterThan(0);
    }
  });

  it('ignores desktop.ini and other non-images', () => {
    const images = PRODUCTS.flatMap((product) => scanProductImages(product.folder));
    expect(images.every((image) => /\.(jpe?g|png|webp|jfif|gif|avif)$/i.test(image.path))).toBe(true);
  });
});

describeIf('the manifest states its evidence', () => {
  it('gives every real SKU a source', () => {
    for (const product of PRODUCTS.filter((entry) => entry.sku)) {
      expect(product.sku_evidence, `${product.sku} has no evidence`).toBeTruthy();
    }
  });

  it('gives every price a named source sheet', () => {
    for (const product of pricedProducts()) {
      expect(product.pricing.price_source, `${product.name} has an unsourced price`).toBeTruthy();
      expect(product.pricing.currency).toBe('EGP');
      expect(product.pricing.rrp).toBeGreaterThan(0);
    }
  });

  it('never quotes a retail price below cost', () => {
    for (const product of pricedProducts()) {
      if (product.pricing.rdp === null || product.pricing.rdp === undefined) continue;
      expect(product.pricing.rrp, `${product.name} would sell at a loss`).toBeGreaterThanOrEqual(
        product.pricing.rdp,
      );
    }
  });

  it('leaves an unpriced product null rather than guessing a figure', () => {
    for (const product of PRODUCTS.filter((entry) => !entry.pricing)) {
      expect(product.pricing).toBeNull();
      expect(product.gaps?.some((gap) => /price/i.test(gap))).toBe(true);
    }
  });

  it('writes a description for every product, priced or not', () => {
    for (const product of PRODUCTS) {
      expect(product.description?.short, `${product.name} has no short description`).toBeTruthy();
      expect(product.description?.long, `${product.name} has no long description`).toBeTruthy();
      expect(product.description.long.length).toBeGreaterThan(product.description.short.length);
    }
  });

  it('files every product under a known category', () => {
    const allowed = new Set(['Cables', 'Chargers', 'Audio', 'Power Banks']);
    for (const product of PRODUCTS) {
      expect(allowed.has(product.category), `${product.name}: ${product.category}`).toBe(true);
    }
  });

  it('categorises the S-A60 by what it is, not which folder it sits in', () => {
    // Its photos live under Chargers/, but the supplier sheet calls it a cable.
    const product = PRODUCTS.find((entry) => entry.sku === 'S-A60');
    expect(product.folder.startsWith('Chargers/')).toBe(true);
    expect(product.category).toBe('Cables');
    expect(product.conflicts?.length).toBeGreaterThan(0);
  });
});

describeIf('building product drafts', () => {
  let built;

  beforeAll(() => {
    built = buildAllDrafts();
  });

  it('produces one draft per manifest entry', () => {
    expect(built).toHaveLength(PRODUCTS.length);
  });

  it('gives every product a unique SKU', () => {
    const skus = built.map(({ product }) => product.sku);
    expect(new Set(skus).size, 'two products share a SKU').toBe(skus.length);
  });

  it('generates a unique placeholder even for near-identical folder names', () => {
    // "GENERAL CABLE USB TO TYPE C" and "GENERAL CABLE TYPE C TO TYPE C" both
    // end in "TO TYPE C"; a readable slug alone collided and merged them.
    const a = generatePlaceholderSku('Cables/GENERAL CABLE USB TO TYPE C');
    const b = generatePlaceholderSku('Cables/GENERAL CABLE TYPE C TO TYPE C');
    expect(a).not.toBe(b);
  });

  it('is deterministic — the same folder always yields the same SKU', () => {
    const folder = 'Cables/GENERAL CABLE USB TO IPHONE';
    expect(generatePlaceholderSku(folder)).toBe(generatePlaceholderSku(folder));
  });

  it('gives every draft a distinct fingerprint, so a re-import updates', () => {
    const fingerprints = built.map(({ product }) => product.fingerprint);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('sells at the free-ship list price, never at RRP', () => {
    for (const { entry, product } of built) {
      if (!entry.pricing) continue;

      expect(product.pricing.selling_price).toBe(entry.pricing.selling_price);
      // RRP is a retail recommendation kept for reference. The customer pays
      // the agreed sell price plus absorbed shipping, which is always lower —
      // pricing from RRP would quote roughly a quarter over the intended price.
      expect(product.pricing.selling_price).toBeLessThan(entry.pricing.rrp);
    }
  });

  it('has no price for a product the workbook never agreed a sell price for', () => {
    // The Soundcore earbuds and the Zolo power bank carry an RRP in an
    // opportunity or Avoid note. An RRP is not an agreed price, and falling
    // back to it would put products on sale the shop never approved.
    const withRrpOnly = ['A3957', 'A3959', 'A3969', 'A110D', 'JR-QP191'];

    for (const sku of withRrpOnly) {
      const found = built.find(({ product }) => product.sku === sku);
      expect(found, `${sku} should still be in the catalog`).toBeDefined();
      expect(found.product.pricing.selling_price, `${sku} must not be priced`).toBeNull();
      // Even granted the verification import never gives, the price gate alone
      // keeps it out of the shop.
      expect(
        isPublishable({ ...found.product, status: { ...found.product.status, is_verified: true } }),
        `${sku} must not be publishable`,
      ).toBe(false);
    }
  });

  it('computes both margin bases from the quoted cost', () => {
    const charger = built.find(({ product }) => product.sku === 'JR-TCG13').product;
    expect(charger.pricing.rdp).toBe(440);
    expect(charger.pricing.rrp).toBe(750);
    // 595 = the 550 agreed sell price + the 45 EGP of shipping ByteHub absorbs.
    expect(charger.pricing.selling_price).toBe(595);
    expect(charger.pricing.margin_percentage).toBe(35.23);
    expect(charger.pricing.gross_margin_percentage).toBe(26.05);
  });

  it('records EGP even when no figure is quoted, so a later price is unambiguous', () => {
    const unpriced = built.find(({ entry }) => !entry.pricing).product;
    expect(unpriced.pricing.currency).toBe('EGP');
    expect(unpriced.pricing.rdp).toBeNull();
    expect(unpriced.pricing.selling_price).toBeNull();
  });

  it('refuses to publish anything without a price', () => {
    for (const { entry, product } of built) {
      // isPublishable also needs verification, which import never grants;
      // the point here is that the price gate alone rejects these.
      if (!entry.pricing) {
        expect(isPublishable({ ...product, status: { ...product.status, is_verified: true } })).toBe(false);
      }
    }
  });

  it('lets a priced product through the same gate once verified', () => {
    const priced = built.find(({ entry }) => entry.pricing).product;
    expect(isPublishable({ ...priced, status: { ...priced.status, is_verified: true } })).toBe(true);
  });

  it('raises a SOURCE_CONFLICT issue wherever the manifest records a disagreement', () => {
    for (const { entry, product } of built) {
      if (!entry.conflicts?.length) continue;
      const codes = product.issues.map((issue) => issue.code);
      expect(codes, `${product.name} lost its conflict flag`).toContain('SOURCE_CONFLICT');
    }
  });

  it('flags the Anker Zolo 20,000 mAh folder, whose photos are the 10,000 mAh ones', () => {
    const zolo = built.find(({ entry }) => entry.folder.includes('20,000mAH')).product;
    const messages = zolo.issues.map((issue) => issue.message).join(' ');
    expect(messages).toMatch(/identical to the 10,000 mAh folder/i);
  });

  it('attaches photos and marks exactly one primary', () => {
    for (const { product } of built) {
      expect(product.images.length).toBeGreaterThan(0);
      expect(product.images.filter((image) => image.is_primary)).toHaveLength(1);
    }
  });

  it('builds image URLs under the stable public prefix, not the folder name', () => {
    // The directory on disk has been renamed once already; a URL built from it
    // would have broken every stored image.
    for (const { product } of built) {
      for (const image of product.images) {
        expect(image.url.startsWith('/catalog/')).toBe(true);
        expect(image.url).not.toContain(' ');
      }
    }
  });

  it('keeps colour variants as one product, tagging each photo with its colour', () => {
    const liberty = built.find(({ product }) => product.sku === 'A3957').product;
    const variants = new Set(liberty.images.map((image) => image.variant).filter(Boolean));
    expect([...variants].sort()).toEqual(['Black', 'Blue', 'Golden', 'White']);
  });

  it('scores a fully-described priced product well above an unpriced placeholder', () => {
    const good = built.find(({ product }) => product.sku === 'JR-TCG13').product;
    const placeholder = built.find(({ entry }) => entry.is_generic && !entry.pricing).product;
    expect(good.metadata.data_quality_score).toBeGreaterThan(
      placeholder.metadata.data_quality_score,
    );
  });
});

describeIf('buildDraft edge cases', () => {
  it('does not throw on a bare entry', () => {
    expect(() => buildDraft({ folder: 'X/Y', name: 'Bare' }, [])).not.toThrow();
  });

  it('reports a missing price rather than inventing one', () => {
    const product = buildDraft({ folder: 'X/Y', name: 'Bare' }, []);
    const codes = product.issues.map((issue) => issue.code);
    expect(codes).toContain('MISSING_COST');
    expect(codes).toContain('MISSING_SELLING_PRICE');
    expect(product.pricing.selling_price).toBeNull();
  });
});

describeIf('the open-questions report', () => {
  it('lists every conflict and gap the manifest records', () => {
    const questions = openQuestions();
    const expected = PRODUCTS.reduce(
      (sum, product) => sum + (product.conflicts?.length ?? 0) + (product.gaps?.length ?? 0),
      0,
    );
    expect(questions).toHaveLength(expected);
    expect(questions.every((entry) => entry.folder && entry.text)).toBe(true);
  });

  it('is non-empty — the catalog genuinely has unresolved data', () => {
    expect(openQuestions().length).toBeGreaterThan(0);
  });
});
