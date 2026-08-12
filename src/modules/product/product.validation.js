import { z } from 'zod';
import {
  CURRENCIES,
  PROCUREMENT_STATUS,
  LIFECYCLE,
  CONDITIONS,
} from '../../shared/constants/enums.js';
import { issueCodes, SEVERITY } from '../../shared/constants/issues.js';
import { MAX_LIMIT } from '../../shared/utils/pagination.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a 24-character MongoDB ObjectId');

/** Query strings arrive as text; coerce explicitly rather than trusting Mongo. */
const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const numeric = z.coerce.number().finite();
const positive = numeric.min(0, 'Must not be negative');
const csv = z.union([z.string(), z.array(z.string())]).transform((value) =>
  (Array.isArray(value) ? value : value.split(',')).map((entry) => entry.trim()).filter(Boolean),
);

export const idParam = z.object({ id: objectId });

export const listQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(25),
    sort: z.string().optional(),
    search: z.string().trim().min(1).optional(),

    brand: csv.optional(),
    category: csv.optional(),
    subcategory: csv.optional(),
    sku: z.string().trim().optional(),
    supplier: csv.optional(),
    source_catalog: csv.optional(),
    currency: z.enum(CURRENCIES).optional(),
    procurement: csv.optional(),
    lifecycle: csv.optional(),

    is_active: boolish.optional(),
    is_verified: boolish.optional(),
    is_generic: boolish.optional(),
    is_draft: boolish.optional(),
    has_issues: boolish.optional(),

    issue_code: csv.optional(),
    issue_severity: csv.optional(),

    min_price: positive.optional(),
    max_price: positive.optional(),
    min_margin: numeric.optional(),
    max_margin: numeric.optional(),
    min_quality: numeric.min(0).max(100).optional(),
    max_quality: numeric.min(0).max(100).optional(),
    min_quantity: z.coerce.number().int().min(0).optional(),
    max_quantity: z.coerce.number().int().min(0).optional(),
  })
  .refine((query) => !(query.min_price && query.max_price) || query.min_price <= query.max_price, {
    message: 'min_price must be less than or equal to max_price',
    path: ['min_price'],
  })
  .refine((query) => !(query.min_margin && query.max_margin) || query.min_margin <= query.max_margin, {
    message: 'min_margin must be less than or equal to max_margin',
    path: ['min_margin'],
  });

const pricingShape = z.strictObject({
  currency: z.enum(CURRENCIES).optional(),
  rdp: positive.nullable().optional(),
  rrp: positive.nullable().optional(),
  selling_price: positive.nullable().optional(),
  market_low: positive.nullable().optional(),
  market_high: positive.nullable().optional(),
  price_source: z.string().trim().max(200).nullable().optional(),
});

const specsShape = z.strictObject({
  power_wattage: positive.nullable().optional(),
  cable_type: z.string().trim().max(80).nullable().optional(),
  compatibility: z.array(z.string().trim().max(120)).max(50).optional(),
  battery_capacity: positive.nullable().optional(),
  capacity: z.string().trim().max(40).nullable().optional(),
  interface: z.string().trim().max(60).nullable().optional(),
  form_factor: z.string().trim().max(60).nullable().optional(),
  length_m: positive.nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  warranty_months: z.coerce.number().int().min(0).max(600).nullable().optional(),
  condition: z.enum(CONDITIONS).optional(),
  features: z.array(z.string().trim().max(200)).max(60).optional(),
  attributes: z.record(z.string(), z.string()).optional(),
});

const inventoryShape = z.strictObject({
  quantity: z.coerce.number().int().min(0).optional(),
  supplier: z.string().trim().max(120).nullable().optional(),
  alternate_suppliers: z.array(z.string().trim().max(120)).max(20).optional(),
  reorder_point: z.coerce.number().int().min(0).nullable().optional(),
  warehouse: z.string().trim().max(80).nullable().optional(),
  lead_time_days: z.coerce.number().int().min(0).nullable().optional(),
});

const statusShape = z.strictObject({
  is_active: z.boolean().optional(),
  is_generic: z.boolean().optional(),
  is_draft: z.boolean().optional(),
  lifecycle: z.enum(LIFECYCLE).optional(),
  procurement: z.enum(PROCUREMENT_STATUS).optional(),
});

export const createBody = z.strictObject({
  name: z.string().trim().min(2).max(300),
  brand: z.string().trim().max(120).nullable().optional(),
  sku: z.string().trim().max(120).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  subcategory: z.string().trim().max(120).nullable().optional(),
  tags: z.array(z.string().trim().max(60)).max(30).optional(),
  alternate_skus: z.array(z.string().trim().max(120)).max(20).optional(),
  description: z
    .object({
      short: z.string().trim().max(500).nullable().optional(),
      long: z.string().trim().max(5000).nullable().optional(),
    })
    .optional(),
  pricing: pricingShape.optional(),
  specs: specsShape.optional(),
  inventory: inventoryShape.optional(),
  status: statusShape.optional(),
  images: z
    .array(
      z.object({
        path: z.string().trim().min(1).max(500),
        url: z.string().trim().max(1000).nullable().optional(),
        is_primary: z.boolean().optional(),
      }),
    )
    .max(30)
    .optional(),
});

export const updateBody = createBody
  .partial()
  .extend({
    reason: z.string().trim().max(500).optional(),
    lock: z.boolean().default(true),
  })
  .refine(
    (body) => Object.keys(body).some((key) => !['reason', 'lock'].includes(key)),
    { message: 'Provide at least one field to update' },
  );

export const priceBody = pricingShape
  .extend({
    reason: z.string().trim().max(500).optional(),
    lock: z.boolean().default(true),
  })
  .refine(
    (body) =>
      ['currency', 'rdp', 'rrp', 'selling_price', 'market_low', 'market_high', 'price_source'].some(
        (key) => key in body,
      ),
    { message: 'Provide at least one pricing field' },
  );

export const bulkBody = z.object({
  updates: z
    .array(
      z.object({
        id: objectId,
        patch: createBody.partial(),
        reason: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(200),
  reason: z.string().trim().max(500).optional(),
  lock: z.boolean().default(true),
});

export const verifyBody = z.object({
  is_verified: z.boolean().default(true),
  reason: z.string().trim().max(500).optional(),
});

export const unlockBody = z.object({
  fields: z.array(z.string().trim().min(1)).min(1).max(50),
});

export const deleteQuery = z.object({
  hard: boolish.default(false),
});

export const issueFilters = { issueCodes, severities: Object.values(SEVERITY) };

export default {
  idParam,
  listQuery,
  createBody,
  updateBody,
  priceBody,
  verifyBody,
  unlockBody,
  deleteQuery,
};
