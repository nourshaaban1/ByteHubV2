import dotenv from 'dotenv';

dotenv.config();

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    imageRoot: process.env.CATALOG_IMAGE_ROOT ?? './Catalog',
    batchSize: num(process.env.IMPORT_BATCH_SIZE, 250),
  },
};

export default env;
