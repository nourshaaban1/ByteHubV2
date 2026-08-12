#!/usr/bin/env node
/**
 * ByteHub catalog import CLI.
 *
 *   node scripts/import.js --all
 *   node scripts/import.js ByteHub_Master_Catalog.xlsx
 *   node scripts/import.js Merged_Catalog.xlsx --dry-run
 *   node scripts/import.js product_catalog.xlsx --sheet "Product Catalog"
 *   node scripts/import.js --all --preview        # parse only, print a report
 */
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import env from '../src/config/env.js';
import logger from '../src/shared/utils/logger.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import catalogService from '../src/modules/catalog/catalog.service.js';
import qualityService from '../src/modules/quality/quality.service.js';
import { isSupportedFile } from '../src/modules/catalog/parsers/workbookReader.js';

const CWD = process.cwd();

function parseArgs(argv) {
  const options = {
    files: [],
    all: false,
    dryRun: false,
    preview: false,
    sheets: [],
    excludeSheets: [],
    defaultCurrency: undefined,
    defaultSupplier: undefined,
    skipRescore: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];

    switch (arg) {
      case '--all': options.all = true; break;
      case '--dry-run': options.dryRun = true; break;
      case '--preview': options.preview = true; break;
      case '--sheet': options.sheets.push(next()); break;
      case '--exclude-sheet': options.excludeSheets.push(next()); break;
      case '--currency': options.defaultCurrency = next()?.toUpperCase(); break;
      case '--supplier': options.defaultSupplier = next(); break;
      case '--no-rescore': options.skipRescore = true; break;
      case '--help':
      case '-h': options.help = true; break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown flag '${arg}'`);
        options.files.push(arg);
    }
  }

  return options;
}

const HELP = `
ByteHub catalog import

Usage:
  node scripts/import.js [files...] [flags]

Flags:
  --all               Import every supported spreadsheet in the project root
  --dry-run           Parse and report, but write no products (the run is still logged)
  --preview           Parse only; print a report and exit without touching the database
  --sheet <name>      Restrict to a sheet (repeatable)
  --exclude-sheet <name>
  --currency <EGP|USD>  Currency to assume when a sheet does not declare one
  --supplier <name>   Supplier to assume when a sheet has no supplier column
  --no-rescore        Skip the cross-catalog duplicate-SKU pass afterwards
  -h, --help
`;

function discoverFiles() {
  return fs
    .readdirSync(CWD)
    .filter((name) => isSupportedFile(name) && !name.startsWith('~$'))
    .map((name) => path.join(CWD, name))
    .sort();
}

function resolveFiles(options) {
  if (options.all) return discoverFiles();

  return options.files.map((file) => {
    const resolved = path.isAbsolute(file) ? file : path.join(CWD, file);
    if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
    return resolved;
  });
}

const pct = (value) => (value === null || value === undefined ? '—' : `${value}`);

function printSheets(sheets) {
  for (const sheet of sheets) {
    if (!sheet.processed) {
      console.log(`    - ${sheet.name.padEnd(28)} skipped (${sheet.skip_reason})`);
      continue;
    }
    console.log(
      `    ✓ ${sheet.name.padEnd(28)} header row ${String(sheet.header_row).padEnd(3)}` +
        ` ${String(sheet.rows_data).padStart(3)} products` +
        `  currency=${sheet.currency ?? '—'}` +
        `  mapping=${Math.round((sheet.mapping_confidence ?? 0) * 100)}%`,
    );
    if (sheet.unmapped_columns?.length) {
      console.log(`      unmapped columns: ${sheet.unmapped_columns.join(', ')}`);
    }
  }
}

function printIssues(issuesByCode) {
  const entries = Object.entries(issuesByCode ?? {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return;
  console.log('    issues: ' + entries.map(([code, count]) => `${code}=${count}`).join('  '));
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || (!options.all && options.files.length === 0)) {
    console.log(HELP);
    process.exit(options.help ? 0 : 1);
  }

  const files = resolveFiles(options);
  if (files.length === 0) {
    console.error('No supported spreadsheets found.');
    process.exit(1);
  }

  const serviceOptions = {
    sheets: options.sheets.length ? options.sheets : undefined,
    excludeSheets: options.excludeSheets.length ? options.excludeSheets : undefined,
    defaultCurrency: options.defaultCurrency,
    defaultSupplier: options.defaultSupplier,
    dryRun: options.dryRun,
    triggeredBy: 'cli',
  };

  /* ---------------------------- preview mode ---------------------------- */
  if (options.preview) {
    for (const file of files) {
      const result = catalogService.preview({ filePath: file }, serviceOptions);
      console.log(`\n${path.basename(file)}`);
      printSheets(result.sheets);
      console.log(
        `    => ${result.totals.products} products` +
          ` (${result.totals.rows_data} rows, ${result.totals.duplicates_in_file} duplicates merged,` +
          ` ${result.totals.rows_skipped} rows skipped)`,
      );
      console.log(`    average quality: ${pct(result.quality.average_score)}/100`);
      printIssues(result.quality.issues_by_code);
    }
    return;
  }

  /* ---------------------------- import mode ----------------------------- */
  await connectDatabase();
  logger.info(`connected to ${env.mongoUri}`);

  const summary = { created: 0, updated: 0, products: 0, locked: 0 };

  for (const file of files) {
    console.log(`\n${path.basename(file)}${options.dryRun ? '  (dry run)' : ''}`);
    const { import_run: run } = await catalogService.ingest({ filePath: file }, serviceOptions);

    printSheets(run.sheets);
    console.log(
      `    => created ${run.totals.products_created}, updated ${run.totals.products_updated},` +
        ` ${run.totals.duplicates_in_file} duplicates merged,` +
        ` ${run.totals.rows_skipped} rows skipped` +
        `  [${run.duration_ms}ms]`,
    );
    if (run.totals.locked_fields_preserved > 0) {
      console.log(`    ${run.totals.locked_fields_preserved} manually-edited fields preserved`);
    }
    console.log(`    average quality: ${pct(run.quality.average_score)}/100`);
    printIssues(run.quality.issues_by_code);

    summary.created += run.totals.products_created;
    summary.updated += run.totals.products_updated;
    summary.locked += run.totals.locked_fields_preserved;
  }

  /* -------- cross-catalog pass: only meaningful once all files are in ----- */
  if (!options.dryRun && !options.skipRescore) {
    const rescore = await qualityService.rescoreAll();
    console.log(
      `\nCross-catalog pass: ${rescore.examined} products rescored,` +
        ` ${rescore.sku_collisions} SKU collisions flagged` +
        ` (${rescore.improved} improved, ${rescore.degraded} degraded)`,
    );
  }

  console.log(
    `\nDone. ${summary.created} created, ${summary.updated} updated,` +
      ` ${summary.locked} manual overrides preserved.`,
  );
}

run()
  .catch((error) => {
    logger.error(error.message);
    if (!env.isProduction) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase().catch(() => {});
  });
