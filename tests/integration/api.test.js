/**
 * End-to-end tests against a real MongoDB (in-memory) and the real Express app:
 * import the actual ByteHub catalogs, then drive the admin API over HTTP.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import createApp from '../../src/app.js';
import catalogService from '../../src/modules/catalog/catalog.service.js';
import productService from '../../src/modules/product/product.service.js';
import qualityService from '../../src/modules/quality/quality.service.js';
import Product from '../../src/modules/product/product.model.js';

const ROOT = process.cwd();
const MASTER = path.join(ROOT, 'ByteHub_Master_Catalog.xlsx');
const RETAIL = path.join(ROOT, 'product_catalog.xlsx');
const PLAN = path.join(ROOT, 'ByteHub_Action_Plan.xlsx');

const API = '/api/v1';

let server;
let app;

const skip = !fs.existsSync(MASTER);
const describeIf = skip ? describe.skip : describe;

beforeAll(async () => {
  if (skip) return;
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'bytehub_test' });
  app = createApp();

  await catalogService.ingest({ filePath: MASTER }, { sourceCatalog: 'master' });
  await catalogService.ingest({ filePath: RETAIL }, { sourceCatalog: 'retail' });
  await qualityService.rescoreAll();
}, 180_000);

afterAll(async () => {
  if (skip) return;
  await mongoose.disconnect();
  await server.stop();
});

const findBySku = (sku) => Product.findOne({ sku }).lean();

/* ------------------------------------------------------------------ */

describeIf('import persistence', () => {
  it('stores products from both catalogs', async () => {
    expect(await Product.countDocuments()).toBeGreaterThan(50);
  });

  it('writes the admin-owned status defaults on create, not just omits them', async () => {
    // A bulkWrite upsert skips Mongoose's schema defaults, and the importer
    // strips these paths from its $set because an admin owns them. Together
    // that used to leave the field absent — and an absent field is not false,
    // so `{ 'status.is_verified': false }` matched nothing at all.
    const total = await Product.countDocuments();

    expect(await Product.countDocuments({ 'status.is_verified': false })).toBe(total);
    expect(await Product.countDocuments({ 'status.is_verified': { $exists: false } })).toBe(0);
    expect(await Product.countDocuments({ 'metadata.locked_fields': { $exists: false } })).toBe(0);
  });

  it('finds unverified products by equality, the way the admin list filters', async () => {
    const response = await request(app)
      .get(`${API}/products`)
      .query({ is_verified: 'false', limit: 1 })
      .expect(200);

    expect(response.body.meta.total).toBeGreaterThan(0);
  });

  it('records an audit trail for each import run', async () => {
    const response = await request(app).get(`${API}/catalog/imports`).expect(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);

    const run = response.body.data.find((entry) => entry.source_catalog === 'master');
    expect(run.status).toBe('completed');
    expect(run.totals.products_created).toBeGreaterThan(0);
    expect(run.sheets.some((sheet) => sheet.skip_reason === 'prose_sheet')).toBe(true);
  });

  it('is idempotent: re-importing updates rather than duplicates', async () => {
    const before = await Product.countDocuments();
    const { import_run: run } = await catalogService.ingest(
      { filePath: MASTER },
      { sourceCatalog: 'master' },
    );
    expect(await Product.countDocuments()).toBe(before);
    expect(run.totals.products_created).toBe(0);
    expect(run.totals.products_updated).toBeGreaterThan(0);
  });

  it('stores the verified cost and the mismatch evidence for Anker A8852', async () => {
    const product = await findBySku('A8852');
    expect(product.pricing.rdp).toBe(460);
    expect(product.metadata.cost_mismatch.reported).toBe(280);
  });

  it('keeps the raw source row so a mapping mistake stays recoverable', async () => {
    const product = await findBySku('JR-TCG13');
    expect(product.metadata.raw).toBeTruthy();
    expect(product.metadata.source_sheet).toBeTruthy();
    expect(product.metadata.source_row).toBeGreaterThan(0);
  });
});

describeIf('GET /products', () => {
  it('paginates', async () => {
    const response = await request(app).get(`${API}/products?limit=5&page=1`).expect(200);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.meta).toMatchObject({ page: 1, limit: 5 });
    expect(response.body.meta.total).toBeGreaterThan(5);
  });

  it('filters by category and brand', async () => {
    const response = await request(app)
      .get(`${API}/products?category=Chargers&brand=Joyroom`)
      .expect(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    for (const product of response.body.data) {
      expect(product.category).toBe('Chargers');
      expect(product.brand).toBe('Joyroom');
    }
  });

  it('filters by issue code', async () => {
    const response = await request(app)
      .get(`${API}/products?issue_code=COST_MISMATCH`)
      .expect(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    for (const product of response.body.data) {
      expect(product.issues.map((issue) => issue.code)).toContain('COST_MISMATCH');
    }
  });

  it('filters by margin range', async () => {
    const response = await request(app).get(`${API}/products?min_margin=50`).expect(200);
    for (const product of response.body.data) {
      expect(product.pricing.margin_percentage).toBeGreaterThanOrEqual(50);
    }
  });

  it('sorts by margin descending', async () => {
    const response = await request(app).get(`${API}/products?sort=-margin&limit=10`).expect(200);
    const margins = response.body.data
      .map((product) => product.pricing.margin_percentage)
      .filter((value) => value !== null);
    expect([...margins].sort((a, b) => b - a)).toEqual(margins);
  });

  it('rejects an invalid query rather than ignoring it', async () => {
    const response = await request(app).get(`${API}/products?limit=99999`).expect(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(response.body.error.details[0].path).toBe('limit');
  });

  it('returns 400 for a malformed id', async () => {
    await request(app).get(`${API}/products/not-an-id`).expect(400);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await request(app)
      .get(`${API}/products/${new mongoose.Types.ObjectId()}`)
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describeIf('PATCH /products/:id — manual overrides', () => {
  it('records an override and locks the edited field', async () => {
    const product = await findBySku('JR-T03S');

    const response = await request(app)
      .patch(`${API}/products/${product._id}`)
      .send({ name: 'Joyroom JR-T03S TWS Earbuds', reason: 'Arabic name replaced for the storefront' })
      .expect(200);

    expect(response.body.data.name).toBe('Joyroom JR-T03S TWS Earbuds');
    expect(response.body.data.metadata.locked_fields).toContain('name');
    expect(response.body.meta.changed).toEqual(['name']);

    const override = response.body.data.metadata.overrides.at(-1);
    expect(override).toMatchObject({ field: 'name', previous: 'سماعات TWS' });
  });

  it('SURVIVES RE-IMPORT: a manual correction is not overwritten', async () => {
    // This is the constraint that makes admin corrections worth making.
    const before = await findBySku('JR-T03S');
    expect(before.name).toBe('Joyroom JR-T03S TWS Earbuds');

    await catalogService.ingest({ filePath: MASTER }, { sourceCatalog: 'master' });

    const after = await findBySku('JR-T03S');
    expect(after.name).toBe('Joyroom JR-T03S TWS Earbuds');
    // Unlocked fields still refresh from the source.
    expect(after.pricing.rdp).toBe(600);
  });

  it('reports how many locked fields an import preserved', async () => {
    const { import_run: run } = await catalogService.ingest(
      { filePath: MASTER },
      { sourceCatalog: 'master' },
    );
    expect(run.totals.locked_fields_preserved).toBeGreaterThan(0);
  });

  it('releases a field back to the pipeline when unlocked', async () => {
    const product = await findBySku('JR-T03S');
    await request(app)
      .patch(`${API}/products/${product._id}/unlock`)
      .send({ fields: ['name'] })
      .expect(200);

    await catalogService.ingest({ filePath: MASTER }, { sourceCatalog: 'master' });
    expect((await findBySku('JR-T03S')).name).toBe('سماعات TWS');
  });

  it('rejects an edit to a computed field', async () => {
    const product = await findBySku('JR-TCG13');
    const response = await request(app)
      .patch(`${API}/products/${product._id}`)
      .send({ pricing: { margin_percentage: 999 } })
      .expect(400);
    expect(response.body.error.message).toMatch(/validation failed|not editable/i);
  });

  it('rejects an empty patch', async () => {
    const product = await findBySku('JR-TCG13');
    await request(app).patch(`${API}/products/${product._id}`).send({}).expect(400);
  });
});

describeIf('PATCH /products/:id/price', () => {
  it('recomputes margin, band and normalised values', async () => {
    const product = await findBySku('JR-TCG13');

    const response = await request(app)
      .patch(`${API}/products/${product._id}/price`)
      .send({ selling_price: 880, reason: 'Repriced for Q3' })
      .expect(200);

    const pricing = response.body.data.pricing;
    expect(pricing.selling_price).toBe(880);
    expect(pricing.margin_percentage).toBe(100); // (880-440)/440
    expect(pricing.gross_margin_percentage).toBe(50);
    expect(pricing.margin_band).toBe('target');
    expect(pricing.normalized.selling_price).toBe(880);
  });

  it('raises a loss alert when priced below cost, and lowers the quality score', async () => {
    const product = await findBySku('JR-PBF12');
    const before = product.metadata.data_quality_score;

    const response = await request(app)
      .patch(`${API}/products/${product._id}/price`)
      .send({ selling_price: 300 }) // cost is 420
      .expect(200);

    const codes = response.body.data.issues.map((issue) => issue.code);
    expect(codes).toContain('SELLING_BELOW_COST');
    expect(response.body.data.pricing.margin_band).toBe('loss');
    expect(response.body.data.metadata.data_quality_score).toBeLessThan(before);
  });

  it('rejects a negative price', async () => {
    const product = await findBySku('JR-TCG13');
    await request(app)
      .patch(`${API}/products/${product._id}/price`)
      .send({ selling_price: -5 })
      .expect(400);
  });
});

describeIf('PATCH /products/:id/verify', () => {
  it('refuses to verify a product with unresolved critical issues', async () => {
    const product = await Product.findOne({ 'issues.severity': 'critical' }).lean();
    const response = await request(app)
      .patch(`${API}/products/${product._id}/verify`)
      .send({ is_verified: true })
      .expect(400);
    expect(response.body.error.details.issues.length).toBeGreaterThan(0);
  });

  /** Critical issue codes on a product, which is what the gate actually reads. */
  const criticalCodes = (product) =>
    (product.issues ?? [])
      .filter((issue) => issue.severity === 'critical')
      .map((issue) => issue.code);

  it('waives only the issue codes it is given, and records the waiver', async () => {
    // Not every critical issue is critical to a customer: MISSING_COST means
    // the shop has not recorded what it pays, which the product page does not
    // depend on. Selected in JS rather than by query because Mongo would match
    // a product where 'MISSING_COST' and 'critical' come from *different*
    // issues, which is not the case under test.
    const candidates = await Product.find({ 'issues.code': 'MISSING_COST' }).lean();
    const product = candidates.find((entry) => {
      const codes = criticalCodes(entry);
      return codes.length > 0 && codes.every((code) => code === 'MISSING_COST');
    });

    expect(product, 'fixtures should hold a product blocked only by MISSING_COST').toBeTruthy();

    try {
      const result = await productService.setVerification(String(product._id), {
        is_verified: true,
        reason: 'Storefront publish',
        allowIssueCodes: ['MISSING_COST'],
      });

      expect(result.status.is_verified).toBe(true);
      expect(result.metadata.overrides.at(-1).reason).toContain('MISSING_COST');
    } finally {
      // Restored even on failure, so a later test still sees its own fixture.
      await Product.findByIdAndUpdate(product._id, {
        $set: { 'status.is_verified': false, 'status.lifecycle': 'review' },
      });
    }
  });

  it('still refuses a critical issue that was not waived', async () => {
    const candidates = await Product.find({ 'issues.severity': 'critical' }).lean();
    const product = candidates.find((entry) =>
      criticalCodes(entry).some((code) => code !== 'MISSING_COST'),
    );

    expect(product, 'fixtures should hold a product with a non-cost critical issue').toBeTruthy();

    await expect(
      productService.setVerification(String(product._id), {
        is_verified: true,
        allowIssueCodes: ['MISSING_COST'],
      }),
    ).rejects.toThrow(/critical issues/i);
  });

  it('verifies a clean product and moves it to approved', async () => {
    const product = await Product.findOne({ issues: { $size: 0 } }).lean()
      ?? await Product.findOne({ 'issues.severity': { $nin: ['critical'] } }).lean();

    const response = await request(app)
      .patch(`${API}/products/${product._id}/verify`)
      .send({ is_verified: true })
      .expect(200);

    expect(response.body.data.status.is_verified).toBe(true);
    expect(response.body.data.status.lifecycle).toBe('approved');
    expect(response.body.data.status.verified_at).toBeTruthy();
  });

  it('keeps a verified product approved across a re-import', async () => {
    const verified = await Product.findOne({ 'status.is_verified': true }).lean();
    await catalogService.ingest({ filePath: MASTER }, { sourceCatalog: 'master' });

    const after = await Product.findById(verified._id).lean();
    expect(after.status.is_verified).toBe(true);
    expect(after.status.lifecycle).toBe('approved');
  });
});

describeIf('POST /products + DELETE', () => {
  it('creates a product and locks every supplied field', async () => {
    const response = await request(app)
      .post(`${API}/products`)
      .send({
        name: 'Anker 737 Power Bank 24K',
        brand: 'Anker',
        sku: 'A1289-TEST',
        category: 'Power Banks',
        pricing: { currency: 'EGP', rdp: 4200, selling_price: 6800 },
        inventory: { quantity: 4, supplier: 'Anker' },
      })
      .expect(201);

    expect(response.body.data.pricing.margin_percentage).toBe(61.9);
    expect(response.body.data.metadata.locked_fields).toContain('pricing.rdp');
    expect(response.body.data.metadata.source_catalog).toBe('manual');
  });

  it('rejects a duplicate SKU on create', async () => {
    const response = await request(app)
      .post(`${API}/products`)
      .send({ name: 'Anker 737 again', brand: 'Anker', sku: 'A1289-TEST' })
      .expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('archives on a soft delete', async () => {
    const product = await findBySku('A1289-TEST');
    await request(app).delete(`${API}/products/${product._id}`).expect(200);

    const after = await Product.findById(product._id).lean();
    expect(after.status.is_active).toBe(false);
    expect(after.status.lifecycle).toBe('archived');
  });

  it('removes the document on a hard delete', async () => {
    const product = await findBySku('A1289-TEST');
    await request(app).delete(`${API}/products/${product._id}?hard=true`).expect(200);
    expect(await Product.findById(product._id).lean()).toBeNull();
  });
});

describeIf('quality endpoints', () => {
  it('summarises catalog quality', async () => {
    const response = await request(app).get(`${API}/quality/overview`).expect(200);
    expect(response.body.data.totals.products).toBeGreaterThan(0);
    expect(response.body.data.totals.average_score).toBeGreaterThan(0);
    expect(response.body.data.score_distribution.length).toBeGreaterThan(0);
  });

  it('separates true duplicates from reused supplier model codes', async () => {
    const response = await request(app).get(`${API}/quality/duplicates/sku`).expect(200);
    for (const group of response.body.data) {
      expect(['duplicate_row', 'reused_model_code']).toContain(group.kind);
      expect(group.count).toBeGreaterThan(1);
    }
  });

  it('explains a single product\'s score', async () => {
    const product = await findBySku('JR-TCG13');
    const response = await request(app).get(`${API}/quality/${product._id}/explain`).expect(200);
    expect(response.body.data.breakdown.completeness).toBeTruthy();
    expect(response.body.data.score).toBeGreaterThanOrEqual(0);
  });

  it('publishes the scoring rubric so a score is explainable', async () => {
    const response = await request(app).get(`${API}/quality/rubric`).expect(200);
    expect(response.body.data.completeness_weights.pricing).toBeTruthy();
    expect(response.body.data.issues.SELLING_BELOW_COST).toBeTruthy();
  });
});

describeIf('pricing endpoints', () => {
  it('quotes a margin without touching the catalog', async () => {
    const response = await request(app)
      .post(`${API}/pricing/quote`)
      .send({ rdp: 440, selling_price: 750, currency: 'EGP' })
      .expect(200);

    expect(response.body.data.margin_percentage).toBe(70.45);
    expect(response.body.data.gross_margin_percentage).toBe(41.33);
    expect(response.body.data.break_even_price).toBe(440);
    expect(response.body.data.price_for_target_margin).toBe(677.6);
  });

  it('lists low-margin and loss-making products', async () => {
    const response = await request(app).get(`${API}/pricing/alerts`).expect(200);
    for (const product of response.body.data) {
      expect(['loss', 'critical', 'low', 'implausible']).toContain(product.pricing.margin_band);
    }
  });

  it('suggests a price for a target margin and checks it against the market', async () => {
    const product = await findBySku('A2667');
    const response = await request(app)
      .get(`${API}/pricing/${product._id}/suggest?target_margin=40`)
      .expect(200);

    expect(response.body.data.suggested_selling_price).toBe(2331);
    // The plan's assumed street price tops out at 1,400 — below cost.
    expect(response.body.data.market.exceeds_market_high).toBe(true);
  });
});

describeIf('analytics endpoints', () => {
  it('reports inventory value in a single reporting currency', async () => {
    const response = await request(app).get(`${API}/analytics/summary`).expect(200);
    const data = response.body.data;

    expect(data.currency).toBe('EGP');
    expect(data.inventory_cost_value).toBeGreaterThan(0);
    expect(data.potential_gross_profit).toBe(
      Math.round((data.inventory_retail_value - data.inventory_cost_value) * 100) / 100,
    );
  });

  it('breaks inventory down by category', async () => {
    const response = await request(app)
      .get(`${API}/analytics/inventory-value?group_by=category`)
      .expect(200);
    expect(response.body.data.groups.length).toBeGreaterThan(1);
  });

  it('ranks the most profitable products', async () => {
    const response = await request(app).get(`${API}/analytics/top-profitable?limit=5`).expect(200);
    const profits = response.body.data.map((product) => product.total_profit);
    expect([...profits].sort((a, b) => b - a)).toEqual(profits);
  });

  it('totals the procurement baskets from quantity x verified cost', async () => {
    const response = await request(app).get(`${API}/analytics/procurement`).expect(200);
    const mustBuy = response.body.data.baskets.find((basket) => basket.basket === 'must_buy');
    expect(mustBuy.basket_cost).toBeGreaterThan(0);
    expect(response.body.data.committed_total.basket_cost).toBeGreaterThanOrEqual(mustBuy.basket_cost);
  });

  it('serves the whole dashboard in one call', async () => {
    const response = await request(app).get(`${API}/analytics/dashboard`).expect(200);
    expect(Object.keys(response.body.data)).toEqual(
      expect.arrayContaining(['summary', 'inventory_by_category', 'top_profitable', 'margin_bands']),
    );
  });
});

describeIf('catalog upload endpoint', () => {
  it('previews an uploaded workbook without persisting it', async () => {
    const before = await Product.countDocuments();

    const response = await request(app)
      .post(`${API}/catalog/preview`)
      .attach('file', PLAN)
      .expect(200);

    expect(response.body.data.totals.products).toBeGreaterThan(0);
    expect(response.body.data.sample.length).toBeGreaterThan(0);
    expect(await Product.countDocuments()).toBe(before);
  });

  it('imports an uploaded workbook', async () => {
    const response = await request(app)
      .post(`${API}/catalog/import`)
      .attach('file', PLAN)
      .field('source_catalog', 'action-plan')
      .expect(202);

    expect(response.body.data.status).toBe('completed');
    expect(response.body.data.source_catalog).toBe('action-plan');
  });

  it('rejects an unsupported file type', async () => {
    await request(app)
      .post(`${API}/catalog/import`)
      .attach('file', Buffer.from('not a spreadsheet'), 'notes.txt.exe')
      .expect(400);
  });

  it('rejects a request with no file', async () => {
    await request(app).post(`${API}/catalog/import`).expect(400);
  });
});

describeIf('service basics', () => {
  it('reports health', async () => {
    const response = await request(app).get('/health').expect(200);
    expect(response.body.data.database).toBe('connected');
  });

  it('404s an unknown route in the documented shape', async () => {
    const response = await request(app).get(`${API}/nope`).expect(404);
    expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});
