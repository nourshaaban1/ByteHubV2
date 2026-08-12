# ByteHub Backend

Catalog, pricing and data-quality backend for ByteHub, a retail electronics business in Egypt.

> Two separate frontends sit on top of this API over HTTP. Neither touches MongoDB.
>
> - **Admin** — [`web/`](web/README.md), a Next.js dashboard for deciding what to buy, what to fix, and what sells profitably (port 3000).
> - **Storefront** — [`apps/storefront/`](apps/storefront/README.md), the customer-facing shop: browse, search, compare, then message the shop to buy (port 3001). No cart, no checkout.
>
> Start this backend first, then run `npm run dev` in whichever app you want.

It ingests messy supplier spreadsheets — Arabic and English product names, mixed USD/EGP pricing, price ranges instead of prices, missing SKUs, duplicated products across catalogs — and turns them into a structured, priced, scored product catalog with an admin API on top.

- **Node.js 20+ · Express · MongoDB (Mongoose) · Zod**
- **Architecture:** Controller → Service → Repository
- **305 tests**, run against the real ByteHub spreadsheets and a real MongoDB

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

Start MongoDB, then import the catalogs and run the API:

```bash
npm run import -- --all
```

```bash
npm start
```

The API is on `http://localhost:4000/api/v1`. Check it is alive:

```bash
curl http://localhost:4000/health
```

To see what an import *would* do without writing anything:

```bash
npm run import -- --all --preview
```

To attach the product photos in `Catalog/` to the imported products:

```bash
npm run link:images
```

Run the tests:

```bash
npm test
```

> The integration tests spin up an in-memory MongoDB automatically — no local database is needed to run them.

---

## What this actually does with the real data

Importing all four workbooks yields **108 products** from 134 source rows. The numbers it computes independently reproduce the verified figures in ByteHub's own procurement review:

| Basket | Products | Cost (EGP) | Source workbook says |
|---|---|---|---|
| Must Buy | 9 | 82,075 | 82,075 |
| Test Buy | 11 | 41,485 | 41,485 |
| **Committed total** | **20** | **123,560** | **123,560** |

That total is the one the original procurement plan stated as 38,500 — a ~3x understatement, because the plan never re-multiplied its own quantities by its own costs. This system computes it from `quantity × verified cost` every time, so it cannot drift.

It also independently rediscovers the specific defects the human review found:

- **`COST_MISMATCH` ×3** — Anker A8852, A2667 and A1336 quote costs that disagree with the supplier price lists. The verified figure wins; the claimed one is kept as evidence.
- **`MARKET_BELOW_COST` ×2** — Anker A2667's assumed street price (max 1,400) is *below* its wholesale cost (1,665). Every unit sold at that price loses money.
- **`SKU_CORRECTED` ×1** — `JR-PK1 → JR-PR1`, a correction written inline in a spreadsheet cell.
- **`AMBIGUOUS_SKU`** — Joyroom reuses `JR-ZS259` and `SA21-1T3` for two different products each.

---

## The ingestion pipeline

```
Excel/CSV → grid → detect header → map columns → classify rows
          → clean & extract → price → validate → score → dedupe → upsert
```

Every stage is a separate, individually-tested module under `src/modules/catalog/`.

### 1. Header detection is discovered, not assumed

ByteHub's sheets put the header on row 2, 3 or 4 depending on how many banner lines the author wrote. `headerDetector.js` scores each of the first 20 rows on how many cells resolve to known fields, penalising numbers and prose, and picks the winner. Sheets with no table at all (`Overview`, `Negotiation & KPIs`) score too low and are skipped.

### 2. Column mapping is data, not code

`config/columnAliases.js` declares every column ByteHub can produce as `(canonical field, aliases, patterns, specificity)`. Matching is exact alias → regex → fuzzy similarity, each with a confidence score. **Adding a supplier with new headers is a config edit, not a code change.**

Specificity resolves genuine conflicts:

| Source header | Maps to | Why |
|---|---|---|
| `RDP\n(verified, EGP)` | `pricing.rdp` | The verified figure is the real cost |
| `RDP\n(plan, EGP)` | `metadata.reported_margin` context | Kept only as mismatch evidence |
| `Est. Cost (EGP, formula)` | `metadata.extended_cost` | This is `qty × cost` — **never** a unit price |

Columns that match nothing are preserved as free-form `specs.attributes` and flagged, so no source data is ever silently dropped. Inspect the whole dictionary at runtime: `GET /catalog/mapping`.

### 3. Rows are triaged before they are read

`rowClassifier.js` separates banner text, ALL-CAPS section dividers (`CHARGING & DATA CABLES` — which then supply the category for every row beneath them), `TOTAL` rows and blanks from real product rows.

### 4. Cleaning the values

| Input | Result |
|---|---|
| `440` | `440` |
| `"225-270"` | `min 225, max 270, value 247.5`, flagged `PRICE_RANGE_ONLY` |
| `"$25 – $35"` | `min 25, max 35`, currency `USD` |
| `"64GB: $6–$9 \| 128GB: $9–$13"` | three priced variants |
| `"1,000-1,400 (plan's guess — unverified)"` | `1000–1400` + the caveat retained |
| `"n/a — priced above market"` | `null` + the reason retained |
| `"٤٤٠"` | `440` (Arabic-Indic digits) |
| `0.413333` (Excel percent) | `41.33%` |

Specs are extracted from free text: wattage (`45W GaN` → 45), battery (`10,000mAh` → 10000; `20K` → 20000, but only on power banks), cable type (`C-C` → `USB-C to USB-C`), capacity, length (`3ft` → 0.914 m), warranty (`5-Year` → 60 months) and condition (`Used – Original Pull` → `original_pull`).

Categories are normalised onto a taxonomy in `config/taxonomy.js` that matches Arabic and English equally — `شواحن`, `Wall Chargers` and `Chargers` all resolve to **Chargers** — falling back to the product name when a row has no category at all. Unrecognised categories are kept verbatim and flagged rather than discarded.

### 5. Identity and deduplication

Each product gets a stable `fingerprint`: its SKU when it has one, otherwise `brand + name`. Rows with no SKU get a deterministic generated one (`BH-CHG-JOY-E85898`) derived from product identity only — deliberately **not** from the sheet it came from, or the same product listed in two sheets would fail to merge.

When two rows describe the same product, the higher-scoring one wins **and inherits every field the other had that it lacked**, then its issues and score are recomputed from the merged result. This is why the Action Plan's row for Anker A8852 (which quotes only the verified cost) still ends up carrying the Master Catalog's record that the plan's own figure disagreed with it.

Re-running an import updates rather than duplicates.

---

## Pricing engine

The brief's definition is markup on cost; ByteHub's procurement workbooks quote share of revenue. **Both are computed and stored**, because they answer different questions and mixing them up is how a 41% margin gets mistaken for a 70% one:

```
margin_percentage        = (selling_price - rdp) / rdp            × 100
gross_margin_percentage  = (selling_price - rdp) / selling_price  × 100
```

Margins are classified into bands against configurable thresholds (`loss` / `critical` / `low` / `healthy` / `target` / `implausible`). A margin above 900% is treated as a unit or currency error, not a windfall.

**Currency.** Every price keeps its source currency, and a `pricing.normalized` block converts it into `BASE_CURRENCY` for analytics. If the currency is unknown, `normalized` is **null** rather than the raw number — assuming a currency is exactly how USD figures end up silently added into EGP totals. All analytics aggregate over `normalized` only.

```bash
curl -X POST http://localhost:4000/api/v1/pricing/quote -H 'Content-Type: application/json' -d '{"rdp":440,"selling_price":750,"currency":"EGP"}'
```

---

## Data quality score (0–100)

```
score = weighted field completeness − penalties for defects
```

The two halves measure different things and deliberately never double-charge for one fact. A field that is merely **absent** is already priced into completeness, so its penalty is zero. Penalties are reserved for data that is present and **wrong** — duplicate SKUs, selling below cost, costs contradicting the supplier list — plus the few absences that block a sale outright.

Completeness weights (identity 35, pricing 32, specs 15, commercial 10, media 8) live in `quality.scorer.js` and are served at `GET /quality/rubric`, so any score is explainable rather than a magic number. `GET /quality/:id/explain` breaks down a single product field by field.

Duplicate SKUs are **detected, not rejected**: the SKU index is intentionally non-unique because Joyroom genuinely reuses one model code for two products and their own price list says so. The API separates the two cases:

- `duplicate_row` — same code, same product name → a true duplicate
- `reused_model_code` — same code, different products → needs a human decision

---

## Manual overrides survive re-import

This is the constraint that makes admin corrections worth making.

Any field edited through the API is recorded in `metadata.locked_fields` with a full audit entry (who, when, previous value, reason). The import pipeline strips every locked path from its update, along with admin-owned state (`status.is_verified` and friends). Unlocked fields keep refreshing from the source normally.

```bash
curl -X PATCH http://localhost:4000/api/v1/products/<id> -H 'Content-Type: application/json' -d '{"name":"Joyroom JR-T03S TWS Earbuds","reason":"Arabic name replaced for the storefront"}'
```

Re-import, and that name is still there — while its price still updates. Release a field back to the pipeline with `PATCH /products/:id/unlock`.

Verification is gated: a product with unresolved **critical** issues cannot be marked verified.

---

## API

Base path `/api/v1`. Responses are `{ success, data, meta? }` or `{ success, error: { code, message, details? } }`.

### Products
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/products` | List — filter, search, sort, paginate |
| `GET` | `/products/:id` | One product |
| `GET` | `/products/public` | **Customer storefront** — published products only, sanitised |
| `GET` | `/products/public/:id` | One published product |
| `GET` | `/products/public/facets` | Categories, brands and price range over the published set |
| `POST` | `/products` | Create (all supplied fields locked) |
| `PATCH` | `/products/:id` | Edit + lock fields |
| `PATCH` | `/products/bulk` | Batch edit for the fix queue — **207** with per-item outcomes if any fail |
| `PATCH` | `/products/:id/price` | Price update, recomputes margins |
| `PATCH` | `/products/:id/verify` | Verify / unverify |
| `PATCH` | `/products/:id/unlock` | Release fields to the importer |
| `DELETE` | `/products/:id` | Archive (`?hard=true` to delete) |

Edit bodies are **strict**: an unknown or computed field returns a `400` naming it, rather than being silently dropped.

Filters: `search`, `brand`, `category`, `subcategory`, `supplier`, `source_catalog`, `currency`, `procurement`, `lifecycle`, `is_active`, `is_verified`, `is_generic`, `is_draft`, `has_issues`, `issue_code`, `issue_severity`, `min/max_price`, `min/max_margin`, `min/max_quality`, `min/max_quantity`. Sort: `-margin`, `quality`, `price`, `name`, …

```bash
curl "http://localhost:4000/api/v1/products?issue_code=COST_MISMATCH&sort=-margin"
```

#### The public endpoints are a different contract

`GET /products` is an **admin** endpoint: it returns dealer cost, computed margins, supplier names, data-quality issues and the verbatim source spreadsheet row. It must never back a public website.

`GET /products/public` exists for the [storefront](apps/storefront/README.md) and differs in two ways that matter:

- **Publishability is server-owned.** Only `is_active && is_verified && !is_draft && selling_price > 0` products are returned, and no query parameter can relax that — `?is_verified=false` changes nothing.
- **The payload is an allowlist**, built field by field, so an internal field added to the model tomorrow stays internal by default. Stock is a boolean, never a count; price is the normalised EGP selling price, with no cost, margin or market figures alongside it.

Filters: `search` (substring, across name/brand/SKU), `category`, `subcategory`, `brand`, `min/max_price`, `in_stock`, `has_image`. Sort: `featured`, `price_asc`, `price_desc`, `name`, `newest`.

```bash
curl "http://localhost:4000/api/v1/products/public?category=Power%20Banks&sort=price_asc"
```

### Catalog
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/catalog/import` | Import an uploaded spreadsheet (also `POST /products/import`) |
| `POST` | `/catalog/preview` | Parse only — persists nothing |
| `GET` | `/catalog/imports` | Import run history |
| `GET` | `/catalog/imports/:id` | One run, with per-sheet detail |
| `GET` | `/catalog/sku-collisions` | SKUs used by more than one product |
| `GET` | `/catalog/mapping` | The column dictionary and taxonomy |
| `GET` | `/catalog/images` | Image folders, link state and ranked match suggestions |
| `POST` | `/catalog/images/link` · `/unlink` | Attach or detach a folder by hand |
| `POST` | `/catalog/images/auto-link` | Run the matcher — **dry run by default** |

```bash
curl -X POST http://localhost:4000/api/v1/catalog/preview -F file=@ByteHub_Master_Catalog.xlsx
```

### Pricing
`GET /pricing/policy` · `POST /pricing/quote` · `GET /pricing/alerts` · `GET /pricing/loss-makers` · `GET /pricing/:id/suggest` · `POST /pricing/recalculate`

### Quality
`GET /quality/rubric` · `GET /quality/overview` · `GET /quality/duplicates/sku` · `GET /quality/duplicates/similar` · `GET /quality/worst` · `GET /quality/:id/explain` · `POST /quality/rescore`

### Analytics
`GET /analytics/dashboard` · `/summary` · `/inventory-value?group_by=` · `/top-profitable` · `/margin-bands` · `/low-margin` · `/suppliers` · `/procurement`

### Auth
Write endpoints require `x-api-key` when `ADMIN_API_KEYS` is set. Left empty, admin routes are open for local development — and the server **refuses to start that way in production**.

---

## Project structure

```
src/
├── modules/
│   ├── product/     model · repository · service · controller · routes · validation
│   │   ├── product.publishable.js   one definition of "sellable", shared by all three callers
│   │   └── public/      storefront read API — serializer · service · controller · validation
│   ├── catalog/     ingestion pipeline
│   │   ├── config/      columnAliases.js · taxonomy.js   ← the "no hardcoded schema" part
│   │   ├── parsers/     workbookReader · headerDetector · columnMapper · rowClassifier
│   │   ├── cleaners/    money · brand · category · sku · specs · generic
│   │   ├── catalog.transformer.js   row → product draft
│   │   └── catalog.service.js       orchestration, dedupe, upsert
│   ├── pricing/     calculator (pure) + service + routes
│   ├── quality/     scorer · validator · service · routes
│   └── analytics/   aggregation service + routes
├── shared/          errors · middleware · http · utils · constants
├── app.js
└── server.js
scripts/   import.js · link-images.js · publish-catalog.js · backfill-status.js
tests/     unit/ · integration/
apps/
└── storefront/   customer-facing Next.js shop (separate app, HTTP only)
web/              admin dashboard (separate app, HTTP only)
```

Pricing, scoring, parsing and cleaning are **pure functions** with no database access, which is why most of the suite runs in milliseconds without any infrastructure.

---

## CLI

```bash
node scripts/import.js --all
```

| Flag | Effect |
|---|---|
| `--all` | Every supported spreadsheet in the project root |
| `--preview` | Parse and report; touches no database |
| `--dry-run` | Full pipeline, writes no products (the run is still logged) |
| `--sheet <name>` | Restrict to one sheet (repeatable) |
| `--currency <EGP\|USD>` | Currency for sheets that do not declare one |
| `--supplier <name>` | Supplier for sheets with no supplier column |
| `--no-rescore` | Skip the cross-catalog duplicate-SKU pass |

Every run writes an `ImportRun` audit record: per sheet, the detected header row, the resolved column mapping with confidence, currency, rows read/skipped, products created/updated, locked fields preserved, and the issue breakdown.

### Publishing to the storefront

Importing deliberately does not verify anything — verification is the human sign-off that says "this row is correct enough to show a customer" — so a freshly imported database has a full catalog and an empty shop.

```bash
npm run publish -- --commit
```

| Flag | Effect |
|---|---|
| *(none)* | Preview: reports what would be published, writes nothing |
| `--commit` | Verify the eligible products |
| `--category <name>` | Limit to a category (repeatable) |
| `--require-image` | Only publish products that have at least one photo |

It goes through the same `setVerification` path as the admin UI, so a product with an unresolved **critical** issue (no cost, no selling price, market price below cost) is refused and reported rather than quietly published. Those need a real fix on the Quality page first.

### Repairing status fields on an older database

```bash
npm run backfill:status -- --commit
```

The importer refuses to *update* the admin-owned paths (`status.is_verified`, `verified_by`, `verified_at`, `metadata.locked_fields`, `metadata.overrides`) — correct — but it also never *created* them, because a `bulkWrite` upsert bypasses Mongoose's schema defaults. That left the fields absent rather than at their defaults, and **an absent field is not `false`**: `?is_verified=false` matched nothing at all.

New imports now write these defaults via `$setOnInsert`. This script repairs products imported before that fix. It only fills in what is missing (`$exists: false` per path), so a verified product keeps its verification and running it twice is a no-op.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `API_PREFIX` | `4000` / `/api/v1` | |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/bytehub` | |
| `ADMIN_API_KEYS` | *(empty)* | Comma-separated admin keys |
| `BASE_CURRENCY` | `EGP` | Reporting currency for all analytics |
| `USD_TO_EGP_RATE` | `48.5` | FX rate for normalisation |
| `MARGIN_TARGET_PCT` | `54` | Target margin (cost basis) |
| `MARGIN_WARN_PCT` | `25` | Low-margin warning |
| `MARGIN_CRITICAL_PCT` | `10` | Critical-margin threshold |
| `QUALITY_MIN_PUBLISHABLE` | `70` | Minimum score to publish |

Changing the FX rate or a threshold does not silently invalidate stored figures — run `POST /pricing/recalculate` to refresh them.

---

## Testing

```bash
npm test
```

**305 tests.** Unit tests cover pricing arithmetic, the money/percent parsers, header detection, column mapping, row classification, SKU and brand normalisation, spec extraction and quality scoring — including the awkward cases: `"-25"` is a negative number and not a range, `"n/a — priced above market"` is not a price, Arabic-Indic digits, `0.413` vs `"41.3%"`, division by zero, and `null` inputs everywhere.

Integration tests run the pipeline over the **actual** ByteHub spreadsheets and assert the real facts in them (the A8852 cost mismatch, the A2667 below-cost market price, the `JR-PK1 → JR-PR1` correction, Arabic names surviving, USD normalising at 48.5). The API suite boots an in-memory MongoDB and drives the HTTP surface end to end, including that a manual override survives a re-import and that a verified product stays approved.

---

## Notes and limits

- **Quality scores are low by design on first import (avg ≈ 44/100).** That is an honest reading of the source data: most rows have no cost, no quantity and an estimated price range rather than a price. The score is a work queue, not a grade — `GET /quality/worst` ranks what to fix first.
- **A fifth module, `quality/`, was added** beyond the four in the brief. The brief lists data validation as a core module but omits it from the structure; it is substantial enough to own its files rather than hide inside `product/`.
- **Image linking is heuristic.** `link-images.js` matches `Catalog/` folders to products by name/SKU similarity with a confidence floor and one-to-one assignment, and prints everything it could not place rather than guessing. Currently 26 of 39 folders link; the rest name products no catalog carries.
- **Solutions, services and build blockers are not products** and are skipped during import. They are separate entities and modelling them is out of scope here.
- **FX is a single configured rate**, not a live feed. Fine for reporting; revisit before any customer-facing pricing depends on it.
