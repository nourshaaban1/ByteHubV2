export const CURRENCIES = Object.freeze(['EGP', 'USD']);

export const PROCUREMENT_STATUS = Object.freeze([
  'must_buy',
  'test_buy',
  'avoid',
  'opportunity',
  'unclassified',
]);

export const LIFECYCLE = Object.freeze([
  'not_started',
  'draft',
  'review',
  'approved',
  'published',
  'archived',
]);

export const CONDITIONS = Object.freeze(['new', 'used', 'refurbished', 'original_pull', 'unknown']);

export const SOURCE_TYPES = Object.freeze(['xlsx', 'csv', 'api', 'manual']);

export const IMPORT_STATUS = Object.freeze(['pending', 'running', 'completed', 'failed', 'partial']);

export default {
  CURRENCIES,
  PROCUREMENT_STATUS,
  LIFECYCLE,
  CONDITIONS,
  SOURCE_TYPES,
  IMPORT_STATUS,
};
