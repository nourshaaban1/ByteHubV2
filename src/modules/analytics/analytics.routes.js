import { Router } from 'express';
import { z } from 'zod';
import validate from '../../shared/middleware/validate.js';
import asyncHandler from '../../shared/http/asyncHandler.js';
import { ok } from '../../shared/http/ApiResponse.js';
import analyticsService from './analytics.service.js';

const router = Router();

router.get('/dashboard', asyncHandler(async (_req, res) => ok(res, await analyticsService.dashboard())));

router.get('/summary', asyncHandler(async (_req, res) => ok(res, await analyticsService.summary())));

router.get(
  '/inventory-value',
  validate({
    query: z.object({
      group_by: z
        .enum(['category', 'subcategory', 'brand', 'supplier', 'procurement', 'source', 'currency'])
        .default('category'),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await analyticsService.inventoryValue({ groupBy: req.query.group_by })),
  ),
);

router.get(
  '/top-profitable',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      by: z.enum(['total', 'unit']).default('total'),
      min_margin: z.coerce.number().optional(),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await analyticsService.topProfitable({
        limit: req.query.limit,
        by: req.query.by,
        minMargin: req.query.min_margin,
      }),
    ),
  ),
);

router.get('/margin-bands', asyncHandler(async (_req, res) => ok(res, await analyticsService.marginBands())));

router.get(
  '/low-margin',
  validate({
    query: z.object({
      threshold: z.coerce.number().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await analyticsService.lowMarginAlerts({ threshold: req.query.threshold, limit: req.query.limit })),
  ),
);

router.get('/suppliers', asyncHandler(async (_req, res) => ok(res, await analyticsService.supplierBreakdown())));

router.get(
  '/procurement',
  asyncHandler(async (_req, res) => ok(res, await analyticsService.procurementBaskets())),
);

export default router;
