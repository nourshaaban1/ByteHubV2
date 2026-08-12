import { ZodError } from 'zod';
import { badRequest } from '../errors/AppError.js';

const formatIssues = (error) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));

/**
 * Validates and *replaces* the named request segments with the parsed result,
 * so downstream code always sees coerced, trimmed, defaulted values.
 *
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const segment of ['params', 'query', 'body']) {
      const schema = schemas[segment];
      if (!schema) continue;
      const parsed = schema.parse(req[segment] ?? {});
      // req.query is a getter-only property on Express 5; assign defensively.
      Object.defineProperty(req, segment, {
        value: parsed,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      next(badRequest('Request validation failed', formatIssues(error)));
      return;
    }
    next(error);
  }
};

export default validate;
