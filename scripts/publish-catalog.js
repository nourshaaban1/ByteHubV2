#!/usr/bin/env node
/**
 * Publishes imported products to the customer storefront.
 *
 * The storefront only shows products that are active AND verified. Importing a
 * catalog deliberately does not verify anything — verification is the human
 * sign-off that says "this row is correct enough to show a customer" — so a
 * freshly imported database has a full catalog and an empty shop. This script
 * is the bulk version of clicking Verify in the admin UI.
 *
 * It goes through productService.setVerification rather than writing the flag
 * directly, so the same policy applies: a product with an unresolved critical
 * issue (no cost, no selling price, market price below cost) is refused and
 * reported, not quietly published. Those need a real fix in the admin UI.
 *
 * Previews by default; --commit is required to write.
 *
 *   node scripts/publish-catalog.js
 *   node scripts/publish-catalog.js --commit
 *   node scripts/publish-catalog.js --commit --category Cables --category Audio
 */
import process from 'node:process';
import logger from '../src/shared/utils/logger.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import Product from '../src/modules/product/product.model.js';
import productService from '../src/modules/product/product.service.js';
import { AWAITING_VERIFICATION_FILTER } from '../src/modules/product/product.publishable.js';

/**
 * Critical issues that do not describe anything a customer can see.
 *
 * MISSING_COST means the shop has not recorded what it pays for the product.
 * That is a real gap — it makes margin unknowable — but the product page is
 * complete without it: name, price, specs and photos are all present. Waiving
 * it is opt-in, never the default.
 */
const WAIVABLE_ISSUES = { '--allow-missing-cost': 'MISSING_COST' };

function parseArgs(argv) {
  const options = {
    commit: false,
    categories: [],
    requireImage: false,
    allowIssueCodes: [],
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--commit') options.commit = true;
    else if (arg === '--category') options.categories.push(argv[(i += 1)]);
    else if (arg === '--require-image') options.requireImage = true;
    else if (WAIVABLE_ISSUES[arg]) options.allowIssueCodes.push(WAIVABLE_ISSUES[arg]);
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

const HELP = `
ByteHub catalog publisher — verifies products so the storefront can show them

Usage:
  node scripts/publish-catalog.js [flags]

Flags:
  --commit              Actually verify (default is a preview, nothing written)
  --category <name>     Limit to a category; repeatable
  --require-image       Only publish products that have at least one photo
  --allow-missing-cost  Publish even without a recorded dealer cost. The product
                        page is complete; you lose margin visibility on it.
  -h, --help

Products with critical data-quality issues are refused unless explicitly
waived above — fix the rest in the admin UI, then run this again.
`;

/** Candidates: sellable products still waiting on a human sign-off. */
function candidateFilter({ categories, requireImage }) {
  const filter = { ...AWAITING_VERIFICATION_FILTER };
  if (categories.length > 0) filter.category = { $in: categories };
  if (requireImage) filter['images.0'] = { $exists: true };
  return filter;
}

const groupBy = (rows, key) =>
  rows.reduce((groups, row) => {
    const bucket = row[key] ?? '(uncategorised)';
    (groups[bucket] ??= []).push(row);
    return groups;
  }, {});

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  await connectDatabase();

  const candidates = await Product.find(candidateFilter(options))
    .select('name sku brand category pricing.selling_price pricing.currency issues images')
    .lean();

  if (candidates.length === 0) {
    const alreadyLive = await Product.countDocuments({
      'status.is_active': true,
      'status.is_verified': true,
    });
    console.log(
      alreadyLive > 0
        ? `Nothing new to publish — ${alreadyLive} products are already live.`
        : 'No publishable products found. Run `npm run import -- --all` first.',
    );
    return;
  }

  const waived = new Set(options.allowIssueCodes);
  const blockingIssues = (product) =>
    (product.issues ?? [])
      .filter((issue) => issue.severity === 'critical' && !waived.has(issue.code))
      .map((issue) => issue.code);

  const blocked = candidates.filter((product) => blockingIssues(product).length > 0);
  const blockedIds = new Set(blocked.map((product) => String(product._id)));
  const ready = candidates.filter((product) => !blockedIds.has(String(product._id)));

  console.log(`${candidates.length} unverified products, ${ready.length} ready to publish.`);
  if (waived.size > 0) {
    console.log(`Waiving: ${[...waived].join(', ')} — these products go live without it.`);
  }
  console.log('');

  for (const [category, rows] of Object.entries(groupBy(ready, 'category'))) {
    console.log(`  ${category} (${rows.length})`);
    for (const product of rows.slice(0, 6)) {
      const photos = product.images?.length ?? 0;
      console.log(
        `    ${product.name.slice(0, 58).padEnd(58)} ` +
          `${String(product.pricing?.selling_price ?? '').padStart(8)} ` +
          `${product.pricing?.currency ?? ''}  ${photos ? `${photos} photos` : 'no photo'}`,
      );
    }
    if (rows.length > 6) console.log(`    …and ${rows.length - 6} more`);
  }

  if (!options.commit) {
    console.log(`\nPreview only — nothing written. Re-run with --commit to publish.`);
    if (blocked.length > 0) {
      console.log(`${blocked.length} products would be refused (critical issues).`);
    }
    return;
  }

  let published = 0;
  const refused = [];

  for (const product of ready) {
    try {
      await productService.setVerification(String(product._id), {
        is_verified: true,
        actor: 'publish-catalog',
        reason: 'Bulk publish to storefront',
        allowIssueCodes: options.allowIssueCodes,
      });
      published += 1;
    } catch (error) {
      refused.push({ product, message: error.message });
    }
  }

  console.log(`\nPublished ${published} products to the storefront.`);

  const unpublishable = [...blocked.map((product) => ({ product, message: null })), ...refused];
  if (unpublishable.length > 0) {
    console.log(`\n${unpublishable.length} products held back:`);
    const reasons = {};
    for (const { product, message } of unpublishable) {
      const reason = blockingIssues(product).join(', ') || message || 'unknown';
      (reasons[reason] ??= []).push(product.name);
    }
    for (const [reason, names] of Object.entries(reasons)) {
      console.log(`  ${reason} — ${names.length} products`);
      for (const name of names.slice(0, 3)) console.log(`      ${name.slice(0, 64)}`);
      if (names.length > 3) console.log(`      …and ${names.length - 3} more`);
    }
    console.log('\nFix these in the admin UI (Quality page), then run this again.');
  }
}

run()
  .catch((error) => {
    logger.error(error.message);
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase().catch(() => {});
  });
