/**
 * The public storefront API.
 *
 * These tests exist for one reason above all: /products/public is the only
 * unauthenticated surface in the system, and the product document behind it
 * carries dealer cost, margins, supplier names and the verbatim source
 * spreadsheet row. The leak tests below are the guard rail — if someone adds a
 * field to the serializer without thinking, they fail.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import createApp from '../../src/app.js';
import Product from '../../src/modules/product/product.model.js';

const API = '/api/v1';

let server;
let app;
let publishedId;
let hiddenId;

/** A product built directly, so the test controls exactly what is published. */
const productFixture = (overrides = {}) => ({
  name: 'Test 65W GaN Charger',
  brand: 'Joyroom',
  sku: 'TEST-65W',
  category: 'Chargers',
  subcategory: 'Wall Chargers',
  description: { short: 'A 65W charger.', long: null },
  pricing: {
    currency: 'EGP',
    rdp: 900,
    rrp: 1800,
    selling_price: 1500,
    margin_percentage: 66.7,
    gross_margin_percentage: 40,
    margin_value: 600,
    market_low: 1400,
    market_high: 1900,
    normalized: { currency: 'EGP', rdp: 900, rrp: 1800, selling_price: 1500, fx_rate: 1 },
  },
  specs: { power_wattage: 65, cable_type: 'USB-C', condition: 'unknown', features: ['GaN'] },
  inventory: { quantity: 12, supplier: 'Cairo Wholesale Co', warehouse: 'Main' },
  status: { is_active: true, is_verified: true, is_draft: false },
  metadata: {
    source_catalog: 'ByteHub_Master_Catalog',
    source_row: 42,
    data_quality_score: 88,
    locked_fields: ['pricing.selling_price'],
    raw: { 'Cost EGP': '900', Supplier: 'Cairo Wholesale Co' },
  },
  images: [
    { path: 'Catalog/Charger/Test/a.jpg', url: '/Catalog/Charger/Test/a.jpg', is_primary: false, source: 'Charger/Test' },
    { path: 'Catalog/Charger/Test/b.jpg', url: '/Catalog/Charger/Test/b.jpg', is_primary: true, source: 'Charger/Test' },
  ],
  ...overrides,
});

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'bytehub_storefront_test' });
  app = createApp();

  const published = await Product.create(productFixture());
  publishedId = String(published._id);

  // Unverified: the exact state every freshly imported product is in.
  const hidden = await Product.create(
    productFixture({
      name: 'Unverified Cable',
      sku: 'TEST-HIDDEN',
      category: 'Cables',
      status: { is_active: true, is_verified: false, is_draft: false },
    }),
  );
  hiddenId = String(hidden._id);

  await Product.create(
    productFixture({
      name: 'Archived Power Bank',
      sku: 'TEST-ARCHIVED',
      category: 'Power Banks',
      status: { is_active: false, is_verified: true, is_draft: false },
    }),
  );

  // Verified but unpriced — publishable by flags, unsellable in practice.
  await Product.create(
    productFixture({
      name: 'Priceless Earbuds',
      sku: 'TEST-NOPRICE',
      category: 'Audio',
      pricing: { currency: 'EGP', selling_price: null, normalized: { currency: 'EGP' } },
      status: { is_active: true, is_verified: true, is_draft: false },
    }),
  );
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});

/* ------------------------------------------------------------------ */

describe('GET /products/public — what is visible', () => {
  it('returns only active, verified, priced products', async () => {
    const response = await request(app).get(`${API}/products/public`).expect(200);

    const names = response.body.data.map((product) => product.name);
    expect(names).toEqual(['Test 65W GaN Charger']);
    expect(response.body.meta.total).toBe(1);
  });

  it('cannot be talked into showing unverified products', async () => {
    // The storefront filter is server-owned: asking for the hidden ones by
    // query parameter must change nothing.
    const response = await request(app)
      .get(`${API}/products/public`)
      .query({ is_verified: 'false', is_active: 'false', is_draft: 'true' })
      .expect(200);

    expect(response.body.meta.total).toBe(1);
    expect(response.body.data[0].sku).toBe('TEST-65W');
  });

  it('404s an unverified product requested by id', async () => {
    await request(app).get(`${API}/products/public/${hiddenId}`).expect(404);
  });

  it('rejects a malformed handle rather than querying with it', async () => {
    // Product URLs are slugs now, so a slug-shaped handle is well-formed and
    // simply not found. Anything outside the slug alphabet never reaches Mongo.
    await request(app).get(`${API}/products/public/not-a-real-product`).expect(404);
    await request(app).get(`${API}/products/public/${encodeURIComponent('../../etc')}`).expect(400);
    await request(app).get(`${API}/products/public/${encodeURIComponent('Caps And Spaces')}`).expect(400);
  });

  it('serves a product by its slug, which is what the storefront links to', async () => {
    const list = await request(app).get(`${API}/products/public?limit=1`).expect(200);
    const { slug } = list.body.data[0];

    expect(slug).toBeTruthy();
    const response = await request(app).get(`${API}/products/public/${slug}`).expect(200);
    expect(response.body.data.slug).toBe(slug);
  });

  it('still resolves a legacy id, so older links keep working', async () => {
    const list = await request(app).get(`${API}/products/public?limit=1`).expect(200);
    const { id, slug } = list.body.data[0];

    const response = await request(app).get(`${API}/products/public/${id}`).expect(200);
    expect(response.body.data.slug).toBe(slug);
  });
});

describe('GET /products/public — what is exposed', () => {
  const INTERNAL_FIELDS = [
    'rdp',
    'margin_percentage',
    'gross_margin_percentage',
    'margin_value',
    'market_low',
    'market_high',
    'supplier',
    'Cairo Wholesale Co',
    'locked_fields',
    'data_quality_score',
    'source_catalog',
    'source_row',
    'fingerprint',
    'issues',
    'quantity',
    'verified_by',
  ];

  it('leaks no commercially sensitive field in the detail payload', async () => {
    const response = await request(app).get(`${API}/products/public/${publishedId}`).expect(200);
    const serialized = JSON.stringify(response.body);

    for (const field of INTERNAL_FIELDS) {
      expect(serialized, `"${field}" must not reach a customer`).not.toContain(field);
    }
  });

  it('leaks no commercially sensitive field in the list payload', async () => {
    const response = await request(app).get(`${API}/products/public`).expect(200);
    const serialized = JSON.stringify(response.body);

    for (const field of INTERNAL_FIELDS) {
      expect(serialized, `"${field}" must not reach a customer`).not.toContain(field);
    }
  });

  it('publishes the selling price and its currency, and nothing else about price', async () => {
    const response = await request(app).get(`${API}/products/public/${publishedId}`).expect(200);

    expect(response.body.data.price).toEqual({
      amount: 1500,
      currency: 'EGP',
      is_estimated: false,
    });
  });

  it('reports stock as a boolean, never as a count', async () => {
    const response = await request(app).get(`${API}/products/public/${publishedId}`).expect(200);
    expect(response.body.data.availability).toEqual({ in_stock: true });
  });

  it('puts the primary image first and drops the server-side path', async () => {
    const response = await request(app).get(`${API}/products/public/${publishedId}`).expect(200);

    expect(response.body.data.images[0].url).toBe('/Catalog/Charger/Test/b.jpg');
    expect(response.body.data.images[0]).not.toHaveProperty('path');
    expect(response.body.data.images[0]).not.toHaveProperty('source');
  });

  it("omits specs the catalog doesn't know, including the 'unknown' condition", async () => {
    const response = await request(app).get(`${API}/products/public/${publishedId}`).expect(200);

    expect(response.body.data.specs).toMatchObject({ power_wattage: 65, cable_type: 'USB-C' });
    expect(response.body.data.specs).not.toHaveProperty('condition');
    expect(response.body.data.specs).not.toHaveProperty('battery_capacity');
  });
});

describe('GET /products/public — browsing', () => {
  it('matches a partial word so search-as-you-type works', async () => {
    // "char" is a prefix, not a word: a $text search would return nothing.
    const response = await request(app)
      .get(`${API}/products/public`)
      .query({ search: 'char' })
      .expect(200);

    expect(response.body.meta.total).toBe(1);
  });

  it('treats search input as text, not as a regular expression', async () => {
    const response = await request(app)
      .get(`${API}/products/public`)
      .query({ search: '65W (GaN' })
      .expect(200);

    expect(response.body.meta.total).toBe(0);
  });

  it('filters by category and brand', async () => {
    await request(app)
      .get(`${API}/products/public`)
      .query({ category: 'Chargers' })
      .expect(200)
      .expect((response) => expect(response.body.meta.total).toBe(1));

    await request(app)
      .get(`${API}/products/public`)
      .query({ category: 'Cables' })
      .expect(200)
      .expect((response) => expect(response.body.meta.total).toBe(0));

    // brand_key is lowercased on the model; the filter must not be case-bound.
    await request(app)
      .get(`${API}/products/public`)
      .query({ brand: 'joyroom' })
      .expect(200)
      .expect((response) => expect(response.body.meta.total).toBe(1));
  });

  it('filters by price range', async () => {
    await request(app)
      .get(`${API}/products/public`)
      .query({ min_price: 1000, max_price: 2000 })
      .expect(200)
      .expect((response) => expect(response.body.meta.total).toBe(1));

    await request(app)
      .get(`${API}/products/public`)
      .query({ min_price: 5000 })
      .expect(200)
      .expect((response) => expect(response.body.meta.total).toBe(0));
  });

  it('rejects an inverted price range and an unknown sort', async () => {
    await request(app)
      .get(`${API}/products/public`)
      .query({ min_price: 900, max_price: 100 })
      .expect(400);

    await request(app).get(`${API}/products/public`).query({ sort: 'margin' }).expect(400);
  });

  it('caps the page size so the whole catalog cannot be pulled in one request', async () => {
    await request(app).get(`${API}/products/public`).query({ limit: 500 }).expect(400);
  });
});

describe('GET /products/public/facets', () => {
  it('never offers a category the taxonomy does not recognise', async () => {
    // A source row whose category cell held a product description ("Joyroom
    // stylus pen") used to become a category in the shop's own navigation.
    const junk = await Product.create(
      productFixture({
        name: 'Mystery Gadget',
        sku: 'TEST-JUNK',
        category: 'Joyroom stylus pen',
        subcategory: null,
      }),
    );

    const response = await request(app).get(`${API}/products/public/facets`).expect(200);
    const names = response.body.data.categories.map((entry) => entry.name);

    expect(names).not.toContain('Joyroom stylus pen');
    expect(names).toContain('Chargers');
    // The product is still on sale and still findable — only the navigation
    // is restricted, not the catalog.
    expect(response.body.data.total).toBe(2);

    await Product.findByIdAndDelete(junk._id);
  });

  it('counts only published products', async () => {
    const response = await request(app).get(`${API}/products/public/facets`).expect(200);

    expect(response.body.data.total).toBe(1);
    expect(response.body.data.categories).toEqual([{ name: 'Chargers', count: 1 }]);
    expect(response.body.data.brands).toEqual([{ name: 'Joyroom', count: 1 }]);
    expect(response.body.data.price).toEqual({ min: 1500, max: 1500 });
  });
});
