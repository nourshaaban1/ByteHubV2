/**
 * Covers the endpoints the admin UI depends on: bulk fixes for the quality
 * queue, and image folder management.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import createApp from '../../src/app.js';
import catalogService from '../../src/modules/catalog/catalog.service.js';
import Product from '../../src/modules/product/product.model.js';

const ROOT = process.cwd();
const MASTER = path.join(ROOT, 'Old Catalog', 'ByteHub_Master_Catalog.xlsx');
const CATALOG_DIR = path.join(ROOT, 'New Catalog');
const API = '/api/v1';

let server;
let app;

const skip = !fs.existsSync(MASTER);
const describeIf = skip ? describe.skip : describe;
const hasImages = fs.existsSync(CATALOG_DIR);

beforeAll(async () => {
  if (skip) return;
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'bytehub_admin_test' });
  app = createApp();
  await catalogService.ingest({ filePath: MASTER }, { sourceCatalog: 'master' });
}, 180_000);

afterAll(async () => {
  if (skip) return;
  await mongoose.disconnect();
  await server.stop();
});

describeIf('PATCH /products/bulk', () => {
  it('applies several fixes and reports each outcome', async () => {
    const products = await Product.find().limit(3).lean();

    const response = await request(app)
      .patch(`${API}/products/bulk`)
      .send({
        reason: 'Stock count 2026-08',
        updates: products.map((product) => ({
          id: String(product._id),
          patch: { inventory: { quantity: 7 } },
        })),
      })
      .expect(200);

    expect(response.body.data.total).toBe(3);
    expect(response.body.data.updated).toBe(3);
    expect(response.body.data.failed).toBe(0);

    for (const product of products) {
      const after = await Product.findById(product._id).lean();
      expect(after.inventory.quantity).toBe(7);
      expect(after.metadata.locked_fields).toContain('inventory.quantity');
    }
  });

  it('reports per-item failures instead of failing the whole batch', async () => {
    const product = await Product.findOne().lean();

    const response = await request(app)
      .patch(`${API}/products/bulk`)
      .send({
        updates: [
          { id: String(product._id), patch: { inventory: { quantity: 12 } } },
          { id: String(new mongoose.Types.ObjectId()), patch: { inventory: { quantity: 5 } } },
        ],
      })
      .expect(207); // multi-status: the batch ran, one item did not

    expect(response.body.data.updated).toBe(1);
    expect(response.body.data.failed).toBe(1);
    expect(response.body.data.results[1]).toMatchObject({ status: 'failed', code: 'NOT_FOUND' });

    // The item that succeeded really was written.
    expect((await Product.findById(product._id).lean()).inventory.quantity).toBe(12);
  });

  it('reports an unchanged item distinctly from an updated one', async () => {
    const product = await Product.findOne().lean();
    const response = await request(app)
      .patch(`${API}/products/bulk`)
      .send({ updates: [{ id: String(product._id), patch: { inventory: { quantity: 12 } } }] })
      .expect(200);

    expect(response.body.data.results[0].status).toBe('unchanged');
  });

  it('rejects an empty batch', async () => {
    await request(app).patch(`${API}/products/bulk`).send({ updates: [] }).expect(400);
  });

  it('rejects a batch containing a non-editable field', async () => {
    const product = await Product.findOne().lean();
    await request(app)
      .patch(`${API}/products/bulk`)
      .send({
        updates: [{ id: String(product._id), patch: { metadata: { data_quality_score: 100 } } }],
      })
      .expect(400);
  });

  it('recomputes margin after a bulk price fix', async () => {
    const product = await Product.findOne({ 'pricing.rdp': { $gt: 0 } }).lean();

    await request(app)
      .patch(`${API}/products/bulk`)
      .send({
        updates: [
          { id: String(product._id), patch: { pricing: { selling_price: product.pricing.rdp * 2 } } },
        ],
      })
      .expect(200);

    const after = await Product.findById(product._id).lean();
    expect(after.pricing.margin_percentage).toBe(100);
    expect(after.pricing.margin_band).toBe('target');
  });
});

describeIf('GET /catalog/images', () => {
  it('lists folders with link state and ranked suggestions', async () => {
    const response = await request(app).get(`${API}/catalog/images`).expect(200);
    const data = response.body.data;

    expect(data.totals.folders).toBeGreaterThanOrEqual(0);
    if (!hasImages || data.totals.folders === 0) return;

    const folder = data.folders[0];
    expect(folder).toHaveProperty('images');
    expect(folder).toHaveProperty('linked_product');
    expect(folder).toHaveProperty('suggestions');

    // Suggestions are ranked, and each is labelled against the threshold —
    // the UI decides, the API does not link on its own.
    const scores = folder.suggestions.map((entry) => entry.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    for (const suggestion of folder.suggestions) {
      expect(suggestion.above_threshold).toBe(suggestion.score >= data.threshold);
    }
  });

  it('reports products that have no images', async () => {
    const response = await request(app).get(`${API}/catalog/images`).expect(200);
    expect(Array.isArray(response.body.data.products_without_images)).toBe(true);
  });
});

describeIf('POST /catalog/images/auto-link', () => {
  it('defaults to a dry run and writes nothing', async () => {
    const before = await Product.countDocuments({ 'images.0': { $exists: true } });

    const response = await request(app).post(`${API}/catalog/images/auto-link`).send({}).expect(200);
    expect(response.body.data.dry_run).toBe(true);

    expect(await Product.countDocuments({ 'images.0': { $exists: true } })).toBe(before);
  });

  it('refuses a threshold low enough to attach unrelated images', async () => {
    await request(app)
      .post(`${API}/catalog/images/auto-link`)
      .send({ threshold: 0.05 })
      .expect(400);
  });

  it('never assigns one product to two folders', async () => {
    const response = await request(app)
      .post(`${API}/catalog/images/auto-link`)
      .send({ dry_run: true })
      .expect(200);

    const productIds = response.body.data.matches.map((match) => match.product._id);
    const folders = response.body.data.matches.map((match) => match.folder);
    expect(new Set(productIds).size).toBe(productIds.length);
    expect(new Set(folders).size).toBe(folders.length);
  });
});

describeIf('POST /catalog/images/link', () => {
  it('links a folder to a product of the operator\'s choosing', async () => {
    const overview = await request(app).get(`${API}/catalog/images`).expect(200);
    if (overview.body.data.folders.length === 0) return;

    const folder = overview.body.data.folders[0];
    const product = await Product.findOne().lean();

    const response = await request(app)
      .post(`${API}/catalog/images/link`)
      .send({ folder: folder.id, product_id: String(product._id) })
      .expect(200);

    expect(response.body.data.images_linked).toBe(folder.image_count);

    const after = await Product.findById(product._id).lean();
    expect(after.images).toHaveLength(folder.image_count);
    expect(after.images[0].source).toBe(folder.id);
    expect(after.images[0].is_primary).toBe(true);
  });

  it('moves a folder off its previous product rather than duplicating it', async () => {
    const overview = await request(app).get(`${API}/catalog/images`).expect(200);
    if (overview.body.data.folders.length === 0) return;

    const folder = overview.body.data.folders[0];
    const [first, second] = await Product.find().limit(2).lean();

    await request(app)
      .post(`${API}/catalog/images/link`)
      .send({ folder: folder.id, product_id: String(first._id) })
      .expect(200);
    await request(app)
      .post(`${API}/catalog/images/link`)
      .send({ folder: folder.id, product_id: String(second._id) })
      .expect(200);

    expect((await Product.findById(first._id).lean()).images).toHaveLength(0);
    expect((await Product.findById(second._id).lean()).images.length).toBeGreaterThan(0);
  });

  it('404s an unknown folder', async () => {
    const product = await Product.findOne().lean();
    await request(app)
      .post(`${API}/catalog/images/link`)
      .send({ folder: 'Nope/Does Not Exist', product_id: String(product._id) })
      .expect(404);
  });

  it('unlinks', async () => {
    const product = await Product.findOne({ 'images.0': { $exists: true } }).lean();
    if (!product) return;

    await request(app)
      .post(`${API}/catalog/images/unlink`)
      .send({ product_id: String(product._id) })
      .expect(200);

    expect((await Product.findById(product._id).lean()).images).toHaveLength(0);
  });
});
