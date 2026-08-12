#!/usr/bin/env node
/**
 * Links the product photos under Catalog/ to imported products.
 *
 * The folder layout is Catalog/<Category>/<Product Name>/<image files>, which
 * is a second, independent source of product identity — it names products the
 * spreadsheets spell differently ("GENERAL CABLE TYPE C TO TYPE C" vs
 * "كابل Vibrant 60W C-C"). Matching is by similarity against name and SKU,
 * with a floor so a bad guess is left unlinked rather than attached to the
 * wrong SKU, and assignment is one-to-one.
 *
 * All matching logic lives in images.service.js, shared with the admin API.
 *
 *   node scripts/link-images.js
 *   node scripts/link-images.js --dry-run --threshold 0.6
 */
import process from 'node:process';
import env from '../src/config/env.js';
import logger from '../src/shared/utils/logger.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import imagesService, { DEFAULT_THRESHOLD } from '../src/modules/catalog/images.service.js';

function parseArgs(argv) {
  const options = { dryRun: false, threshold: DEFAULT_THRESHOLD };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') options.dryRun = true;
    else if (argv[i] === '--threshold') options.threshold = Number.parseFloat(argv[(i += 1)]);
    else if (argv[i] === '--help' || argv[i] === '-h') options.help = true;
  }
  return options;
}

const HELP = `
ByteHub image linker

Usage:
  node scripts/link-images.js [flags]

Flags:
  --dry-run             Report matches without writing them
  --threshold <0.3-1>   Minimum confidence to link (default ${DEFAULT_THRESHOLD})
  -h, --help
`;

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const folders = imagesService.scanImageFolders();
  if (folders.length === 0) {
    console.log(`No image folders found under '${env.ingestion.imageRoot}'.`);
    return;
  }

  await connectDatabase();

  const result = await imagesService.autoLink({
    threshold: options.threshold,
    dryRun: options.dryRun,
  });

  console.log(`Scanning ${folders.length} image folders at threshold ${result.threshold}…\n`);

  for (const match of result.matches) {
    console.log(
      `  ${String(Math.round(match.score * 100)).padStart(3)}%  ${match.folder}` +
        `  ->  ${match.product.name}${match.product.sku ? ` [${match.product.sku}]` : ''}` +
        `  (${match.images} images)`,
    );
  }

  console.log(
    `\n${result.linked} folders linked (${result.images} images)` +
      `${result.dry_run ? ' — dry run, nothing written' : ''}.`,
  );

  if (result.unmatched.length > 0) {
    console.log(`\n${result.unmatched.length} folders below the ${result.threshold} threshold:`);
    for (const entry of result.unmatched.slice(0, 25)) {
      console.log(`  ${String(Math.round(entry.best_score * 100)).padStart(3)}%  ${entry.folder}`);
    }
    console.log('\nLink these by hand in the admin UI (Images page) — the API will not guess.');
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
