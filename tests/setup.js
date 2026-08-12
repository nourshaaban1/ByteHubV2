process.env.NODE_ENV = 'test';

// Pin the values the assertions depend on, so a developer's local .env cannot
// change what the tests mean.
process.env.BASE_CURRENCY = 'EGP';
process.env.USD_TO_EGP_RATE = '48.5';
process.env.MARGIN_TARGET_PCT = '54';
process.env.MARGIN_WARN_PCT = '25';
process.env.MARGIN_CRITICAL_PCT = '10';
process.env.QUALITY_MIN_PUBLISHABLE = '70';
process.env.ADMIN_API_KEYS = '';
