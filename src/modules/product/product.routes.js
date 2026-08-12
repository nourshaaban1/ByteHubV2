import { Router } from 'express';
import validate from '../../shared/middleware/validate.js';
import requireAdmin from '../../shared/middleware/apiKeyAuth.js';
import productController from './product.controller.js';
import * as schema from './product.validation.js';
import publicController from './public/public.controller.js';
import * as publicSchema from './public/public.validation.js';

const router = Router();

/**
 * Customer storefront: unauthenticated, read-only, and restricted to published
 * products with every internal field stripped. Declared before '/:id' so
 * 'public' is never read as a product id.
 */
router.get('/public', validate({ query: publicSchema.listQuery }), publicController.list);
router.get('/public/facets', publicController.facets);
router.get('/public/:id', validate({ params: publicSchema.idParam }), publicController.getById);

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

export default router;
