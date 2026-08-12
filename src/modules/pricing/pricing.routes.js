import { Router } from 'express';
import { z } from 'zod';
import validate from '../../shared/middleware/validate.js';
import requireAdmin from '../../shared/middleware/apiKeyAuth.js';
import asyncHandler from '../../shared/http/asyncHandler.js';
import { ok } from '../../shared/http/ApiResponse.js';
import { CURRENCIES } from '../../shared/constants/enums.js';
import pricingService from './pricing.service.js';

const router = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a 24-character MongoDB ObjectId');

const quoteBody = z
  .object({
    rdp: z.coerce.number().min(0),
    selling_price: z.coerce.number().min(0).optional(),
    rrp: z.coerce.number().min(0).optional(),
    currency: z.enum(CURRENCIES).default('EGP'),
    target_margin: z.coerce.number().optional(),
  })
  .refine((body) => body.selling_price !== undefined || body.rrp !== undefined, {
    message: 'Provide selling_price or rrp',
    path: ['selling_price'],
  });

const alertsQuery = z.object({
  band: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : value.split(',')))
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  include_inactive: z.enum(['true', 'false']).transform((v) => v === 'true').default('false'),
});

router.get(
  '/policy',
  asyncHandler(async (_req, res) => ok(res, pricingService.policy())),
);

router.post(
  '/quote',
  validate({ body: quoteBody }),
  asyncHandler(async (req, res) => ok(res, pricingService.quote(req.body))),
);

router.get(
  '/alerts',
  validate({ query: alertsQuery }),
  asyncHandler(async (req, res) =>
    ok(res, await pricingService.alerts({
      band: req.query.band,
      limit: req.query.limit,
      includeInactive: req.query.include_inactive,
    })),
  ),
);

router.get(
  '/loss-makers',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }) }),
  asyncHandler(async (req, res) => ok(res, await pricingService.lossMakers({ limit: req.query.limit }))),
);

router.get(
  '/:id/suggest',
  validate({
    params: z.object({ id: objectId }),
    query: z.object({ target_margin: z.coerce.number().optional() }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await pricingService.suggestPrice(req.params.id, { targetMargin: req.query.target_margin })),
  ),
);

router.post(
  '/recalculate',
  requireAdmin,
  validate({ body: z.object({ dry_run: z.boolean().default(false) }).default({}) }),
  asyncHandler(async (req, res) =>
    ok(res, await pricingService.recalculateAll({ dryRun: req.body.dry_run })),
  ),
);

export default router;
