import env from '../../config/env.js';
import { cleanText, normalizeKey, slugify } from '../../shared/utils/text.js';
import { computeFingerprint, skuKey } from '../../shared/utils/fingerprint.js';
import { MONEY_FIELDS, PERCENT_FIELDS, NUMERIC_FIELDS } from './config/columnAliases.js';
import { parseMoney, parsePercent, parseInteger } from './cleaners/money.cleaner.js';
import { normalizeBrand, inferBrandFromName } from './cleaners/brand.normalizer.js';
import { normalizeCategory } from './cleaners/category.normalizer.js';
import { normalizeSku, generateSku } from './cleaners/sku.cleaner.js';
import { extractSpecs, splitFeatures } from './cleaners/spec.extractor.js';
import { detectGeneric, detectProcurementStatus } from './cleaners/generic.detector.js';
import { computePricing } from '../pricing/pricing.calculator.js';
import { validateProduct } from '../quality/quality.validator.js';
import { scoreProduct } from '../quality/quality.scorer.js';

const detailFrom = (parsed) =>
  parsed && parsed.ok
    ? {
        value: parsed.value,
        min: parsed.min,
        max: parsed.max,
        is_range: parsed.is_range,
        is_estimated: parsed.is_estimated,
        raw: parsed.raw,
      }
    : undefined;

/**
 * Reads one row through the column mapping into canonical, typed values.
 * Money/percent/integer columns are parsed here so downstream code never sees
 * a raw spreadsheet string.
 */
export function extractFields(row, mapping, context = {}) {
  const cells = row.cells ?? [];
  const fields = {};
  const parsed = {};
  const raw = {};

  for (const column of mapping.columns) {
    const cell = cells[column.index];
    raw[column.header] = cell;
    if (cell === null || cell === undefined || cell === '') continue;

    if (MONEY_FIELDS.has(column.field)) {
      const money = parseMoney(cell, {
        // Column header wins over the sheet-wide guess: a workbook can mix
        // "Est. Price (USD)" and "RDP (verified, EGP)" side by side.
        defaultCurrency: column.currency ?? context.sheetCurrency ?? null,
        assumeEstimate: column.is_estimate,
      });
      parsed[column.field] = money;
      fields[column.field] = money.value;
      continue;
    }

    if (PERCENT_FIELDS.has(column.field)) {
      fields[column.field] = parsePercent(cell);
      continue;
    }

    if (NUMERIC_FIELDS.has(column.field)) {
      fields[column.field] = parseInteger(cell);
      continue;
    }

    fields[column.field] = typeof cell === 'string' ? cleanText(cell) : cell;
  }

  // Unmapped columns are preserved verbatim rather than dropped.
  const extras = {};
  for (const column of mapping.unmapped) {
    const cell = cells[column.index];
    raw[column.header] = cell;
    if (cell === null || cell === undefined || cell === '') continue;
    extras[column.header] = typeof cell === 'string' ? cleanText(cell) : String(cell);
  }

  return { fields, parsed, raw, extras };
}

/** "Joyroom JR-TCG13" -> { supplier: 'Joyroom', sku: 'JR-TCG13' } */
export function splitSupplierSku(value) {
  const text = cleanText(value);
  if (!text) return { supplier: null, sku: null };

  const explicit = text.match(/^(.+?)\s*\/\s*(.+)$/);
  if (explicit) return { supplier: cleanText(explicit[1]), sku: cleanText(explicit[2]) };

  // "Joyroom JR-TCG13", "Anker A2149": first token is the supplier when the
  // remainder looks like a model code.
  const spaced = text.match(/^(\S+)\s+(.+)$/);
  if (spaced && /\d/.test(spaced[2])) {
    return { supplier: cleanText(spaced[1]), sku: cleanText(spaced[2]) };
  }

  return { supplier: null, sku: text };
}

/**
 * Turns one classified data row into a product draft: cleaned, typed,
 * priced, validated and scored. Pure — no database access — so the whole
 * pipeline is unit-testable against fixture rows.
 *
 * @returns {{ product:object|null, skipped:boolean, reason?:string, issues:Array }}
 */
export function transformRow(row, mapping, context = {}) {
  const { fields, parsed, raw, extras } = extractFields(row, mapping, context);

  /* ---------------------------- identity ---------------------------- */
  let supplier = fields.supplier ?? context.defaultSupplier ?? null;
  let skuText = fields.sku ?? null;

  if (fields.supplier_sku) {
    const split = splitSupplierSku(fields.supplier_sku);
    supplier = supplier ?? split.supplier;
    skuText = skuText ?? split.sku;
  }

  // Some sheets name the product only in their SKU column
  // ("Robovac G50 Hybrid (T2212)" under a header of "Example SKU").
  const name = fields.name ?? (skuText ? cleanText(skuText) : null);
  if (!name) {
    return { product: null, skipped: true, reason: 'no_product_name', issues: [] };
  }

  // Brand column -> supplier column -> a brand name inside the product name.
  const brand = normalizeBrand(fields.brand ?? supplier ?? inferBrandFromName(name));
  const category = normalizeCategory(
    fields.category ?? context.sectionCategory ?? null,
    name,
  );
  const sku = normalizeSku(skuText);
  const generic = detectGeneric({
    name,
    brand: brand.raw,
    sku: sku.sku,
    notes: fields.notes,
    action: fields.action,
    condition: fields.condition,
  });

  const skuGenerated = !sku.sku;
  // Deliberately excludes the sheet name: the same product listed in two
  // sheets must generate the same SKU, or it will not dedupe.
  const finalSku = sku.sku ?? generateSku({
    name,
    brand: brand.brand,
    category: category.category,
    capacity: fields.capacity,
  });

  /* ----------------------------- pricing ---------------------------- */
  const currency =
    parsed.rdp?.currency ??
    parsed.selling_price?.currency ??
    parsed.rrp?.currency ??
    (fields.currency ? String(fields.currency).toUpperCase() : null) ??
    context.sheetCurrency ??
    context.defaultCurrency ??
    null;

  const rdp = fields.rdp ?? fields.rdp_reported ?? null;
  const rrp = fields.rrp ?? fields.rrp_reported ?? null;
  const sellingPrice = fields.selling_price ?? rrp ?? null;

  const isEstimated = Boolean(
    parsed.rdp?.is_estimated || parsed.selling_price?.is_estimated || parsed.rrp?.is_estimated,
  );

  const { pricing } = computePricing(
    {
      currency,
      rdp,
      rrp,
      selling_price: sellingPrice,
      market_low: parsed.market_price?.min ?? null,
      market_high: parsed.market_price?.max ?? null,
      detail: {
        rdp: detailFrom(parsed.rdp),
        rrp: detailFrom(parsed.rrp),
        selling_price: detailFrom(parsed.selling_price),
        market: detailFrom(parsed.market_price),
      },
      variants: parsed.selling_price?.variants ?? parsed.rrp?.variants ?? [],
      is_estimated: isEstimated,
      price_source: context.sourceLabel ?? null,
      last_priced_at: new Date(),
    },
    { thresholds: context.thresholds },
  );

  /* ------------------------------ specs ----------------------------- */
  const specs = extractSpecs(fields, { category: category.category });
  specs.attributes = { ...extras };

  if (fields.specs_raw && specs.features.length === 0) {
    specs.features = splitFeatures(fields.specs_raw);
  }

  /* --------------------------- provenance --------------------------- */
  const notes = [];
  if (fields.notes) notes.push(cleanText(fields.notes));
  if (fields.action) notes.push(cleanText(fields.action));
  if (parsed.market_price?.note) notes.push(`market: ${parsed.market_price.note}`);

  // The plan's own RDP disagreeing with the verified list is the single most
  // expensive defect in ByteHub's data — record it explicitly.
  const costMismatch =
    Number.isFinite(fields.rdp) &&
    Number.isFinite(fields.rdp_reported) &&
    fields.rdp !== fields.rdp_reported
      ? { reported: fields.rdp_reported, verified: fields.rdp, delta: fields.rdp - fields.rdp_reported }
      : null;

  const product = {
    name,
    brand: brand.brand,
    sku: finalSku,
    alternate_skus: sku.alternates,
    category: category.category,
    subcategory: category.subcategory,
    category_path: category.path,
    tags: fields.tags ? cleanText(fields.tags).split(/\s*,\s*/).filter(Boolean) : [],

    description: {
      short: fields.short_description ?? null,
      long: fields.long_description ?? null,
    },

    pricing,
    specs,

    inventory: {
      quantity: Number.isFinite(fields.quantity) ? Math.max(0, fields.quantity) : 0,
      supplier: supplier ? cleanText(supplier) : brand.brand,
      alternate_suppliers: [],
      warehouse: fields.warehouse ?? null,
    },

    status: {
      is_verified: false,
      is_active: !generic.is_draft,
      is_generic: generic.is_generic || brand.is_generic,
      is_draft: generic.is_draft,
      lifecycle: generic.is_draft ? 'draft' : 'review',
      procurement:
        detectProcurementStatus(fields.action ?? context.sheetName) ??
        context.procurement ??
        'unclassified',
    },

    images: [],

    metadata: {
      source_catalog: context.sourceCatalog ?? null,
      source_sheet: context.sheetName ?? null,
      source_row: row.index,
      source_type: context.sourceType ?? 'xlsx',
      last_imported_at: new Date(),
      mapping_confidence: mapping.confidence,
      unmapped_columns: Object.keys(extras),
      sku_generated: skuGenerated,
      sku_corrected: sku.corrected_from,
      sku_ambiguous: sku.is_ambiguous,
      category_unmapped: !category.matched,
      cost_mismatch: costMismatch,
      brand_multi: brand.is_multi,
      reported_margin: fields.margin_reported ?? null,
      extended_cost: fields.extended_cost ?? null,
      notes,
      raw,
    },
  };

  /* -------------------------- validate & score ---------------------- */
  deriveKeys(product);
  const issues = revalidate(product, { thresholds: context.thresholds });

  return { product, skipped: false, issues };
}

/**
 * Populates the lower-cased lookup keys and the identity fingerprint.
 *
 * The Product model computes these in a `pre('validate')` hook, but import
 * persists through `bulkWrite`, which bypasses document middleware entirely.
 * Without this the imported rows would have no `brand_key` or `sku_key`, so
 * brand filtering and duplicate-SKU detection would silently return nothing.
 */
export function deriveKeys(product) {
  product.name_key = normalizeKey(product.name);
  product.brand_key = product.brand ? normalizeKey(product.brand) : null;
  product.sku_key = skuKey(product.sku);
  if (!product.slug) product.slug = slugify(product.name);
  product.fingerprint = computeFingerprint(product);
  return product;
}

/**
 * Re-derives issues and the quality score for a product, in place.
 *
 * Called once per row at transform time and again after two duplicate rows are
 * merged — the merged product is a different product, so its issues must be
 * recomputed rather than inherited (otherwise a row that gained a price from
 * its duplicate would keep the other row's MISSING_COST).
 *
 * @returns {Array} the issues, with penalties still attached
 */
export function revalidate(product, options = {}) {
  const issues = validateProduct(product, options);

  if (product.metadata?.sku_ambiguous) {
    issues.push({
      code: 'AMBIGUOUS_SKU',
      severity: 'high',
      message: 'Supplier reuses this model code for more than one product',
      penalty: 15,
      field: 'sku',
      context: { sku: product.sku, alternates: product.alternate_skus },
    });
  }

  for (const extra of options.extraIssues ?? []) issues.push(extra);

  const scored = scoreProduct(product, issues);
  product.issues = issues.map(({ penalty, ...issue }) => issue);
  product.metadata.data_quality_score = scored.score;
  product.metadata.completeness = scored.completeness;
  product.metadata.quality_breakdown = scored.breakdown;

  return issues;
}

export const defaultContext = () => ({
  defaultCurrency: env.baseCurrency,
  thresholds: env.margin,
});

export default { transformRow, extractFields, splitSupplierSku };
