#!/usr/bin/env node
/**
 * Smoke tests against a running shop.
 *
 * The unit and integration suites cover what the code does. These cover what
 * the *deployment* does, which is not the same thing and has been wrong in
 * ways nothing else caught: an image optimizer that answered 200 while serving
 * the untouched original, a canonical link inherited from the root layout that
 * marked the whole catalog as duplicate, a category page whose HTML contained
 * no products at all. Every one of those is a 200 to a status-code check.
 *
 *   node scripts/smoke.mjs                          # http://127.0.0.1:3001
 *   node scripts/smoke.mjs --shop https://shop.eg
 *
 * Exits non-zero on the first failing group's summary, printing what was
 * expected and what came back.
 */

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const SHOP = argOf('--shop', process.env.SMOKE_SHOP_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const TIMEOUT = Number(argOf('--timeout', '30000'));
const VERBOSE = args.includes('--verbose');

const BROWSER_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,*/*;q=0.8';

/* ---------------------------------------------------------------- harness */

const results = [];
let group = '';

const startGroup = (name) => {
  group = name;
  process.stdout.write(`\n${name}\n`);
};

async function check(what, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ group, what, ok: true });
    process.stdout.write(`  ok    ${what}${detail ? `  — ${detail}` : ''}\n`);
  } catch (error) {
    results.push({ group, what, ok: false, error });
    process.stdout.write(`  FAIL  ${what}\n        ${error.message}\n`);
  }
  if (VERBOSE) process.stdout.write(`        (${Date.now() - started}ms)\n`);
}

const fail = (message) => {
  throw new Error(message);
};

const expectStatus = (response, expected, where) => {
  if (response.status !== expected) {
    fail(`${where} returned ${response.status}, expected ${expected}`);
  }
};

/* ------------------------------------------------------------------ fetch */

async function get(path, { accept, method = 'GET' } = {}) {
  const url = path.startsWith('http') ? path : `${SHOP}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(url, {
      method,
      redirect: 'manual',
      headers: accept ? { accept } : undefined,
      signal: controller.signal,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      headers: response.headers,
      bytes: buffer.length,
      text: () => buffer.toString('utf8'),
      json: () => JSON.parse(buffer.toString('utf8')),
    };
  } catch (error) {
    fail(`${method} ${url} — ${error.name === 'AbortError' ? `no response in ${TIMEOUT}ms` : error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------------------------------------------------- markup */

const canonicalOf = (html) => html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null;

const jsonLdOf = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((match) =>
    JSON.parse(match[1]),
  );

/** Distinct product URLs present as real anchors, not as serialised payload. */
const productLinksOf = (html) =>
  new Set(
    [...html.matchAll(/<a [^>]*href="(\/products\/[a-z0-9][a-z0-9-]*)"/g)].map((match) => match[1]),
  );

const optimiserUrlsOf = (html) =>
  [...html.matchAll(/\/_next\/image\?url=[^"' ]+/g)].map((match) => match[0].replace(/&amp;/g, '&'));

/* ------------------------------------------------------------------ suite */

console.log(`ByteHub smoke — ${SHOP}`);

let published = [];
let facets = null;

startGroup('reachable');

await check('the shop answers', async () => {
  const response = await get('/');
  expectStatus(response, 200, 'GET /');
  return `${response.bytes} bytes`;
});

await check('the catalog API answers through the shop', async () => {
  const response = await get('/api/v1/products/public/sitemap');
  expectStatus(response, 200, 'the sitemap endpoint');
  published = response.json().data ?? [];
  if (published.length === 0) fail('no published products — the shop has nothing to sell');
  return `${published.length} published`;
});

await check('facets are served', async () => {
  const response = await get('/api/v1/products/public/facets');
  expectStatus(response, 200, 'the facets endpoint');
  facets = response.json().data;
  if (!facets?.categories?.length) fail('no categories');
  return facets.categories.map((entry) => `${entry.name}=${entry.count}`).join(' ');
});

startGroup('the back office is not there');

for (const path of [
  '/api/v1/catalog',
  '/api/v1/pricing',
  '/api/v1/quality',
  '/api/v1/analytics',
  '/api/v1/products',
  '/api/v1/products/import',
]) {
  await check(`404 ${path}`, async () => {
    const response = await get(path);
    if (response.status !== 404) {
      fail(`reachable (${response.status}) — cost, margin and supplier data are behind these`);
    }
  });
}

for (const method of ['POST', 'PATCH', 'DELETE']) {
  await check(`404 ${method} /api/v1/products/:id`, async () => {
    const response = await get('/api/v1/products/6a720620267f7e4b8ba9244f', { method });
    if (response.status !== 404) fail(`writeable (${response.status})`);
  });
}

await check('no internal fields in any public payload', async () => {
  const forbidden = /rdp|cost|margin|supplier|quality|fingerprint|locked|source_row|is_draft|is_verified|_raw/i;
  const found = new Set();

  const walk = (value, path = '') => {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      const next = path ? `${path}.${key}` : key;
      if (forbidden.test(key)) found.add(next);
      walk(value[key], next);
    }
  };

  walk((await get('/api/v1/products/public')).json().data);
  for (const entry of published.slice(0, 5)) {
    walk((await get(`/api/v1/products/public/${entry.slug}`)).json().data);
  }

  if (found.size > 0) fail(`leaked: ${[...found].join(', ')}`);
  return `${published.length ? 'checked list + 5 detail payloads' : 'checked list'}`;
});

startGroup('product pages');

await check('every published product is reachable', async () => {
  const broken = [];
  for (const entry of published) {
    const response = await get(`/products/${entry.slug}`);
    if (response.status !== 200) broken.push(`${entry.slug} → ${response.status}`);
  }
  if (broken.length > 0) fail(broken.join(', '));
  return `${published.length}/${published.length}`;
});

await check('an unknown slug is a real 404, not an empty 200', async () => {
  const response = await get('/products/definitely-not-a-real-product-slug');
  if (response.status === 200) {
    fail('200 — a soft 404 lets a crawler index unlimited junk URLs as real pages');
  }
  expectStatus(response, 404, 'an unknown slug');
});

startGroup('search visibility');

await check('the catalog does not canonicalise to the home page', async () => {
  const canonical = canonicalOf((await get('/products')).text());
  if (!canonical) fail('no canonical link at all');
  if (!/\/products$/.test(canonical)) {
    fail(`canonical is ${canonical} — anything but /products tells Google the catalog is a duplicate`);
  }
  return canonical;
});

await check('each category canonicalises to itself', async () => {
  const category = facets.categories[0].name;
  const canonical = canonicalOf((await get(`/products?category=${encodeURIComponent(category)}`)).text());
  const expected = `/products?category=${encodeURIComponent(category)}`;
  if (!canonical?.endsWith(expected)) fail(`canonical is ${canonical}, expected one ending ${expected}`);
  return canonical;
});

await check('a product canonicalises to its slug URL', async () => {
  const { slug } = published[0];
  const canonical = canonicalOf((await get(`/products/${slug}`)).text());
  if (!canonical?.endsWith(`/products/${slug}`)) fail(`canonical is ${canonical}`);
  if (/[0-9a-f]{24}/.test(canonical)) fail('canonical still carries a database id');
  return canonical;
});

await check('a product page carries Product, Offer and BreadcrumbList data', async () => {
  const html = (await get(`/products/${published[0].slug}`)).text();
  const blocks = jsonLdOf(html);
  const types = blocks.map((block) => block['@type']);

  for (const required of ['Product', 'BreadcrumbList', 'Store']) {
    if (!types.includes(required)) fail(`no ${required} — found ${types.join(', ') || 'nothing'}`);
  }

  const product = blocks.find((block) => block['@type'] === 'Product');
  const api = (await get(`/api/v1/products/public/${published[0].slug}`)).json().data;

  if (api.price?.amount > 0) {
    if (!product.offers) fail('the catalog has a price but the markup carries no offer');
    if (product.offers.price !== String(api.price.amount)) {
      fail(`markup says ${product.offers.price}, the catalog says ${api.price.amount}`);
    }
  } else if (product.offers) {
    fail('an offer was published for a product with no price');
  }

  return types.join(', ');
});

await check('the breadcrumb markup matches the visible trail', async () => {
  const html = (await get(`/products/${published[0].slug}`)).text();
  const trail = jsonLdOf(html).find((block) => block['@type'] === 'BreadcrumbList');
  const names = trail.itemListElement.map((entry) => entry.name);

  const nav = html.match(/<nav aria-label="Breadcrumb"[^>]*>(.*?)<\/nav>/s)?.[1] ?? '';
  const visible = [...nav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((match) => match[1].trim());

  if (visible.length === 0) fail('no visible breadcrumb to compare against');
  if (names.join(' > ') !== visible.join(' > ')) {
    fail(`markup "${names.join(' > ')}" vs visible "${visible.join(' > ')}"`);
  }
  return names.join(' > ');
});

await check('the sitemap lists every published product', async () => {
  const response = await get('/sitemap.xml');
  expectStatus(response, 200, 'GET /sitemap.xml');
  const xml = response.text();
  const missing = published.filter((entry) => !xml.includes(`/products/${entry.slug}`));
  if (missing.length > 0) fail(`${missing.length} missing, e.g. ${missing[0].slug}`);
  return `${(xml.match(/<loc>/g) ?? []).length} URLs`;
});

await check('robots.txt points at the sitemap', async () => {
  const response = await get('/robots.txt');
  expectStatus(response, 200, 'GET /robots.txt');
  if (!/^Sitemap:\s*http/m.test(response.text())) fail('no Sitemap: line');
});

startGroup('server-rendered HTML');

await check('the catalog ships its products in the markup', async () => {
  const links = productLinksOf((await get('/products')).text());
  if (links.size === 0) {
    fail('no product links — a client-rendered grid is invisible to anything that does not run JS');
  }
  if (links.size !== published.length) {
    fail(`${links.size} links for ${published.length} published products`);
  }
  return `${links.size} products`;
});

await check('each category page renders its own products', async () => {
  const wrong = [];
  for (const category of facets.categories) {
    const html = (await get(`/products?category=${encodeURIComponent(category.name)}`)).text();
    const links = productLinksOf(html);
    if (links.size !== category.count) wrong.push(`${category.name}: ${links.size} of ${category.count}`);
  }
  if (wrong.length > 0) fail(wrong.join(', '));
  return facets.categories.map((entry) => `${entry.name}=${entry.count}`).join(' ');
});

await check('the home page links to products', async () => {
  const links = productLinksOf((await get('/')).text());
  if (links.size === 0) fail('no product links in the home page markup');
  return `${links.size} products`;
});

startGroup('images');

await check('photos are served', async () => {
  const html = (await get(`/products/${published[0].slug}`)).text();
  const urls = optimiserUrlsOf(html);
  if (urls.length === 0) fail('no optimised image URLs on the product page');
  const response = await get(urls[0], { accept: BROWSER_ACCEPT });
  expectStatus(response, 200, urls[0].slice(0, 60));
  return `${urls.length} on the page`;
});

await check('the optimiser actually optimises', async () => {
  // Without sharp, Next answers 200 and hands back the untouched source file.
  // Nothing about the status code says so, which is how a shop ends up serving
  // 24 MB of unprocessed supplier photos while every check passes.
  //
  // Verified by hiding sharp in a running container: with a cold image cache
  // this fails with the content type as evidence. Note the "cold" — Next
  // serves .next/cache/images without consulting sharp at all, so re-running
  // this against a long-lived deployment can pass on cached output. In CI the
  // container is new, which is the case that matters.
  const html = (await get('/products')).text();
  const url = optimiserUrlsOf(html).find((entry) => /[?&]w=(96|128|200|256|384)\b/.test(entry));
  if (!url) fail('no small-width optimiser URL on the catalog page');

  // The optimiser's `url` param is a decoded path; fetching it back needs each
  // segment re-encoded, because the catalog folders have spaces and ampersands
  // in their names.
  const source = decodeURIComponent(new URL(url, SHOP).searchParams.get('url'));
  const original = await get(source.split('/').map(encodeURIComponent).join('/'));
  const optimised = await get(url, { accept: BROWSER_ACCEPT });

  expectStatus(optimised, 200, 'the optimiser');
  if (original.status !== 200) fail(`the source photo is ${original.status} at ${source}`);

  const type = optimised.headers.get('content-type') ?? '';
  if (!/avif|webp/.test(type)) {
    fail(`served ${type} — sharp is probably missing, so the original is being passed through`);
  }
  if (optimised.bytes >= original.bytes) {
    fail(`${optimised.bytes} bytes from a ${original.bytes} byte source — no re-encoding happened`);
  }

  const saving = Math.round((1 - optimised.bytes / original.bytes) * 100);
  return `${original.bytes} → ${optimised.bytes} bytes (${saving}% smaller, ${type})`;
});

startGroup('headers');

await check('the security headers are set', async () => {
  const { headers } = await get(`/products/${published[0].slug}`);
  const required = {
    'x-content-type-options': /nosniff/,
    'x-frame-options': /SAMEORIGIN|DENY/i,
    'referrer-policy': /strict-origin/,
  };
  for (const [name, pattern] of Object.entries(required)) {
    const value = headers.get(name);
    if (!value || !pattern.test(value)) fail(`${name} is ${value ?? 'absent'}`);
  }
  return Object.keys(required).join(', ');
});

await check('product pages are cacheable by a CDN', async () => {
  const value = (await get(`/products/${published[0].slug}`)).headers.get('cache-control') ?? '';
  if (!/s-maxage=\d+/.test(value)) fail(`cache-control is "${value}"`);
  return value;
});

/* ---------------------------------------------------------------- summary */

const failed = results.filter((result) => !result.ok);

console.log(`\n${'-'.repeat(60)}`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);

if (failed.length > 0) {
  console.log(`\n${failed.length} failed:`);
  for (const result of failed) console.log(`  ${result.group} — ${result.what}`);
  process.exit(1);
}

console.log('The deployment is serving what it claims to serve.');
