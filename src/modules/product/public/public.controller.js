import asyncHandler from '../../../shared/http/asyncHandler.js';
import { ok, paginated } from '../../../shared/http/ApiResponse.js';
import publicService from './public.service.js';

export const publicController = {
  list: asyncHandler(async (req, res) => {
    paginated(res, await publicService.list(req.query));
  }),

  facets: asyncHandler(async (_req, res) => {
    ok(res, await publicService.facets());
  }),

  getById: asyncHandler(async (req, res) => {
    ok(res, await publicService.getById(req.params.id));
  }),
};

export default publicController;
