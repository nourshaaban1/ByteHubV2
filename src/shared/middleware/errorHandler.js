import mongoose from 'mongoose';
import env from '../../config/env.js';
import logger from '../utils/logger.js';
import AppError from '../errors/AppError.js';

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} does not exist`,
    },
  });
};

const translate = (error) => {
  if (error instanceof AppError) return error;

  if (error instanceof mongoose.Error.ValidationError) {
    return new AppError('Document validation failed', 422, 'VALIDATION_ERROR',
      Object.values(error.errors).map((e) => ({ path: e.path, message: e.message })));
  }

  if (error instanceof mongoose.Error.CastError) {
    return new AppError(`Invalid value for '${error.path}'`, 400, 'INVALID_ID', {
      path: error.path,
      value: error.value,
    });
  }

  if (error?.code === 11000) {
    return new AppError('Duplicate key', 409, 'DUPLICATE_KEY', { keys: error.keyValue });
  }

  if (error?.type === 'entity.parse.failed') {
    return new AppError('Malformed JSON body', 400, 'BAD_JSON');
  }

  return null;
};

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
export const errorHandler = (error, req, res, _next) => {
  const translated = translate(error);

  if (!translated) {
    logger.error('unhandled error', error?.stack ?? error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
        ...(env.isProduction ? {} : { debug: error?.message, stack: error?.stack }),
      },
    });
    return;
  }

  if (translated.statusCode >= 500) {
    logger.error('operational error', translated.message, translated.details ?? '');
  }

  res.status(translated.statusCode).json({
    success: false,
    error: {
      code: translated.code,
      message: translated.message,
      ...(translated.details ? { details: translated.details } : {}),
    },
  });
};

export default { errorHandler, notFoundHandler };
