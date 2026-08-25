import dotenv from 'dotenv';

dotenv.config();

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
};

const list = (value) =>
  String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: num(process.env.PORT, 4000),
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',

  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/bytehub',

  adminApiKeys: list(process.env.ADMIN_API_KEYS),

  /**
   * Whether the admin, pricing, quality and analytics routes are mounted.
   *
   * The deployed product is the customer storefront, which needs only the
   * public catalog endpoints. Everything else is managed from the CLI, so in
   * production those routes are attack surface with no user. Off by default
   * there; on by default in development, where the archived admin dashboard
   * still works against them.
   */
  enableAdminApi: bool(process.env.ENABLE_ADMIN_API, process.env.NODE_ENV !== 'production'),

  /**
   * Origins allowed to call the API from a browser.
   *
   * Blank means same-origin only, which is correct when Next proxies the API —
   * the browser never makes a cross-origin request. `*` is accepted for local
   * experiments but refused in production.
   */
  corsOrigins: list(process.env.CORS_ORIGINS),

  /** Absolute public URL of the storefront, used for canonical links. */
  siteUrl: (process.env.SITE_URL ?? 'http://localhost:3001').replace(/\/$/, ''),

  baseCurrency: (process.env.BASE_CURRENCY ?? 'EGP').toUpperCase(),
  usdToEgpRate: num(process.env.USD_TO_EGP_RATE, 48.5),

  margin: {
    targetPct: num(process.env.MARGIN_TARGET_PCT, 54),
    warnPct: num(process.env.MARGIN_WARN_PCT, 25),
    criticalPct: num(process.env.MARGIN_CRITICAL_PCT, 10),
  },

  quality: {
    minPublishable: num(process.env.QUALITY_MIN_PUBLISHABLE, 70),
  },

  ingestion: {
    imageRoot: process.env.CATALOG_IMAGE_ROOT ?? './New Catalog',
    // Stable public prefix for product photos. Deliberately not the folder
    // name: the directory on disk has been renamed once already, and every
    // stored image URL would have broken with it.
    imagePublicPath: process.env.CATALOG_IMAGE_PUBLIC_PATH ?? '/catalog',
    batchSize: num(process.env.IMPORT_BATCH_SIZE, 250),
  },
};

/**
 * Fails fast on a misconfigured production boot.
 *
 * A shop that starts with a default secret or a wide-open CORS policy is worse
 * than one that refuses to start: the first looks healthy while being unsafe.
 */
export function assertProductionConfig(config = env) {
  if (!config.isProduction) return [];

  const problems = [];

  if (!process.env.MONGODB_URI) {
    problems.push('MONGODB_URI must be set explicitly in production');
  }
  if (config.enableAdminApi && config.adminApiKeys.length === 0) {
    problems.push('ENABLE_ADMIN_API is on but ADMIN_API_KEYS is empty — the admin API would be unauthenticated');
  }
  if (config.corsOrigins.includes('*')) {
    problems.push('CORS_ORIGINS cannot be "*" in production');
  }
  if (!process.env.SITE_URL) {
    problems.push('SITE_URL must be set so canonical links and the sitemap resolve');
  }

  return problems;
}

export default env;
