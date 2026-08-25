import { z } from 'zod';
import { MAX_LIMIT, DEFAULT_LIMIT, SORT_KEYS } from './public.service.js';

/**
 * Query contract for the storefront.
 *
 * Notably absent: `is_active`, `is_verified`, `is_draft`, and every internal
 * filter the admin list supports (margin, quality, issues, supplier, source
 * catalog). The public endpoint decides publishability itself, so accepting a
 * status flag here would only create a way to argue with it.
 */
const csv = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(','))
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const price = z.coerce.number().finite().min(0);

export const listQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    sort: z.enum(SORT_KEYS).default('featured'),

    search: z.string().trim().min(1).max(120).optional(),
    category: csv.optional(),
    subcategory: csv.optional(),
    brand: csv.optional(),

    min_price: price.optional(),
    max_price: price.optional(),

    in_stock: boolish.optional(),
    has_image: boolish.optional(),
  })
  .refine(
    (query) =>
      query.min_price === undefined ||
      query.max_price === undefined ||
      query.min_price <= query.max_price,
    { message: 'min_price must be less than or equal to max_price', path: ['min_price'] },
  );

/**
 * A product handle: a slug, or a legacy ObjectId.
 *
 * Constrained rather than free text — it reaches a database query, and a
 * bounded character set keeps anything exotic out of the regex path.
 */
export const handleParam = z.object({
  handle: z
    .string()
    .trim()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9][a-z0-9-]*$|^[0-9a-fA-F]{24}$/, 'Must be a product slug or id'),
});

export default { listQuery, handleParam };
