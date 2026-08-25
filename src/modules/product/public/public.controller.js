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

  getByHandle: asyncHandler(async (req, res) => {
    ok(res, await publicService.getByHandle(req.params.handle));
  }),

  /** Slugs and their last-modified dates, for the storefront's sitemap. */
  sitemap: asyncHandler(async (_req, res) => {
    ok(res, await publicService.allHandles());
  }),
};

export default publicController;
