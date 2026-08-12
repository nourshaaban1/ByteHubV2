# ByteHub Admin

The control and visibility layer over the ByteHub backend — a decision dashboard for **what to buy, what to fix, and what sells profitably**, not a product browser.

- **Next.js 14 (App Router) · React Query · Zustand · TailwindCSS · Recharts**
- **81 component and integration tests**

---

## Quick start

The backend must be running first (see [`../README.md`](../README.md)):

```bash
cd .. && npm start
```

Then, in a second terminal:

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000>. Next proxies `/api/v1` and `/Catalog` to the backend on port 4000, so the browser makes same-origin requests and there is no CORS surface at all. Point it elsewhere with `NEXT_PUBLIC_API_ORIGIN`.

```bash
npm test
```

---

## The rule this UI is built around

**The backend is the source of truth. The frontend never computes.**

Margins, quality scores, currency conversion, issue detection and duplicate resolution are all decided server-side. This app transports, displays and lets an operator act — it does not re-derive. Re-implementing `(selling − rdp) / rdp` in a React component is how a UI starts quietly disagreeing with its own API.

Three consequences run through every screen:

| Rule | What it looks like |
|---|---|
| **Never assume missing data** | A null cost renders `—`, never `0`. A null margin is blank, not `0%`. An unknown currency shows a `?` marker rather than picking one. |
| **Never auto-fix silently** | The fix queue applies only values you typed. Import requires an explicit preview before it will commit. Auto-linking images defaults to a dry run. |
| **Always surface issues** | Every product carries its issue chips. Failed saves list the offending fields. Partial bulk successes report exactly which rows failed and keep them on screen. |

---

## Pages

### Dashboard — `/`
Inventory value at cost and retail, potential gross profit, both margin averages, and how many products are below the publishable threshold. Products priced below cost get their own banner, because they are the one thing actively losing money.

The **procurement basket** table is the buy decision: committed spend recomputed from quantity × verified cost. It reproduces the workbook's own verified totals (82,075 / 41,485 / 123,560 EGP) — the figures ByteHub's original plan understated threefold.

### Products — `/products`
Dense filterable table: cost, price, both margins, quantity, quality score, issue chips and verification status. Filter state lives in the URL, so any view is shareable and survives a reload.

Clicking a row opens a drawer with three tabs:
- **Overview** — every field, including source provenance (which sheet and row it came from), variant pricing, and any cost mismatch against the supplier price list.
- **Issues** — the score broken down group by group, with what is missing in each, and the full issue list separating *fixable* from *decision-needed*.
- **Edit** — change fields, adjust price, see live warnings (typing a price below cost warns before you save), release locked fields, and read the full change history.

### Fix queue — `/quality` ← the main workflow
Driven by `GET /quality/worst`. Each row shows its worst *fixable* issue and an input targeting exactly the field that fixes it. Type values across many rows, then apply them in one batch.

- Blank rows are left untouched — nothing is inferred.
- Rows that fail stay on screen with their value and the reason, so you can correct them.
- Every applied value locks that field against future imports.
- Issues needing a judgement call (duplicate SKUs, cost mismatches) are marked **decision** and routed to review rather than given an input box.

Separate tabs break issues down by type across the whole catalog, and list SKU collisions — distinguishing a *true duplicate* from a supplier legitimately reusing a model code.

### Pricing — `/pricing`
Both margin definitions side by side with their formulas, the active policy thresholds, and the margin band distribution with capital exposed per band. A **what-if calculator** posts to `/pricing/quote` — even here the arithmetic is the backend's.

A dedicated tab lists products selling below cost with loss per unit and total exposure.

### Analytics — `/analytics`
Inventory value by category, subcategory, brand, supplier, basket, source catalog or source currency; margin distribution; quality distribution; supplier comparison; and most-profitable products. Charts read their colours from the same CSS variables as the rest of the UI, so a margin band is the same colour everywhere.

### Import — `/import`
Drag a spreadsheet, **preview**, then commit. The preview reports, per sheet: the detected header row, the resolved column mapping with confidence, the inferred currency, unmapped columns, skipped rows with reasons, the issues every product will carry, and a sample of parsed products. The Import button stays disabled until you have previewed.

After a run it reports how many manually-edited fields were preserved.

### Images — `/images`
Folder-to-product linking with ranked suggestions and confidence scores. Auto-link previews before it writes and enforces one folder per product. Folders nothing resembles are listed plainly rather than force-matched — some name products no catalog carries.

---

## Structure

```
web/
├── app/
│   ├── layout.jsx · providers.jsx · globals.css
│   ├── page.jsx            dashboard
│   ├── products/ quality/ pricing/ analytics/ import/ images/
├── components/
│   ├── ui/                 primitives · Table · Modal · Toaster
│   ├── domain/             indicators · ProductDrawer · ProductFilters
│   └── layout/Shell.jsx
├── lib/
│   ├── api.js              transport, envelope unwrapping, error typing
│   ├── hooks.js            React Query reads + mutations
│   ├── domain.js           backend vocabulary → labels and colours
│   ├── format.js           display formatting (null ≠ zero)
│   └── store.js            Zustand: toasts, selection, drawer
└── tests/
```

**State split:** React Query owns everything from the server. Zustand holds only UI state (toasts, selection, drawer). Putting server data in both would create two sources of truth that drift.

**Cache invalidation:** every mutation invalidates products, analytics, quality *and* pricing — changing one price moves the dashboard's average margin, the quality distribution and the alert list. Leaving those stale is how a UI starts lying about the state of the business.

---

## Design system

Colours are CSS custom properties, so light and dark themes and the Recharts palette all come from one place. The margin bands double as the status palette — `loss`, `critical`, `warn`, `healthy`, `target`, `unknown` — meaning a red chip means the same thing on every screen.

Deliberate choices:
- Colour is never the only signal. Every band, severity and status is also a word.
- Tabular figures wherever numbers are compared down a column.
- Arabic product names get `dir="rtl"` per cell, so they render correctly in an otherwise LTR table.
- Wide tables scroll inside their own container; the page body never scrolls sideways.

---

## Testing

```bash
npm test
```

81 tests over the layer that decides what an operator sees:

- **Formatting** — that `null` renders as `—` and `0` renders as `0`, that a negative margin stays negative, that Arabic text is detected as RTL.
- **Indicators** — that both margin bases show, that issues sort worst-first and collapse rather than disappear, that an unknown currency is flagged.
- **API client** — envelope unwrapping, typed errors with per-field details, 207 partial success treated as data rather than an exception, FormData left un-typed so the browser sets the multipart boundary.
- **Messy data** — a dedicated suite for the cases the catalogs actually contain: no cost, priced below cost, unknown currency, duplicate SKU, generic placeholder, and completely empty or `null`-riddled products.

That last suite caught a real bug: a default parameter covers `undefined` but not `null`, so a product with `issues: null` crashed the whole table.

---

## Endpoints added for this UI

Two capabilities existed only as CLI scripts and were promoted to the API:

- `PATCH /products/bulk` — the fix queue's batch apply. Returns **207** with per-item outcomes when some rows fail, rather than failing the batch or hiding the failures.
- `GET /catalog/images`, `POST /catalog/images/link` · `/unlink` · `/auto-link` — image management. The matching logic now lives in `images.service.js`, shared with `scripts/link-images.js` rather than duplicated.

Product validation schemas were also made **strict**: sending an unknown or computed field is now a `400` naming it, instead of being silently dropped.

---

## Notes and limits

- **Auth is API-key based and optional in development.** The client sends `x-api-key` from `localStorage` when set. There is no login screen — this is an internal tool behind whatever the deployment fronts it with.
- **No optimistic updates.** Writes wait for the server and re-read. For a system whose value is correctness about money, showing a change that has not landed is the wrong trade.
- **Charts are unvirtualised** and the largest view renders ~12 groups. Product tables paginate server-side. Neither needs windowing at this catalog size; both would at 10,000 SKUs.
