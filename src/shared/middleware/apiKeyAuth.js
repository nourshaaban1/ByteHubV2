import env from '../../config/env.js';
import { unauthorized } from '../errors/AppError.js';
import logger from '../utils/logger.js';

let warned = false;

/**
 * Admin guard. When ADMIN_API_KEYS is empty the guard is a no-op so local
 * development needs no setup — but it refuses to stay open in production.
 */
export const requireAdmin = (req, _res, next) => {
  if (env.adminApiKeys.length === 0) {
    if (env.isProduction) {
      next(unauthorized('Admin API keys are not configured on this server'));
      return;
    }
    if (!warned && !env.isTest) {
      warned = true;
      logger.warn('ADMIN_API_KEYS is empty — admin routes are UNPROTECTED (development only)');
    }
    req.admin = { key: 'dev', anonymous: true };
    next();
    return;
  }

  const provided = req.get('x-api-key') ?? req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!provided || !env.adminApiKeys.includes(provided)) {
    next(unauthorized());
    return;
  }

  req.admin = { key: `${provided.slice(0, 4)}…`, anonymous: false };
  next();
};

export default requireAdmin;
