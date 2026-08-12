import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import validate from '../../shared/middleware/validate.js';
import requireAdmin from '../../shared/middleware/apiKeyAuth.js';
import asyncHandler from '../../shared/http/asyncHandler.js';
import { ok, accepted } from '../../shared/http/ApiResponse.js';
import { badRequest } from '../../shared/errors/AppError.js';
import { CURRENCIES } from '../../shared/constants/enums.js';
import catalogService from './catalog.service.js';
import imagesService, { DEFAULT_THRESHOLD } from './images.service.js';
import { isSupportedFile } from './parsers/workbookReader.js';
import { COLUMN_DEFINITIONS } from './config/columnAliases.js';
import { TAXONOMY } from './config/taxonomy.js';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a 24-character MongoDB ObjectId');

/** In-memory upload: catalogs are spreadsheets, not media, so they stay small. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!isSupportedFile(file.originalname)) {
      callback(badRequest(`Unsupported file type '${path.extname(file.originalname)}'`));
      return;
    }
    callback(null, true);
  },
});

const importOptions = z.object({
  source_catalog: z.string().trim().max(120).optional(),
  sheets: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : value.split(',').map((s) => s.trim())))
    .optional(),
  exclude_sheets: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : value.split(',').map((s) => s.trim())))
    .optional(),
  default_currency: z.enum(CURRENCIES).optional(),
  default_supplier: z.string().trim().max(120).optional(),
  dry_run: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(false),
});

const toServiceOptions = (body, req) => ({
  sourceCatalog: body.source_catalog,
  sheets: body.sheets,
  excludeSheets: body.exclude_sheets,
  defaultCurrency: body.default_currency,
  defaultSupplier: body.default_supplier,
  dryRun: body.dry_run,
  triggeredBy: req.admin?.key ?? 'api',
});

const requireFile = (req) => {
  if (!req.file) throw badRequest('Attach a spreadsheet as the "file" form field');
  return { buffer: req.file.buffer, fileName: req.file.originalname };
};

/** POST /catalog/import — ingest an uploaded catalog. */
router.post(
  '/import',
  requireAdmin,
  upload.single('file'),
  validate({ body: importOptions }),
  asyncHandler(async (req, res) => {
    const result = await catalogService.ingest(requireFile(req), toServiceOptions(req.body, req));
    accepted(res, result.import_run);
  }),
);

/** POST /catalog/preview — parse only, persist nothing. */
router.post(
  '/preview',
  requireAdmin,
  upload.single('file'),
  validate({
    body: importOptions.extend({
      sample_size: z.coerce.number().int().min(1).max(50).default(10),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = catalogService.preview(requireFile(req), {
      ...toServiceOptions(req.body, req),
      sampleSize: req.body.sample_size,
    });
    ok(res, result);
  }),
);

router.get(
  '/imports',
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await catalogService.listImportRuns(req.query);
    res.status(200).json({
      success: true,
      data: result.items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  }),
);

router.get(
  '/imports/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => ok(res, await catalogService.getImportRun(req.params.id))),
);

router.get(
  '/sku-collisions',
  asyncHandler(async (_req, res) => ok(res, await catalogService.findSkuCollisions())),
);

/* --------------------------- image management --------------------------- */

const thresholdQuery = z.object({
  threshold: z.coerce.number().min(0.3).max(1).default(DEFAULT_THRESHOLD),
  suggestions: z.coerce.number().int().min(1).max(10).default(3),
});

router.get(
  '/images',
  validate({ query: thresholdQuery }),
  asyncHandler(async (req, res) =>
    ok(res, await imagesService.overview({
      threshold: req.query.threshold,
      suggestions: req.query.suggestions,
    })),
  ),
);

router.post(
  '/images/link',
  requireAdmin,
  validate({
    body: z.object({
      folder: z.string().trim().min(1),
      product_id: objectId,
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await imagesService.linkFolder(req.body.folder, req.body.product_id)),
  ),
);

router.post(
  '/images/unlink',
  requireAdmin,
  validate({ body: z.object({ product_id: objectId }) }),
  asyncHandler(async (req, res) => ok(res, await imagesService.unlinkProduct(req.body.product_id))),
);

/** Auto-match. Defaults to a dry run: the UI previews before committing. */
router.post(
  '/images/auto-link',
  requireAdmin,
  validate({
    body: z
      .object({
        threshold: z.coerce.number().min(0.3).max(1).default(DEFAULT_THRESHOLD),
        dry_run: z.boolean().default(true),
      })
      .default({}),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await imagesService.autoLink({ threshold: req.body.threshold, dryRun: req.body.dry_run })),
  ),
);

/** The mapping dictionary itself — makes the pipeline inspectable, not magic. */
router.get('/mapping', (_req, res) => {
  ok(res, {
    columns: COLUMN_DEFINITIONS.map((definition) => ({
      field: definition.field,
      specificity: definition.specificity,
      aliases: definition.aliases,
      patterns: (definition.patterns ?? []).map(String),
    })),
    taxonomy: TAXONOMY.map((entry) => ({
      category: entry.category,
      slug: entry.slug,
      match: entry.match,
      subcategories: entry.subcategories?.map((sub) => sub.name) ?? [],
    })),
  });
});

export default router;
