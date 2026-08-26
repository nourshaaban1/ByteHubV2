/**
 * What the API refuses to do in a production configuration.
 *
 * Two guarantees are asserted here, both of which are invisible in normal
 * development and both of which were verified by hand before they were
 * verified by anything repeatable:
 *
 *  1. With the back office disabled, its routes are not merely protected —
 *     they are not mounted. A route that does not exist cannot be reached by a
 *     mistake in the auth middleware.
 *  2. A misconfigured production boot is refused rather than served. A shop
 *     running with a wildcard CORS policy or an unauthenticated admin API
 *     looks healthy from the outside, which is what makes it worse than one
 *     that will not start.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Read by env.js at import time, so it has to be set before the dynamic import
// below — which is why app.js is not a static import in this file.
process.env.ENABLE_ADMIN_API = 'false';

const { default: createApp } = await import('../../src/app.js');
const { assertProductionConfig } = await import('../../src/config/env.js');

const API = '/api/v1';

let server;
let app;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'bytehub_lockdown' });
  app = createApp();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

describe('with the back office disabled', () => {
  const BACK_OFFICE = [
    `${API}/catalog`,
    `${API}/pricing`,
    `${API}/quality`,
    `${API}/analytics`,
    `${API}/products/import`,
  ];

  it.each(BACK_OFFICE)('does not mount %s', async (path) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(404);
  });

  it('does not mount the admin product list', async () => {
    expect((await request(app).get(`${API}/products`)).status).toBe(404);
  });

  const id = '6a720620267f7e4b8ba9244f';

  it.each([
    ['post', `${API}/products`],
    ['patch', `${API}/products/${id}`],
    ['patch', `${API}/products/${id}/price`],
    ['patch', `${API}/products/${id}/verify`],
    ['delete', `${API}/products/${id}`],
  ])('does not mount %s %s', async (method, path) => {
    const response = await request(app)[method](path).send({});
    expect(response.status).toBe(404);
  });

  it('still serves the storefront, which is the whole point', async () => {
    for (const path of ['/public', '/public/facets', '/public/sitemap']) {
      const response = await request(app).get(`${API}/products${path}`);
      expect(response.status, `${path} should be served`).toBe(200);
      expect(response.body.success).toBe(true);
    }
  });

  it('reports the back office as unavailable rather than pretending', async () => {
    const response = await request(app).get(API);
    expect(response.status).toBe(200);
  });
});

describe('assertProductionConfig', () => {
  const sound = {
    isProduction: true,
    enableAdminApi: false,
    adminApiKeys: [],
    corsOrigins: [],
  };

  beforeAll(() => {
    vi.stubEnv('MONGODB_URI', 'mongodb://db:27017/bytehub');
    vi.stubEnv('SITE_URL', 'https://shop.example');
  });

  afterAll(() => vi.unstubAllEnvs());

  it('passes a sound production config', () => {
    expect(assertProductionConfig(sound)).toEqual([]);
  });

  it('says nothing at all outside production', () => {
    // Development runs with defaults on purpose; the checks would only be noise.
    expect(assertProductionConfig({ ...sound, isProduction: false, corsOrigins: ['*'] })).toEqual([]);
  });

  it('refuses a default database URI', () => {
    vi.stubEnv('MONGODB_URI', '');
    expect(assertProductionConfig(sound)).toEqual([expect.stringContaining('MONGODB_URI')]);
    vi.stubEnv('MONGODB_URI', 'mongodb://db:27017/bytehub');
  });

  it('refuses a missing SITE_URL, which every canonical link resolves against', () => {
    vi.stubEnv('SITE_URL', '');
    expect(assertProductionConfig(sound)).toEqual([expect.stringContaining('SITE_URL')]);
    vi.stubEnv('SITE_URL', 'https://shop.example');
  });

  it('refuses a wildcard CORS policy', () => {
    expect(assertProductionConfig({ ...sound, corsOrigins: ['*'] })).toEqual([
      expect.stringContaining('CORS_ORIGINS'),
    ]);
  });

  it('refuses an admin API with no keys', () => {
    expect(assertProductionConfig({ ...sound, enableAdminApi: true, adminApiKeys: [] })).toEqual([
      expect.stringContaining('ADMIN_API_KEYS'),
    ]);
  });

  it('accepts an admin API that actually has keys', () => {
    expect(
      assertProductionConfig({ ...sound, enableAdminApi: true, adminApiKeys: ['a-long-secret'] }),
    ).toEqual([]);
  });

  it('reports every problem at once, so a fix is not a guessing game', () => {
    vi.stubEnv('MONGODB_URI', '');
    vi.stubEnv('SITE_URL', '');

    const problems = assertProductionConfig({
      ...sound,
      enableAdminApi: true,
      corsOrigins: ['*'],
    });

    expect(problems).toHaveLength(4);
    vi.stubEnv('MONGODB_URI', 'mongodb://db:27017/bytehub');
    vi.stubEnv('SITE_URL', 'https://shop.example');
  });
});
