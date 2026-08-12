export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 200;

export function toPagination({ page = 1, limit = DEFAULT_LIMIT } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || DEFAULT_LIMIT));
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

/** `-margin,name` -> `{ 'pricing.margin_percentage': -1, name: 1 }` via a field allowlist. */
export function toSort(sortSpec, allowlist, fallback = { updatedAt: -1 }) {
  if (!sortSpec) return fallback;
  const sort = {};
  for (const token of String(sortSpec).split(',')) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const direction = trimmed.startsWith('-') ? -1 : 1;
    const key = trimmed.replace(/^[-+]/, '');
    const mapped = allowlist[key];
    if (mapped) sort[mapped] = direction;
  }
  return Object.keys(sort).length > 0 ? sort : fallback;
}

export default { toPagination, toSort, DEFAULT_LIMIT, MAX_LIMIT };
