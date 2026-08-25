import { Router } from 'express';
import env from '../../config/env.js';
import validate from '../../shared/middleware/validate.js';
import requireAdmin from '../../shared/middleware/apiKeyAuth.js';
import productController from './product.controller.js';
import * as schema from './product.validation.js';
import publicController from './public/public.controller.js';
import * as publicSchema from './public/public.validation.js';

const router = Router();

/**
 * Cache policy for the public catalog.
 *
 * Catalog data changes when the shop reimports or reprices, not per request,
 * so a short shared cache absorbs traffic spikes. `stale-while-revalidate`
 * lets a CDN keep serving the last good copy while it refreshes, which means a
 * slow backend never becomes a slow shop.
 */
const publicCache = (seconds) => (_req, res, next) => {
  res.set('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 4}`);
  next();
};

/**
 * Customer storefront: unauthenticated, read-only, and restricted to published
 * products with every internal field stripped. Declared before '/:id' so
 * 'public' is never read as a product id.
 */
router.get(
  '/public',
  publicCache(60),
  validate({ query: publicSchema.listQuery }),
  publicController.list,
);
router.get('/public/facets', publicCache(300), publicController.facets);
router.get('/public/sitemap', publicCache(3600), publicController.sitemap);
router.get(
  '/public/:handle',
  publicCache(300),
  validate({ params: publicSchema.handleParam }),
  publicController.getByHandle,
);

/**
 * Back-office routes below this line.
 *
 * Every one of them is behind `requireAdmin`, but they are also not mounted at
 * all unless the admin API is enabled. A route that does not exist cannot be
 * reached by a mistake in the auth middleware, and the deployed storefront
 * needs none of them — the catalog is managed from the CLI.
 */
if (env.enableAdminApi) {
  registerAdminRoutes(router);
}

function registerAdminRoutes(router) {
  router.get('/', validate({ query: schema.listQuery }), productController.list);
  router.get('/:id', validate({ params: schema.idParam }), productController.getById);

  router.post('/', requireAdmin, validate({ body: schema.createBody }), productController.create);

  // Declared before '/:id' variants so 'bulk' is never read as an id.
  router.patch(
    '/bulk',
    requireAdmin,
    validate({ body: schema.bulkBody }),
    productController.bulkUpdate,
  );

  router.patch(
    '/:id',
    requireAdmin,
    validate({ params: schema.idParam, body: schema.updateBody }),
    productController.update,
  );

  router.patch(
    '/:id/price',
    requireAdmin,
    validate({ params: schema.idParam, body: schema.priceBody }),
    productController.updatePrice,
  );

  router.patch(
    '/:id/verify',
    requireAdmin,
    validate({ params: schema.idParam, body: schema.verifyBody }),
    productController.verify,
  );

  router.patch(
    '/:id/unlock',
    requireAdmin,
    validate({ params: schema.idParam, body: schema.unlockBody }),
    productController.unlock,
  );

  router.delete(
    '/:id',
    requireAdmin,
    validate({ params: schema.idParam, query: schema.deleteQuery }),
    productController.remove,
  );
}

export default router;
