import { Router } from 'express';
import { z } from 'zod';
import validate from '../../shared/middleware/validate.js';
import requireAdmin from '../../shared/middleware/apiKeyAuth.js';
import asyncHandler from '../../shared/http/asyncHandler.js';
import { ok } from '../../shared/http/ApiResponse.js';
import { SEVERITY } from '../../shared/constants/issues.js';
import qualityService from './quality.service.js';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a 24-character MongoDB ObjectId');

router.get('/rubric', asyncHandler(async (_req, res) => ok(res, qualityService.rubric())));

router.get('/overview', asyncHandler(async (_req, res) => ok(res, await qualityService.overview())));

router.get(
  '/duplicates/sku',
  asyncHandler(async (_req, res) => ok(res, await qualityService.duplicateSkus())),
);

router.get(
  '/duplicates/similar',
  validate({
    query: z.object({
      threshold: z.coerce.number().min(0.5).max(1).default(0.86),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await qualityService.nearDuplicates({ threshold: req.query.threshold, limit: req.query.limit })),
  ),
);

router.get(
  '/worst',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(25),
      severity: z.enum(Object.values(SEVERITY)).optional(),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await qualityService.worst({ limit: req.query.limit, severity: req.query.severity })),
  ),
);

router.get(
  '/:id/explain',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => ok(res, await qualityService.explain(req.params.id))),
);

router.post(
  '/rescore',
  requireAdmin,
  validate({ body: z.object({ dry_run: z.boolean().default(false) }).default({}) }),
  asyncHandler(async (req, res) => ok(res, await qualityService.rescoreAll({ dryRun: req.body.dry_run }))),
);

export default router;
