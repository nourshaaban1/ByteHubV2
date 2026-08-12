import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import env from './config/env.js';
import { databaseState } from './config/database.js';
import { errorHandler, notFoundHandler } from './shared/middleware/errorHandler.js';
import productRoutes from './modules/product/product.routes.js';
import catalogRoutes from './modules/catalog/catalog.routes.js';
import pricingRoutes from './modules/pricing/pricing.routes.js';
import qualityRoutes from './modules/quality/quality.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // crossOriginResourcePolicy is relaxed so the admin UI, served from a
  // different port in development, can render the catalog product photos.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (!env.isTest) {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: env.isProduction ? 120 : 1000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      // Rate limiting is about protecting the service, not the tests.
      skip: () => env.isTest,
    }),
  );

  /**
   * Product photos. express.static resolves within this root only, so a
   * traversal attempt in the path cannot escape the catalog directory.
   */
  app.use(
    '/Catalog',
    express.static(path.resolve(process.cwd(), env.ingestion.imageRoot), {
      maxAge: env.isProduction ? '7d' : 0,
      fallthrough: true,
      index: false,
      dotfiles: 'deny',
    }),
  );

  app.get('/health', (_req, res) => {
    const database = databaseState();
    res.status(database === 'connected' ? 200 : 503).json({
      success: database === 'connected',
      data: {
        status: database === 'connected' ? 'ok' : 'degraded',
        database,
        environment: env.nodeEnv,
        base_currency: env.baseCurrency,
        uptime_seconds: Math.round(process.uptime()),
      },
    });
  });

  const api = express.Router();
  api.use('/products', productRoutes);
  api.use('/catalog', catalogRoutes);
  api.use('/pricing', pricingRoutes);
  api.use('/quality', qualityRoutes);
  api.use('/analytics', analyticsRoutes);

  // The brief specifies POST /products/import; the implementation lives in the
  // catalog module, so the documented path is exposed as an alias.
  api.use('/products/import', catalogRoutes);

  api.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        service: 'ByteHub Backend',
        version: '1.0.0',
        endpoints: {
          products: `${env.apiPrefix}/products`,
          catalog: `${env.apiPrefix}/catalog`,
          pricing: `${env.apiPrefix}/pricing`,
          quality: `${env.apiPrefix}/quality`,
          analytics: `${env.apiPrefix}/analytics`,
        },
      },
    });
  });

  app.use(env.apiPrefix, api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
