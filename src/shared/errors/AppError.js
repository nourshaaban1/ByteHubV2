/**
 * Operational (expected) application error. Anything thrown that is not an
 * AppError is treated as a bug and reported as a 500 without leaking details.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export const badRequest = (message, details) =>
  new AppError(message, 400, 'BAD_REQUEST', details);

export const unauthorized = (message = 'Missing or invalid API key') =>
  new AppError(message, 401, 'UNAUTHORIZED');

export const forbidden = (message = 'Not allowed') => new AppError(message, 403, 'FORBIDDEN');

export const notFound = (resource = 'Resource', id) =>
  new AppError(id ? `${resource} '${id}' not found` : `${resource} not found`, 404, 'NOT_FOUND');

export const conflict = (message, details) => new AppError(message, 409, 'CONFLICT', details);

export const unprocessable = (message, details) =>
  new AppError(message, 422, 'UNPROCESSABLE_ENTITY', details);

export default AppError;
