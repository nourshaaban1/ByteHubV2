#!/usr/bin/env node
/**
 * Imports the curated `New Catalog` manifest and reports what is still missing.
 *
 * Previews by default. `--commit` is required to write, because this import
 * also archives every product the manifest does not list — the New Catalog is
 * the current product list, and anything left over from an older spreadsheet
 * import must stop appearing in the shop.
 *
 *   node scripts/import-catalog.js                # preview
 *   node scripts/import-catalog.js --commit       # write
 *   node scripts/import-catalog.js --gaps         # just the open-questions report
 */
import process from 'node:process';
import logger from '../src/shared/utils/logger.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { importManifest, buildAllDrafts } from '../src/modules/catalog/manifest.importer.js';
import { PRODUCTS, openQuestions } from '../catalog/new-catalog.manifest.js';

const HELP = `
ByteHub — New Catalog import

Usage:
  node scripts/import-catalog.js [flags]

Flags:
  --commit       Write to the database (otherwise previews only)
  --keep-others  Do not archive products missing from the manifest
  --gaps         Print only the missing-data report and exit
  -h, --help
`;

function parseArgs(argv) {
  return {
    commit: argv.includes('--commit'),
    keepOthers: argv.includes('--keep-others'),
    gapsOnly: argv.includes('--gaps'),
    help: argv.includes('-h') || argv.includes('--help'),
  };
}

const money = (value) => (value === null || value === undefined ? '—' : `${value}`);
const pad = (value, width) => String(value ?? '').padEnd(width);

/** The whole point of the manifest: an explicit list of what is still unknown. */
function printGapReport() {
  const questions = openQuestions();
  const conflicts = questions.filter((q) => q.kind === 'conflict');
  const gaps = questions.filter((q) => q.kind === 'gap');
  const unpriced = PRODUCTS.filter((p) => !p.pricing);

  console.log(`\n${'='.repeat(78)}`);
  console.log('OPEN QUESTIONS — nothing below has been guessed at');
  console.log('='.repeat(78));

  console.log(`\nNO PRICE QUOTED (${unpriced.length}) — these import but cannot be published:`);
  for (const product of unpriced) {
    console.log(`  • ${product.name}`);
    console.log(`      ${product.folder}`);
  }

  if (conflicts.length > 0) {
    console.log(`\nSOURCES DISAGREE (${conflicts.length}) — need a decision:`);
    for (const entry of conflicts) {
      console.log(`  • ${entry.folder}`);
      console.log(`      ${entry.text}`);
    }
  }

  const nonPriceGaps = gaps.filter((g) => !/price/i.test(g.text));
  if (nonPriceGaps.length > 0) {
    console.log(`\nMISSING DETAIL (${nonPriceGaps.length}):`);
    for (const entry of nonPriceGaps) {
      console.log(`  • ${entry.folder}`);
      console.log(`      ${entry.text}`);
    }
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(HELP);
    return;
  }

  if (options.gapsOnly) {
    printGapReport();
    return;
  }

  /* ------------------------- what will be written ------------------------ */
  const built = buildAllDrafts();
  const byCategory = {};
  for (const { product } of built) {
    (byCategory[product.category] ??= []).push(product);
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`NEW CATALOG — ${built.length} products${options.commit ? '' : '   (preview, nothing written)'}`);
  console.log('='.repeat(78));

  for (const [category, products] of Object.entries(byCategory).sort()) {
    console.log(`\n### ${category} (${products.length})`);
    console.log(
      `    ${pad('SKU', 20)} ${pad('cost', 6)} ${pad('price', 6)} ${pad('margin', 8)} ${pad('imgs', 5)} ${pad('q', 4)} product`,
    );
    for (const product of products.sort((a, b) => a.name.localeCompare(b.name))) {
      const price = product.pricing;
      console.log(
        `    ${pad(product.sku, 20)} ${pad(money(price.rdp), 6)} ${pad(money(price.selling_price), 6)} ` +
          `${pad(price.margin_percentage === null ? '—' : `${price.margin_percentage}%`, 8)} ` +
          `${pad(product.images.length, 5)} ${pad(product.metadata.data_quality_score, 4)} ${product.name}`,
      );
    }
  }

  const priced = built.filter(({ product }) => product.pricing.selling_price > 0);
  const images = built.reduce((sum, { images: count }) => sum + count, 0);

  console.log(`\n${'-'.repeat(78)}`);
  console.log(
    `${built.length} products · ${images} photos · ` +
      `${priced.length} priced and publishable · ${built.length - priced.length} awaiting a price`,
  );

  /* ------------------------------- write -------------------------------- */
  if (!options.commit) {
    printGapReport();
    console.log('\nPreview only. Re-run with --commit to write.\n');
    return;
  }

  await connectDatabase();

  const { import_run: importRun, totals } = await importManifest({
    dryRun: false,
    deactivateOthers: !options.keepOthers,
  });

  console.log(
    `\nWritten: ${totals.products_created} created, ${totals.products_updated} updated, ` +
      `${totals.images_linked} photos linked` +
      (totals.locked_fields_preserved > 0
        ? `, ${totals.locked_fields_preserved} manual edits preserved`
        : ''),
  );

  if (totals.deactivated > 0) {
    console.log(
      `${totals.deactivated} product(s) not in the New Catalog were archived and removed from the shop.`,
    );
  }

  console.log(`Average data quality: ${importRun.quality.average_score}/100`);

  printGapReport();
  console.log('\nNext: node scripts/publish-catalog.js --commit    (puts the priced products in the shop)\n');
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
