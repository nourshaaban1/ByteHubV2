# Archived

## `web/` — admin dashboard

The internal admin dashboard (catalog control, data-quality fix queue, pricing
and analytics). Archived when the project narrowed to the customer storefront.

It is a complete, working Next.js app and still matches the backend's admin API
contract. To bring it back:

```bash
cd archive/web && npm install && npm run dev
```

It needs the admin routes enabled on the backend, which are off by default in
production now:

```bash
ENABLE_ADMIN_API=true npm start
```

Catalog management that the dashboard used to do through the UI is available
from the CLI, which is what the storefront deployment relies on:

| Task | Command |
|---|---|
| Import the catalog manifest | `npm run catalog -- --commit` |
| Publish priced products | `npm run publish -- --commit` |
| Re-score data quality | `npm run backfill:status` |
