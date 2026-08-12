#!/usr/bin/env node
/**
 * Repairs products that were imported without their admin-owned defaults.
 *
 * The importer refuses to own `status.is_verified` and friends, and a bulkWrite
 * upsert does not run Mongoose's schema defaults — so before this was fixed,
 * those paths were left absent instead of at their default. An absent field is
 * not `false`, which made `{ 'status.is_verified': false }` match nothing and
 * every "unverified products" query come back empty.
 *
 * Only fills in what is missing. A verified product keeps its verification,
 * and a product with edit history keeps it — every write here is guarded by
 * $exists: false on the specific path.
 *
 * Previews by default; --commit is required to write.
 *
 *   node scripts/backfill-status.js
 *   node scripts/backfill-status.js --commit
 */
import process from 'node:process';
import logger from '../src/shared/utils/logger.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import Product from '../src/modules/product/product.model.js';

/** Path -> the value the schema would have given it. */
const DEFAULTS = {
  'status.is_verified': false,
  'status.verified_by': null,
  'status.verified_at': null,
  'metadata.locked_fields': [],
  'metadata.overrides': [],
};

const HELP = `
ByteHub status backfill — fills in admin-owned fields left absent by old imports

Usage:
  node scripts/backfill-status.js [--commit]

Flags:
  --commit    Apply the fix (default is a preview, nothing written)
  -h, --help
`;

async function run() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return;
  }
  const commit = argv.includes('--commit');

  await connectDatabase();

  const counts = {};
  for (const path of Object.keys(DEFAULTS)) {
    counts[path] = await Product.countDocuments({ [path]: { $exists: false } });
  }

  const affected = Object.values(counts).reduce((total, count) => Math.max(total, count), 0);

  if (affected === 0) {
    console.log('Nothing to backfill — every product already carries its status defaults.');
    return;
  }

  console.log('Products missing each field:\n');
  for (const [path, count] of Object.entries(counts)) {
    console.log(`  ${path.padEnd(28)} ${String(count).padStart(5)}`);
  }

  if (!commit) {
    console.log('\nPreview only — nothing written. Re-run with --commit to apply.');
    return;
  }

  let written = 0;
  for (const [path, value] of Object.entries(DEFAULTS)) {
    // Per path, so a document missing only one of them is not overwritten on
    // the others. $exists:false is what makes this safe to run twice.
    const result = await Product.updateMany(
      { [path]: { $exists: false } },
      { $set: { [path]: value } },
    );
    written += result.modifiedCount ?? 0;
  }

  console.log(`\nBackfilled ${written} field values.`);

  const stillBroken = await Product.countDocuments({ 'status.is_verified': { $exists: false } });
  console.log(
    stillBroken === 0
      ? 'Every product now has status.is_verified — `?is_verified=false` works again.'
      : `${stillBroken} products still missing status.is_verified.`,
  );
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
