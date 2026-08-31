/**
 * Imports the curated `New Catalog` manifest.
 *
 * This is a different job from `catalog.service.js`, which reads messy supplier
 * spreadsheets and has to *discover* what each row means. Here the product list
 * is already decided: one folder is one product, and `catalog/new-catalog.manifest.js`
 * states its SKU, category, specs, copy and price with the evidence for each.
 *
 * So this importer discovers nothing. It reads the manifest, attaches the
 * photos sitting in each folder, runs the same pricing and quality passes the
 * spreadsheet importer uses, and writes the result — respecting the same
 * field-level locks, so a manual correction still survives a re-import.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import env from '../../config/env.js';
import logger from '../../shared/utils/logger.js';
import Product from '../product/product.model.js';
import ImportRun from './importRun.model.js';
import { computePricing } from '../pricing/pricing.calculator.js';
import { revalidate, deriveKeys } from './catalog.transformer.js';
import { buildUpdate, ADMIN_OWNED_DEFAULTS } from './catalog.service.js';
import { resolveSlugConflicts, reservedSlugs } from './slug.js';
import { PRODUCTS, CATALOG_ROOT } from '../../../catalog/new-catalog.manifest.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.jfif', '.gif', '.avif']);

const toPosix = (value) => value.split(path.sep).join('/');

/** Percent-encodes each path segment but keeps the slashes readable. */
const toUrl = (relativePath) =>
  `${env.ingestion.imagePublicPath}/${relativePath.split('/').map(encodeURIComponent).join('/')}`;

const resolveRoot = (root = CATALOG_ROOT) =>
  path.isAbsolute(root) ? root : path.join(process.cwd(), root);

/**
 * Collects a product folder's photos, descending into colour sub-folders.
 *
 * Liberty 5 stores its photos under Black/, Blue/, Golden/ and White/. Those
 * are one product in four colours, not four products, so the variant name is
 * carried on each image and the gallery can group by it.
 */
export function scanProductImages(folder, { root = CATALOG_ROOT } = {}) {
  const absoluteFolder = path.join(resolveRoot(root), folder);
  if (!fs.existsSync(absoluteFolder)) return [];

  const collect = (dir, variant) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    const here = [];
    const deeper = [];

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        deeper.push(...collect(full, entry.name));
        continue;
      }
      if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      const relative = toPosix(path.relative(resolveRoot(root), full));
      here.push({ path: relative, url: toUrl(relative), variant, source: folder });
    }

    return [...here, ...deeper];
  };

  const images = collect(absoluteFolder, null);
  return images.map((image, index) => ({ ...image, is_primary: index === 0 }));
}

/**
 * A stable placeholder SKU for a product the supplier never gave a code for.
 *
 * Derived from the folder path, which is this catalog's real identity, so the
 * same folder always yields the same SKU and a re-import updates rather than
 * duplicates. The digest is what makes it unique; the words are for humans.
 */
export function generatePlaceholderSku(folder) {
  const words = folder.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ');
  const slug = words.slice(-3).join('-').toUpperCase().slice(0, 20);
  const digest = crypto.createHash('sha1').update(folder).digest('hex').slice(0, 4).toUpperCase();
  return `BH-${slug}-${digest}`;
}

/**
 * Turns one manifest entry plus its photos into a product draft.
 *
 * Pure: no database, no filesystem. Everything the manifest could not state is
 * left null and reported as an issue rather than filled with a plausible value.
 */
export function buildDraft(entry, images = []) {
  const hasPrice = Boolean(entry.pricing);

  const { pricing } = computePricing(
    {
      // The catalog trades in EGP. Currency is recorded even when no figure is
      // quoted yet, so a price added later is unambiguous.
      currency: entry.pricing?.currency ?? 'EGP',
      rdp: entry.pricing?.rdp ?? null,
      rrp: entry.pricing?.rrp ?? null,
      // What the customer pays is the workbook's Free-Ship List Price, carried
      // in the manifest as `selling_price`. It sits below RRP because it is the
      // agreed sell price plus absorbed shipping, not a retail recommendation —
      // so there is deliberately no fallback to RRP here. A product the
      // workbook never agreed a sell price for has no price at all.
      selling_price: entry.pricing?.selling_price ?? null,
      price_source: entry.pricing?.price_source ?? null,
      last_priced_at: hasPrice ? new Date() : null,
    },
    { thresholds: env.margin },
  );

  const specs = {
    power_wattage: null,
    cable_type: null,
    compatibility: [],
    battery_capacity: null,
    capacity: null,
    interface: null,
    form_factor: null,
    length_m: null,
    color: null,
    warranty_months: null,
    condition: 'unknown',
    features: [],
    attributes: {},
    ...entry.specs,
  };

  const product = {
    name: entry.name,
    brand: entry.brand ?? null,
    sku: entry.sku ?? null,
    category: entry.category ?? null,
    subcategory: entry.subcategory ?? null,
    category_path: [entry.category, entry.subcategory].filter(Boolean),
    tags: entry.tags ?? [],

    description: {
      short: entry.description?.short ?? null,
      long: entry.description?.long ?? null,
    },

    pricing,
    specs,

    inventory: {
      quantity: Number.isFinite(entry.quantity) ? entry.quantity : 0,
      supplier: entry.supplier ?? entry.brand ?? null,
      alternate_suppliers: [],
    },

    status: {
      is_active: true,
      is_generic: entry.is_generic === true,
      is_draft: false,
      lifecycle: 'review',
      procurement: entry.procurement ?? 'unclassified',
    },

    images,

    metadata: {
      source_catalog: CATALOG_ROOT,
      source_sheet: entry.folder,
      source_type: 'manual',
      last_imported_at: new Date(),
      sku_generated: !entry.sku,
      mapping_confidence: 1,
      notes: [
        entry.sku_evidence ? `SKU evidence: ${entry.sku_evidence}` : null,
        entry.pricing?.price_source ? `Price source: ${entry.pricing.price_source}` : null,
        ...(entry.conflicts ?? []),
        ...(entry.gaps ?? []),
      ].filter(Boolean),
      manifest_folder: entry.folder,
      variants: entry.variants ?? [],
    },
  };

  // A generated SKU still has to be stable and unique. A readable slug alone
  // is not: "GENERAL CABLE USB TO TYPE C" and "GENERAL CABLE TYPE C TO TYPE C"
  // both end in "TO TYPE C", and since the fingerprint keys on SKU the two
  // products would have merged into one. The folder digest guarantees
  // uniqueness; the slug is only there to keep the code readable.
  if (!product.sku) product.sku = generatePlaceholderSku(entry.folder);

  deriveKeys(product);

  const extraIssues = [
    ...(entry.conflicts ?? []).map((text) => ({
      code: 'SOURCE_CONFLICT',
      severity: 'high',
      penalty: 8,
      message: text,
      field: 'metadata.notes',
    })),
    ...(entry.gaps ?? []).map((text) => ({
      code: 'INCOMPLETE_SOURCE_DATA',
      severity: 'medium',
      penalty: 0,
      message: text,
      field: 'metadata.notes',
    })),
  ];

  revalidate(product, { thresholds: env.margin, extraIssues });

  return product;
}

/** Builds every draft in the manifest, with photos attached. */
export function buildAllDrafts({ root = CATALOG_ROOT } = {}) {
  const drafts = PRODUCTS.map((entry) => {
    const images = scanProductImages(entry.folder, { root });
    return { entry, product: buildDraft(entry, images), images: images.length };
  });

  // Within-batch uniqueness. Conflicts against already-stored products are
  // resolved again at write time, where the database can be consulted.
  resolveSlugConflicts(drafts.map(({ product }) => product));
  return drafts;
}

/**
 * Imports the manifest.
 *
 * `deactivateOthers` archives anything the manifest does not list. The New
 * Catalog is the current product list, so a leftover row from an older
 * spreadsheet import must not keep appearing in the shop.
 */
export async function importManifest({ dryRun = false, deactivateOthers = true, root = CATALOG_ROOT } = {}) {
  const startedAt = Date.now();
  const built = buildAllDrafts({ root });

  const run = await ImportRun.create({
    source_catalog: CATALOG_ROOT,
    source_file: root,
    source_type: 'manual',
    status: 'running',
    dry_run: dryRun,
    triggered_by: 'manifest',
    started_at: new Date(startedAt),
  });

  try {
    const fingerprints = built.map(({ product }) => product.fingerprint);
    const existingDocs = await Product.find({ fingerprint: { $in: fingerprints } })
      .select('fingerprint metadata.locked_fields status.is_verified status.lifecycle')
      .lean();
    const existingByFingerprint = new Map(existingDocs.map((doc) => [doc.fingerprint, doc]));

    resolveSlugConflicts(
      built.map(({ product }) => product),
      { reservedBy: await reservedSlugs(Product, built.map(({ product }) => product.slug)) },
    );

    const totals = {
      products_created: 0,
      products_updated: 0,
      locked_fields_preserved: 0,
      images_linked: 0,
      deactivated: 0,
    };

    const operations = [];

    for (const { product, images } of built) {
      const existing = existingByFingerprint.get(product.fingerprint);
      const { update, locked_count: lockedCount } = buildUpdate(product, existing);

      if (existing) {
        totals.products_updated += 1;
        totals.locked_fields_preserved += lockedCount;
      } else {
        totals.products_created += 1;
      }
      totals.images_linked += images;

      update['metadata.import_run'] = run._id;

      operations.push({
        updateOne: {
          filter: { fingerprint: product.fingerprint },
          update: {
            $set: update,
            $setOnInsert: { fingerprint: product.fingerprint, ...ADMIN_OWNED_DEFAULTS },
          },
          upsert: true,
        },
      });
    }

    if (!dryRun) {
      for (let i = 0; i < operations.length; i += env.ingestion.batchSize) {
        await Product.bulkWrite(operations.slice(i, i + env.ingestion.batchSize), { ordered: false });
      }
    }

    if (deactivateOthers) {
      const stale = { fingerprint: { $nin: fingerprints }, 'status.is_active': true };
      totals.deactivated = await Product.countDocuments(stale);

      if (!dryRun && totals.deactivated > 0) {
        // Archived, not deleted: the import history and any manual edits stay
        // readable, and the row can be brought back by re-listing it.
        await Product.updateMany(stale, {
          $set: {
            'status.is_active': false,
            'status.is_verified': false,
            'status.lifecycle': 'archived',
          },
        });
      }
    }

    const scores = built.map(({ product }) => product.metadata.data_quality_score);
    const issuesByCode = {};
    for (const { product } of built) {
      for (const issue of product.issues ?? []) {
        issuesByCode[issue.code] = (issuesByCode[issue.code] ?? 0) + 1;
      }
    }

    run.status = 'completed';
    run.finished_at = new Date();
    run.duration_ms = Date.now() - startedAt;
    run.totals = { ...run.totals, ...totals, rows_data: built.length, rows_read: built.length };
    run.quality = {
      average_score: scores.length
        ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
        : null,
      issues_by_code: issuesByCode,
      issues_by_severity: {},
    };
    await run.save();

    return { import_run: run.toObject(), totals, built };
  } catch (error) {
    run.status = 'failed';
    run.finished_at = new Date();
    run.failures = [{ sheet: null, row: null, message: error.message }];
    await run.save().catch(() => {});
    logger.error('manifest import failed', error.message);
    throw error;
  }
}

export { PRODUCTS, CATALOG_ROOT };

export default { importManifest, buildAllDrafts, buildDraft, scanProductImages };
