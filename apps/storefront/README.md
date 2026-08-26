# ByteHub Storefront

The customer-facing shop window over the ByteHub catalog — browse, search, compare, then message
the shop to buy. **There is no cart, no checkout and no payment**: ByteHub sells in person, and the
storefront's job is to get a customer to the point of knowing what they want.

- **Next.js 14 (App Router) · React Query · TailwindCSS**
- Talks to the backend over HTTP only, through the public catalog API
- Product pages are **statically generated** on slug URLs; the catalog is **server-rendered** per request
- Schema.org `Product`, `BreadcrumbList` and `Store` structured data, with a canonical on every page

---

## Quick start

The backend must be running first (see [`../../README.md`](../../README.md)):

```bash
cd ../.. && npm start
```

The storefront only shows products that are **active and verified**. A freshly imported database has
zero verified products, so the shop will be empty until you publish some:

```bash
cd ../.. && npm run publish -- --commit
```

Most of the products that carry photography are held back by `MISSING_COST` — the shop has a selling
price but has not recorded what it pays. That blocks verification by policy, and it is invisible to
a customer. To publish those too, accepting that you lose margin visibility on them:

```bash
cd ../.. && npm run publish -- --require-image --allow-missing-cost --commit
```

Then, in a second terminal:

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

The shop is on `http://localhost:3001`.

To exercise the production build the way the container runs it — `next start` does not support
`output: 'standalone'`, so `npm start` assembles the standalone bundle and runs its server:

```bash
npm run build && npm start
```

---

## Architecture

```
apps/storefront/  →  HTTP  →  backend (:4000)  →  MongoDB
```

The storefront has no database access, no admin API key, and no pricing logic. It reads
`/products/public`, which the backend has already filtered and sanitised. That boundary is
deliberate and worth keeping:

- **`GET /products` is not safe for customers.** The admin list returns dealer cost (`pricing.rdp`),
  computed margins, supplier names, data-quality issues and a verbatim copy of the source
  spreadsheet row. Pointing a public website at it would publish the shop's buying prices.
- **`GET /products/public` is an allowlist.** It returns a payload built field by field, so an
  internal field added to the product model tomorrow stays internal by default.
- **Publishability is decided server-side.** `is_active && is_verified && !is_draft && selling_price > 0`
  is applied by the API and is not expressible as a query parameter — a customer cannot list the
  shop's unverified rows by editing a URL.

Next proxies `/api/v1/*` and `/catalog/*` to the backend (`next.config.mjs`), so every browser
request is same-origin and there is no CORS surface.

Page rendering runs on the server, which cannot use a browser-side rewrite, so it addresses the
backend directly through `API_ORIGIN` (`lib/server-api.js`). Same HTTP contract, same public
endpoints, still no database access.

---

## Pages

| Route            | What it does                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| `/`              | Hero with live catalog counts, the four lead categories, featured products    |
| `/products`      | Grid with search, category/brand/price filters, sorting and pagination        |
| `/products/[handle]` | Gallery, price, specs, description, "Contact to buy", related products    |
| `/sitemap.xml`   | Every published product with its real last-modified date                      |
| `/robots.txt`    | Crawl policy — filtered and sorted catalog URLs are excluded                   |

### Filter state lives in the URL

`useCatalogParams` keeps `search`, `category`, `brand`, `min_price`, `max_price`, `sort` and `page`
in the query string rather than in React state. That is what makes a filtered grid shareable,
bookmarkable and correct under the back button — none of which come free with `useState`. It also
means the navbar's category links are ordinary `href`s.

Any filter change resets to page 1: landing on page 4 of a three-page result set after narrowing a
filter is a common way to show a customer an empty grid.

### Search is substring, not full-text

The backend has a text index, but `$text` matches whole words — someone typing "char" gets nothing
until they finish "charger", which is the opposite of instant search. The public endpoint uses an
escaped, case-insensitive substring match across name, brand and SKU instead. Input is escaped, so a
stray `(` is a character to search for rather than a regex the customer accidentally wrote.

The input is debounced by 250ms; without it, typing "charger" fires seven requests and the grid
flickers through seven result sets.

---

## Built for search

The only conversion path is "customer finds product, customer messages shop", so search visibility
is the funnel rather than a finishing touch.

- **Slug URLs** — `/products/joyroom-jr-tcg13-gan-wall-charger-45w-usb-c`, not a database id.
- **Server-rendered HTML** — prices, specs and descriptions are in the markup on every page, not
  fetched after hydration. That includes the catalog grid and each category filter.
- **Schema.org `Product`** and `BreadcrumbList` on every product page, `Store` on the site, with
  only the fields the catalog actually knows. An invented `gtin` is a manual-action risk, not a
  ranking boost.
- **A canonical per page**, declared by the page itself. Metadata declared in the root layout is
  inherited by every page that does not override it, so a canonical set there marks the whole shop
  as a duplicate of the home page.
- **Sitemap and robots** — real last-modified dates; filtered and sorted URLs excluded so crawl
  budget goes to product pages rather than to the same products in a different order.
- **Images** — the catalog ships 24 MB of unprocessed supplier photos, several over 1 MB.
  `next/image` re-encodes them to AVIF at the width actually requested. Measured in the container:
  981 KB of grid photos become 97 KB, a **90% saving**. `sharp` is a direct dependency because
  standalone mode requires it, and without it the optimizer silently serves the original file.

---

## Things the real data forced

**Half the catalog is named in Arabic.** Product names like `كابل StarTalk 100W` mix scripts, so
every rendered name carries its own `dir` from `dirFor()`. Without it the Latin part lands at the
wrong end and reads as broken.

**Not every product has a photo.** Images are linked from `Catalog/` folders by a confidence-scored
matcher that deliberately leaves uncertain matches unlinked — the Arabic-named rows from the master
catalog have no English folder to match against, and the matcher refuses to guess. A grid of
identical grey boxes reads as broken, so `ProductImage` falls back to a category-tinted placeholder
carrying the category's glyph: it looks deliberate, and the categories stay distinguishable.

The hero strip asks for `has_image=true` rather than filtering client-side, so the shop window is
only ever real photography.

**Prices can be missing or approximate.** A product with no price renders "Price on request", never
`0`. A price parsed from a range (`"$6-$9"`) is labelled *approx.* rather than quoted as if the shop
had committed to it.

**Prices are normalised to EGP.** Part of the catalog is priced in USD. The card shows
`pricing.normalized.selling_price`, and price filtering runs against the same field — filtering on
the raw figure would drop USD-priced products out of an EGP range they actually fall inside.

---

## Configuration

`.env.local`, copied from `.env.example`:

| Variable                  | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`    | Public shop origin — canonical links, sitemap, Open Graph images |
| `NEXT_PUBLIC_API_ORIGIN`  | Backend origin to proxy to (default `http://localhost:4000`) |
| `API_ORIGIN`              | Server-side only; lets rendering reach the API over a private network name |
| `NEXT_PUBLIC_WHATSAPP`    | Digits only, international format — `wa.me` rejects `+`      |
| `NEXT_PUBLIC_PHONE`       | Display phone number, also used for the `tel:` link          |
| `NEXT_PUBLIC_EMAIL`       | Footer contact                                               |
| `NEXT_PUBLIC_ADDRESS`     | Footer contact                                               |

The "Contact to buy" button opens WhatsApp pre-filled with the product name and SKU — the SKU is
what the shop searches on, and "the black 65W one" costs a round trip that `S-A60` does not.

---

## Notes and limits

- **Categories on the home page are hardcoded** in `lib/categories.js` and must match the backend
  taxonomy exactly, since the name is sent straight back as a filter. Everything else the catalog
  holds is still reachable from the listing page, whose filters are built from live facet counts.
- **Product pages are statically generated**, body and metadata together. A crawler and a phone on
  slow mobile data both get complete HTML with the price already in it. They revalidate on a timer,
  so a reprice reaches the shop without a rebuild.
- **`dynamicParams` is off.** An unknown slug is answered by the router with a real 404 instead of
  rendering, caching and serving an empty page with a 200 — a soft 404 is how a shop ends up with
  unlimited junk URLs indexed as real pages. The cost is that a newly *published* product needs a
  rebuild to become reachable, which the sitemap needs anyway.
- **`next/font/google` downloads Inter during the build.** It is self-hosted from then on, so this
  is a build-time dependency rather than a runtime one — but it does mean the build talks to Google,
  and it flaked once during container verification. Vendoring the woff2 and switching to
  `next/font/local` would remove it.
- **Legacy id URLs 404 here**, though the API still resolves them. No id-based product URL was ever
  published publicly.
- **The listing page is server-rendered per request, then hydrates.** Its filters live in the query
  string, so there is nothing stable to pre-render — but the page reads those filters on the server
  and hands the client component the result it already fetched, under the same React Query key. The
  HTML carries the products; the grid stays interactive.
