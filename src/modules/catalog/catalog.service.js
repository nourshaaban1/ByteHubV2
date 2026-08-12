import path from 'node:path';
import env from '../../config/env.js';
import logger from '../../shared/utils/logger.js';
import { normalizeKey } from '../../shared/utils/text.js';
import { computeFingerprint, skuKey } from '../../shared/utils/fingerprint.js';
import { flatten, omitPaths, fillMissing } from '../../shared/utils/object.js';
import { badRequest, notFound } from '../../shared/errors/AppError.js';
import Product from '../product/product.model.js';
import ImportRun from './importRun.model.js';
import { readWorkbookFile, readWorkbookBuffer } from './parsers/workbookReader.js';
import { detectHeaderRow } from './parsers/headerDetector.js';
import { mapColumns, inferSheetCurrency } from './parsers/columnMapper.js';
import { classifyRow, ROW_TYPES } from './parsers/rowClassifier.js';
import { transformRow, revalidate, deriveKeys } from './catalog.transformer.js';
import { normalizeCategory } from './cleaners/category.normalizer.js';

/** Sheet names that carry a procurement verdict for every row inside them. */
const SHEET_PROCUREMENT = [
  { test: /must\s*buy/i, status: 'must_buy' },
  { test: /test\s*buy/i, status: 'test_buy' },
  { test: /avoid/i, status: 'avoid' },
  { test: /opportunit/i, status: 'opportunity' },
];

/**
 * Sheets that are never product tables. ByteHub's workbooks mix product rows
 * with prose, roll-ups, and lists of *other* entity types (solutions, services,
 * build blockers) that would otherwise be imported as products.
 * Override per import with `options.sheets` / `options.excludeSheets`.
 */
const NON_PRODUCT_SHEETS = [
  { test: /^overview$/i, reason: 'prose_sheet' },
  { test: /negotiation|kpi/i, reason: 'prose_sheet' },
  { test: /^summary\b|summary by|investment summary/i, reason: 'rollup_sheet' },
  { test: /roadmap|data model|executive summary/i, reason: 'planning_sheet' },
  { test: /corrections?\s*(log)?$/i, reason: 'audit_log_sheet' },
  { test: /solutions|services|build\s*blockers/i, reason: 'not_a_product_entity' },
];

const nonProductReason = (sheetName) =>
  NON_PRODUCT_SHEETS.find((entry) => entry.test.test(sheetName))?.reason ?? null;

/**
 * Import must never clobber a human decision. These paths are always kept
 * from the stored document, on top of whatever is in metadata.locked_fields.
 */
const ADMIN_OWNED_PATHS = [
  'status.is_verified',
  'status.verified_by',
  'status.verified_at',
  'metadata.locked_fields',
  'metadata.overrides',
];

/**
 * Initial values for the admin-owned paths, written once on insert.
 *
 * Refusing to *update* these is right; never *creating* them was a bug. A
 * bulkWrite upsert bypasses document construction, so Mongoose's schema
 * defaults never run, and stripping these paths from the `$set` left them
 * absent rather than at their defaults. An absent field is not `false`:
 * `{ 'status.is_verified': false }` matched none of the catalog, so every
 * "show me the unverified products" query came back empty.
 *
 * $setOnInsert applies only when the upsert creates, so a re-import still
 * cannot touch a product an admin has since verified.
 */
const ADMIN_OWNED_DEFAULTS = Object.freeze({
  'status.is_verified': false,
  'status.verified_by': null,
  'status.verified_at': null,
  'metadata.locked_fields': [],
  'metadata.overrides': [],
});

/** Subdocuments replaced wholesale rather than merged key-by-key. */
const WHOLE_VALUE_PATHS = new Set([
  'specs.attributes',
  'specs.compatibility',
  'specs.features',
  'pricing.detail',
  'pricing.variants',
  'pricing.normalized',
  'metadata.quality_breakdown',
  'metadata.raw',
  'metadata.notes',
  'metadata.cost_mismatch',
  'metadata.unmapped_columns',
  'category_path',
  'alternate_skus',
  'tags',
  'issues',
  'images',
]);

const procurementForSheet = (sheetName) =>
  SHEET_PROCUREMENT.find((entry) => entry.test.test(sheetName))?.status ?? null;

/* ------------------------------------------------------------------ *
 *  Parsing — no database access, fully unit-testable                   *
 * ------------------------------------------------------------------ */

/**
 * Parses one already-read workbook into product drafts plus a per-sheet report.
 *
 * @param {{fileName:string, sheets:Array}} workbook
 * @param {object} options
 * @returns {{ drafts:Array, report:object }}
 */
export function parseWorkbook(workbook, options = {}) {
  const sourceCatalog = options.sourceCatalog ?? workbook.fileName;
  const only = options.sheets?.length ? new Set(options.sheets) : null;
  const excluded = new Set(options.excludeSheets ?? []);

  const drafts = [];
  const sheetReports = [];
  const skippedRows = [];

  for (const sheet of workbook.sheets) {
    if (only && !only.has(sheet.name)) continue;

    const report = {
      name: sheet.name,
      processed: false,
      skip_reason: null,
      rows_total: sheet.rows.length,
      rows_data: 0,
      rows_skipped: 0,
      mapped_columns: [],
      unmapped_columns: [],
    };

    if (excluded.has(sheet.name)) {
      report.skip_reason = 'excluded_by_option';
      sheetReports.push(report);
      continue;
    }

    const nonProduct = only ? null : nonProductReason(sheet.name);
    if (nonProduct) {
      report.skip_reason = nonProduct;
      sheetReports.push(report);
      continue;
    }

    const header = detectHeaderRow(sheet);
    if (!header) {
      report.skip_reason = 'no_header_row_detected';
      sheetReports.push(report);
      continue;
    }

    const mapping = mapColumns(header.cells);
    // A table with SKUs but no name column still describes products — the
    // "Additional Opportunities" sheet names each row in its "Example SKU"
    // cell. The transformer falls back to the SKU text for the name.
    if (!mapping.byField.name && !mapping.byField.sku && !mapping.byField.supplier_sku) {
      report.skip_reason = 'no_product_name_or_sku_column';
      report.header_row = header.index;
      sheetReports.push(report);
      continue;
    }

    const sheetCurrency = inferSheetCurrency(mapping) ?? options.defaultCurrency ?? null;

    report.processed = true;
    report.header_row = header.index;
    report.currency = sheetCurrency;
    report.mapping_confidence = mapping.confidence;
    report.mapped_columns = mapping.columns.map((column) => ({
      header: column.header,
      field: column.field,
      confidence: column.confidence,
      strategy: column.strategy,
      currency: column.currency,
    }));
    report.unmapped_columns = mapping.unmapped.map((column) => column.header);

    const context = {
      sourceCatalog,
      sourceType: options.sourceType ?? 'xlsx',
      sourceLabel: options.sourceLabel ?? sourceCatalog,
      sheetName: sheet.name,
      sheetCurrency,
      defaultCurrency: options.defaultCurrency ?? null,
      defaultSupplier: options.defaultSupplier ?? null,
      procurement: procurementForSheet(sheet.name),
      thresholds: options.thresholds ?? env.margin,
      sectionCategory: null,
    };

    for (const row of sheet.rows) {
      if (row.index <= header.index) continue;

      const classification = classifyRow(row, { headerIndex: header.index, width: sheet.width });

      if (classification.type === ROW_TYPES.SECTION) {
        // "CHARGING & DATA CABLES" applies to every row beneath it until the
        // next divider — that is how product_catalog.xlsx encodes category.
        const resolved = normalizeCategory(classification.text, '');
        context.sectionCategory = resolved.matched ? resolved.category : classification.text;
        continue;
      }

      if (classification.type !== ROW_TYPES.DATA) {
        if (classification.type !== ROW_TYPES.EMPTY) {
          report.rows_skipped += 1;
          skippedRows.push({ sheet: sheet.name, row: row.index, reason: classification.type });
        }
        continue;
      }

      try {
        const { product, skipped, reason } = transformRow(row, mapping, context);
        if (skipped) {
          report.rows_skipped += 1;
          skippedRows.push({ sheet: sheet.name, row: row.index, reason });
          continue;
        }
        report.rows_data += 1;
        drafts.push(product);
      } catch (error) {
        report.rows_skipped += 1;
        skippedRows.push({ sheet: sheet.name, row: row.index, reason: `error: ${error.message}` });
        logger.warn(`row ${sheet.name}!${row.index} failed: ${error.message}`);
      }
    }

    sheetReports.push(report);
  }

  return {
    drafts,
    report: {
      source_catalog: sourceCatalog,
      source_file: workbook.filePath ?? workbook.fileName,
      sheets: sheetReports,
      skipped_rows: skippedRows,
      totals: {
        sheets: sheetReports.length,
        sheets_processed: sheetReports.filter((sheet) => sheet.processed).length,
        rows_read: sheetReports.reduce((sum, sheet) => sum + sheet.rows_total, 0),
        rows_data: sheetReports.reduce((sum, sheet) => sum + sheet.rows_data, 0),
        rows_skipped: sheetReports.reduce((sum, sheet) => sum + sheet.rows_skipped, 0),
      },
    },
  };
}

/**
 * Collapses drafts that describe the same product within one file.
 * Later rows win on a field-by-field basis only where they add information,
 * so a richer duplicate never loses data to a sparser one.
 */
export function dedupeDrafts(drafts) {
  const byFingerprint = new Map();
  let duplicates = 0;

  for (const draft of drafts) {
    const fingerprint = computeFingerprint(draft);
    const existing = byFingerprint.get(fingerprint);

    if (!existing) {
      byFingerprint.set(fingerprint, { ...draft, fingerprint });
      continue;
    }

    duplicates += 1;
    const winner =
      (draft.metadata?.data_quality_score ?? 0) > (existing.metadata?.data_quality_score ?? 0)
        ? draft
        : existing;
    const loser = winner === draft ? existing : draft;

    // A product that appears in three catalogs gets one issue listing all
    // three, not three copies of the same issue.
    const sources = [
      ...(existing.metadata?.duplicate_sources ?? []),
      {
        catalog: loser.metadata?.source_catalog,
        sheet: loser.metadata?.source_sheet,
        row: loser.metadata?.source_row,
      },
    ];

    // The winner keeps every field it has, and inherits the ones it lacks.
    // Without this, the Action Plan's row for Anker A8852 (which quotes only a
    // verified cost) would silently discard the Master Catalog's record that
    // the plan's own figure disagreed with it.
    const merged = { ...fillMissing(winner, loser), fingerprint };

    merged.metadata = {
      ...merged.metadata,
      notes: [...new Set([...(winner.metadata?.notes ?? []), ...(loser.metadata?.notes ?? [])])],
      duplicate_sources: sources,
    };

    // The merged row is a different product from either input, so its keys,
    // issues and score are recomputed rather than inherited.
    deriveKeys(merged);
    revalidate(merged, {
      extraIssues: [
        {
          code: 'DUPLICATE_PRODUCT',
          severity: 'high',
          penalty: 15,
          message: `Also present in ${sources.length} other catalog row(s); the highest-quality row was kept`,
          field: 'fingerprint',
          context: { sources },
        },
      ],
    });

    byFingerprint.set(fingerprint, merged);
  }

  return { drafts: [...byFingerprint.values()], duplicates };
}

/* ------------------------------------------------------------------ *
 *  Persistence                                                        *
 * ------------------------------------------------------------------ */

/**
 * Builds the `$set` for one draft against its stored counterpart, dropping
 * every path the admin owns or has explicitly locked.
 */
export function buildUpdate(draft, existing) {
  const flat = flatten(draft, { stopAt: WHOLE_VALUE_PATHS });
  const locked = existing?.metadata?.locked_fields ?? [];
  const blocked = [...ADMIN_OWNED_PATHS, ...locked];

  // A verified product keeps its lifecycle: re-import must not send it back to review.
  if (existing?.status?.is_verified) blocked.push('status.lifecycle');

  const update = omitPaths(flat, blocked);
  delete update.fingerprint;

  return { update, locked_count: locked.length };
}

async function persistDrafts(drafts, { dryRun, importRunId }) {
  const totals = {
    products_created: 0,
    products_updated: 0,
    products_unchanged: 0,
    locked_fields_preserved: 0,
  };

  if (drafts.length === 0) return totals;

  const fingerprints = drafts.map((draft) => draft.fingerprint);
  const existingDocs = await Product.find({ fingerprint: { $in: fingerprints } })
    .select('fingerprint metadata.locked_fields status.is_verified status.lifecycle')
    .lean();
  const existingByFingerprint = new Map(existingDocs.map((doc) => [doc.fingerprint, doc]));

  const operations = [];

  for (const draft of drafts) {
    const existing = existingByFingerprint.get(draft.fingerprint);
    const { update, locked_count: lockedCount } = buildUpdate(draft, existing);

    if (existing) {
      totals.products_updated += 1;
      totals.locked_fields_preserved += lockedCount;
    } else {
      totals.products_created += 1;
    }

    if (importRunId) update['metadata.import_run'] = importRunId;

    operations.push({
      updateOne: {
        filter: { fingerprint: draft.fingerprint },
        update: {
          $set: update,
          $setOnInsert: { fingerprint: draft.fingerprint, ...ADMIN_OWNED_DEFAULTS },
        },
        upsert: true,
      },
    });
  }

  if (dryRun) return totals;

  for (let i = 0; i < operations.length; i += env.ingestion.batchSize) {
    await Product.bulkWrite(operations.slice(i, i + env.ingestion.batchSize), { ordered: false });
  }

  return totals;
}

function summariseQuality(drafts) {
  const byCode = {};
  const bySeverity = {};
  let scoreSum = 0;

  for (const draft of drafts) {
    scoreSum += draft.metadata?.data_quality_score ?? 0;
    for (const issue of draft.issues ?? []) {
      byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
      bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
    }
  }

  return {
    average_score: drafts.length ? Math.round((scoreSum / drafts.length) * 10) / 10 : null,
    issues_by_code: byCode,
    issues_by_severity: bySeverity,
  };
}

/**
 * Full ingestion: read -> parse -> dedupe -> persist -> audit.
 *
 * @param {{ filePath?:string, buffer?:Buffer, fileName?:string }} source
 * @param {object} options
 */
export async function ingest(source, options = {}) {
  const startedAt = Date.now();

  const workbook = source.buffer
    ? readWorkbookBuffer(source.buffer, source.fileName ?? 'upload.xlsx')
    : readWorkbookFile(source.filePath);

  const sourceCatalog =
    options.sourceCatalog ?? path.basename(workbook.fileName, path.extname(workbook.fileName));

  const { drafts: parsed, report } = parseWorkbook(workbook, { ...options, sourceCatalog });
  const { drafts, duplicates } = dedupeDrafts(parsed);

  const run = await ImportRun.create({
    source_catalog: sourceCatalog,
    source_file: report.source_file,
    source_type: options.sourceType ?? 'xlsx',
    status: 'running',
    dry_run: Boolean(options.dryRun),
    triggered_by: options.triggeredBy ?? 'cli',
    started_at: new Date(startedAt),
  });

  try {
    const totals = await persistDrafts(drafts, {
      dryRun: options.dryRun,
      importRunId: run._id,
    });

    run.status = 'completed';
    run.finished_at = new Date();
    run.duration_ms = Date.now() - startedAt;
    run.totals = {
      ...report.totals,
      ...totals,
      duplicates_in_file: duplicates,
    };
    run.quality = summariseQuality(drafts);
    run.sheets = report.sheets;
    run.skipped_rows = report.skipped_rows.slice(0, 500);
    await run.save();

    return {
      import_run: run.toObject(),
      products: options.includeProducts ? drafts : undefined,
    };
  } catch (error) {
    run.status = 'failed';
    run.finished_at = new Date();
    run.duration_ms = Date.now() - startedAt;
    run.failures = [{ sheet: null, row: null, message: error.message }];
    await run.save().catch(() => {});
    throw error;
  }
}

/** Parse-only preview: shows exactly what an import would do, touching nothing. */
export function preview(source, options = {}) {
  const workbook = source.buffer
    ? readWorkbookBuffer(source.buffer, source.fileName ?? 'upload.xlsx')
    : readWorkbookFile(source.filePath);

  const sourceCatalog =
    options.sourceCatalog ?? path.basename(workbook.fileName, path.extname(workbook.fileName));

  const { drafts: parsed, report } = parseWorkbook(workbook, { ...options, sourceCatalog });
  const { drafts, duplicates } = dedupeDrafts(parsed);

  return {
    source_catalog: sourceCatalog,
    sheets: report.sheets,
    totals: { ...report.totals, duplicates_in_file: duplicates, products: drafts.length },
    quality: summariseQuality(drafts),
    skipped_rows: report.skipped_rows.slice(0, 100),
    sample: drafts.slice(0, options.sampleSize ?? 10),
  };
}

export async function listImportRuns({ page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ImportRun.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ImportRun.countDocuments(),
  ]);
  return { items, total, page, limit };
}

export async function getImportRun(id) {
  const run = await ImportRun.findById(id).lean();
  if (!run) throw notFound('Import run', id);
  return run;
}

/** Cross-document SKU collision report, used after an import and by /quality. */
export async function findSkuCollisions() {
  const groups = await Product.aggregate([
    { $match: { sku_key: { $type: 'string', $ne: '' }, 'metadata.sku_generated': { $ne: true } } },
    {
      $group: {
        _id: '$sku_key',
        count: { $sum: 1 },
        products: {
          $push: {
            _id: '$_id',
            name: '$name',
            brand: '$brand',
            sku: '$sku',
            source: '$metadata.source_catalog',
            sheet: '$metadata.source_sheet',
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  return groups.map((group) => ({
    sku_key: group._id,
    count: group.count,
    products: group.products,
    // Same code + same name = a true duplicate row. Same code + different
    // names = the supplier reusing a code, which needs a human decision.
    kind:
      new Set(group.products.map((product) => normalizeKey(product.name))).size === 1
        ? 'duplicate_row'
        : 'reused_model_code',
  }));
}

export function assertImportable(fileName) {
  const extension = path.extname(fileName ?? '').toLowerCase();
  if (!['.xlsx', '.xlsm', '.xls', '.csv', '.tsv'].includes(extension)) {
    throw badRequest(`Unsupported import file '${fileName}'`);
  }
}

export { skuKey };

export default {
  ingest,
  preview,
  parseWorkbook,
  dedupeDrafts,
  buildUpdate,
  listImportRuns,
  getImportRun,
  findSkuCollisions,
};
