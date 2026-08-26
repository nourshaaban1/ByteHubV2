# ByteHub

[![CI](https://github.com/nourshaaban1/ByteHubV2/actions/workflows/ci.yml/badge.svg)](https://github.com/nourshaaban1/ByteHubV2/actions/workflows/ci.yml)

An online storefront for hardware and mobile accessories — chargers, cables, power banks and audio — and the catalog API behind it.

ByteHub sells in person. The shop's job is to get a customer to the point of knowing exactly what they want, then hand them to a human on WhatsApp or the phone. There is no cart and no checkout, which makes **search visibility and page speed the whole conversion funnel**.

```
apps/storefront/   the shop            Next.js 14 · Tailwind · port 3001
src/               the catalog API     Express · MongoDB · port 4000
catalog/           the product data    a reviewed, evidence-backed manifest
New Catalog/       product photos      one folder per product
archive/web/       the old admin UI    archived — see archive/README.md
```

- **447 tests** — 398 API, 49 storefront — plus 29 smoke checks against the deployed stack
- Every page is **rendered on the server** on slug URLs, with Schema.org structured data

---

## Quick start

```bash
npm install && npm --prefix apps/storefront install
```

```bash
cp .env.example .env && cp apps/storefront/.env.example apps/storefront/.env.local
```

Start MongoDB, then load the catalog:

```bash
npm run catalog -- --commit
```

```bash
npm run publish -- --commit
```

Run the API and the shop in two terminals:

```bash
npm run dev
```

```bash
npm run shop
```

The shop is on <http://localhost:3001>, the API on <http://localhost:4000/api/v1>.

```bash
npm run test:all
```

> Integration tests spin up an in-memory MongoDB automatically — no local database needed.

---

## Deploying

```bash
cp .env.production.example .env
```

Set `SITE_URL` to the real https origin — canonical links, the sitemap and every Open Graph image resolve against it.

Bring up the data layer first, then load the catalog:

```bash
docker compose up -d mongo api
```

```bash
docker compose run --rm api npm run catalog -- --commit
```

```bash
docker compose run --rm api npm run publish -- --commit
```

Now build the shop. **The order matters**: every product page is pre-rendered, so the catalog has to exist and the API has to be reachable before this image is built. Building the whole stack in one shot would compile the shop against an empty database and ship a site with no products — so the build fails outright if it cannot reach a published catalog, rather than succeeding and 404ing every product URL.

```bash
docker compose build storefront
```

```bash
docker compose up -d storefront
```

MongoDB is reachable only inside the network. The storefront is published normally; the API is published on **loopback only** (`127.0.0.1:4000`), because the storefront's image is built against it — BuildKit refuses to join a named compose network, so the build runs on the host's network stack and reaches the API the one way available there. It is not reachable from another machine, and its back-office routes are not mounted at all.

The server **refuses to boot** on a misconfigured production environment rather than starting in an unsafe state — no `MONGODB_URI`, no `SITE_URL`, a wildcard `CORS_ORIGINS`, or admin routes enabled with no API keys.

### After publishing new products

Product pages and the sitemap are generated at build time, so a newly published product needs a storefront rebuild to become reachable:

```bash
docker compose build storefront && docker compose up -d storefront
```

---

## How the shop is built for search

For a business whose only conversion path is "customer finds product, customer messages shop", these are the features, not the polish.

**Slug URLs.** `/products/joyroom-jr-tcg13-gan-wall-charger-45w-usb-c`, not a MongoDB id. The API resolves both, so any older link still works.

**Server-rendered.** Every page is real HTML with the products, prices and specs already in it — product pages generated at build time, the catalog rendered per request so a category filter is a real page rather than an empty grid waiting on JavaScript. That matters as much for a phone on Egyptian mobile data as it does for a crawler.

The catalog grid stays interactive: the client component that owns filtering is handed the same result the server already fetched, under the same cache key, so hydration continues from that page instead of replacing it.

**Structured data.** Each product page carries a Schema.org `Product` with price, currency, availability, brand and SKU — the difference between a plain blue link and a result with a price on it — plus a `BreadcrumbList` built from the same trail the customer sees. The site itself is marked up as a `Store` with a search action.

Only fields the catalog actually knows are emitted. An invented `gtin` or a guessed `priceValidUntil` is a manual-action risk, not a ranking boost.

**One canonical per page.** The home page, the catalog and each category declare their own. A canonical set once in the root layout is inherited by every page that does not override it, which quietly tells search engines the whole shop is a duplicate of its front door.

**Real 404s.** An unknown slug returns a genuine 404 rather than an empty page with a 200. Soft 404s are how a shop ends up with unlimited junk URLs indexed as real pages.

**A sitemap and a crawl budget.** `/sitemap.xml` lists every published product with its true last-modified date. `robots.txt` blocks filtered and sorted catalog URLs, which are the same products in a different order.

**Images.** The catalog ships 24 MB of unprocessed supplier photos, several over 1 MB. They are re-encoded to AVIF at the width actually requested. Measured across the product grid in the running container: **981 KB → 97 KB, a 90% saving.**

This needs `sharp`, which Next requires explicitly in standalone mode. Without it the optimizer does not fail — it quietly serves the original file at every size, which is how the deployed shop was shipping raw supplier photos while every request still returned 200.

---

## The catalog

`New Catalog/` is the product list: **28 products across Cables, Chargers, Audio and Power Banks**, with 191 photos. One folder is one product.

Folder names cannot supply prices, SKUs or sales copy, so the mapping is explicit and reviewable in [`catalog/new-catalog.manifest.js`](catalog/new-catalog.manifest.js). Every entry states its evidence:

- `sku_evidence` — where the model code came from. No evidence means no SKU, and a generated placeholder.
- `price_source` — which sheet the figure was read from. **No quoted price means `pricing: null`, never a guess.**
- `conflicts` / `gaps` — every place two sources disagree, and everything still missing.

```bash
npm run catalog
```

Previews the catalog and prints the open-questions report. `--commit` writes; `--gaps` prints only what is unresolved.

Importing also archives anything the manifest does not list, so rows left over from an older import stop appearing in the shop.

```bash
npm run publish -- --commit
```

Puts the priced products in the shop. Today that is **14 of 28** — the rest have photos, categories, specs and copy but no quoted price, and the publishable contract refuses a product with no price.

### Product photos

Served under a stable `/catalog` prefix, set by `CATALOG_IMAGE_PUBLIC_PATH`. The prefix is deliberately not the directory name — that directory has been renamed once already, and every stored image URL would have broken with it.

Colour variants nest one level deeper (`Liberty 5/Black/`, `/Blue/`, `/Golden/`, `/White/`). They are one product with the colour recorded per photo, not four products.

---

## The API

Public, read-only, and the only thing mounted in production:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/products/public` | Product grid — search, filter, sort, paginate |
| `GET` | `/api/v1/products/public/:handle` | One product, by slug or legacy id |
| `GET` | `/api/v1/products/public/facets` | Categories, brands and price range |
| `GET` | `/api/v1/products/public/sitemap` | Every published slug and its last-modified date |
| `GET` | `/health` | Liveness and database state |

Every query is anchored to a published-products filter applied by the server, which no query parameter can relax. Cost, margin, supplier and data-quality fields are stripped before the response leaves the process.

### Back office

The admin, pricing, quality and analytics routes are **not mounted** unless `ENABLE_ADMIN_API=true`. They write to the catalog and expose cost and margin data; the shop needs none of it, and the catalog is managed from the CLI. A route that does not exist cannot be reached by a mistake in the auth middleware.

Enabling them in production without `ADMIN_API_KEYS` stops the server from booting.

The archived admin dashboard in [`archive/web/`](archive/README.md) still works against them.

---

## Data model and pricing

Both margin definitions are computed and stored, because they answer different questions and the source workbooks quote the second:

```
margin_percentage        = (selling_price - rdp) / rdp            × 100
gross_margin_percentage  = (selling_price - rdp) / selling_price  × 100
```

Every price keeps its source currency, and a `normalized` block converts it into `BASE_CURRENCY`. **If the currency is unknown, `normalized` is null rather than the raw number** — assuming one is how USD figures end up silently added into EGP totals.

Slugs are unique in the database. Collisions are not hypothetical: the archive catalogs describe the same product in several sheets under one Arabic name with different supplier codes. The first claimant keeps the clean slug; a later one is disambiguated by its SKU.

Any field edited by hand is recorded in `metadata.locked_fields`, and the importer strips those paths from its update — a manual correction survives the next import.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SITE_URL` | `http://localhost:3001` | Public shop origin — canonical links and sitemap |
| `SHOP_PORT` | `3001` | Host port the shop is published on. Not `PORT` — the API uses that, from the same file |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/bytehub` | |
| `ENABLE_ADMIN_API` | off in production | Mounts the back-office routes |
| `ADMIN_API_KEYS` | *(empty)* | Required when the admin API is on |
| `CORS_ORIGINS` | *(empty)* | Allowlist. Empty = same-origin only. `*` refused in production |
| `CATALOG_IMAGE_ROOT` | `./New Catalog` | Where product photos live on disk |
| `CATALOG_IMAGE_PUBLIC_PATH` | `/catalog` | Stable URL prefix for photos |
| `USD_TO_EGP_RATE` | `48.5` | FX rate for normalising USD-priced rows |

Storefront (`apps/storefront/.env.local`): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_ORIGIN`, `API_ORIGIN`, and the shop's contact details.

Changing the FX rate does not silently invalidate stored figures — run `POST /pricing/recalculate` with the admin API on, or re-run `npm run catalog -- --commit`.

---

## Testing

```bash
npm run test:all
```

**API (398).** Pricing arithmetic, the money and percent parsers, header detection, column mapping, SKU and brand normalisation, spec extraction and quality scoring — including the awkward cases: `"-25"` is a negative number and not a range, `"n/a — priced above market"` is not a price, Arabic-Indic digits, division by zero, `null` everywhere. Integration tests run the pipeline over the real spreadsheets and drive the HTTP surface against an in-memory MongoDB, including a production configuration where the back office is not mounted and a misconfigured boot is refused.

**Storefront (49).** Structured data, canonical URLs, product rendering, and the server-side catalog reads. The recurring theme is refusing to invent: a missing price renders "Price on request" and never `0 EGP`, an estimated one says so, and the JSON-LD omits fields the catalog does not know rather than filling them in.

### Smoke tests

```bash
npm run smoke -- --shop http://127.0.0.1:3001
```

29 checks against a **running** shop, because the tests above cover what the code does and these cover what the deployment does. That gap has been wrong three times: an image optimiser answering 200 while serving the untouched original, a canonical link inherited from the root layout that marked the whole catalog as duplicate, and a category page whose HTML contained no products at all. Every one of those is a 200 to a status-code check.

So the checks compare rather than ping: the optimised image must be *smaller* than its source and arrive as AVIF or WebP; each category page's HTML must contain exactly as many product links as the facet count claims; the breadcrumb markup must match the visible trail word for word; an unknown slug must return a real 404. The back-office assertions run here too, against the deployed URL rather than a test harness.

The optimiser check was verified by hiding `sharp` inside a running container — it fails with the content type as the evidence.

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs four jobs. The first three are ordinary; the fourth is the one that earns its keep.

| Job | What it does |
|---|---|
| API tests | 398 tests, with the in-memory MongoDB binary cached |
| Storefront tests | 49 tests |
| Dependency audit | Blocks on critical advisories; prints high ones without failing |
| Deployment smoke | Deploys the real stack with Docker and runs the 29 checks against it |

The deployment job follows the documented sequence exactly — data layer, import, publish, *then* build the shop — because the order is load-bearing and building the stack in one shot produces a product-less site with every container healthy. It finishes by asserting that a build which cannot reach the catalog **fails**, so that guard cannot rot.

---

## Notes and limits

- **No cart or checkout.** Deliberate — the shop sells in person, and "Contact to buy" is the conversion point.
- **No CSP header.** The app inlines JSON-LD and Next injects its own bootstrap scripts, so a real policy needs nonces threaded through the render path. A partial CSP loosened until it passes is worse than none; the headers that are unconditionally correct are set.
- **Legacy id URLs 404 on the storefront**, though the API still resolves them. No id-based product URL was ever published publicly.
- **The storefront build reaches the network twice**: for the catalog, and for `next/font/google`, which downloads Inter at build time and self-hosts it thereafter. The font fetch failed once during verification and succeeded on retry, so an offline or locked-down builder needs the font vendored into the repo first.
- **FX is a single configured rate**, not a live feed. Fine for comparison; revisit before customer-facing pricing depends on it.
- **14 of 28 products are unpriced** and therefore unpublished. `npm run catalog -- --gaps` lists exactly what is missing.
