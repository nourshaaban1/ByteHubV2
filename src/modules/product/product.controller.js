import asyncHandler from '../../shared/http/asyncHandler.js';
import { ok, created, paginated } from '../../shared/http/ApiResponse.js';
import productService from './product.service.js';

const actorOf = (req) => req.admin?.key ?? 'admin';

export const productController = {
  list: asyncHandler(async (req, res) => {
    const result = await productService.list(req.query);
    paginated(res, result);
  }),

  getById: asyncHandler(async (req, res) => {
    ok(res, await productService.getById(req.params.id));
  }),

  create: asyncHandler(async (req, res) => {
    const product = await productService.create(req.body, { actor: actorOf(req) });
    created(res, product);
  }),

  update: asyncHandler(async (req, res) => {
    const { reason, lock, ...patch } = req.body;
    const result = await productService.update(req.params.id, patch, {
      actor: actorOf(req),
      reason,
      lock,
    });
    ok(res, result.product, { changed: result.changed });
  }),

  updatePrice: asyncHandler(async (req, res) => {
    const { reason, lock, ...patch } = req.body;
    const result = await productService.updatePrice(req.params.id, patch, {
      actor: actorOf(req),
      reason,
      lock,
    });
    ok(res, result.product, { changed: result.changed });
  }),

  bulkUpdate: asyncHandler(async (req, res) => {
    const result = await productService.bulkUpdate(req.body.updates, {
      actor: actorOf(req),
      reason: req.body.reason,
      lock: req.body.lock,
    });
    // 207: the batch as a whole succeeded, but individual items may not have.
    res.status(result.failed > 0 ? 207 : 200).json({ success: result.failed === 0, data: result });
  }),

  verify: asyncHandler(async (req, res) => {
    const product = await productService.setVerification(req.params.id, {
      is_verified: req.body.is_verified,
      reason: req.body.reason,
      actor: actorOf(req),
    });
    ok(res, product);
  }),

  unlock: asyncHandler(async (req, res) => {
    ok(res, await productService.unlockFields(req.params.id, req.body.fields));
  }),

  remove: asyncHandler(async (req, res) => {
    ok(res, await productService.remove(req.params.id, { hard: req.query.hard }));
  }),
};

export default productController;
