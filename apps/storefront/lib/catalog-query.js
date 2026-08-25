/**
 * Turning a URL's query string into a catalog API request.
 *
 * Deliberately free of React and of `'use client'`, because both sides need
 * it: the page reads the filters on the server to render the first grid into
 * the HTML, and `useCatalogParams` reads the same ones in the browser. If the
 * two derivations drifted, the server would seed the client's cache under a
 * key the client never asks for, and the grid would flash from one result set
 * to another on hydration.
 */
export const DEFAULT_SORT = 'featured';
export const PAGE_SIZE = 24;

const ARRAY_KEYS = new Set(['category', 'brand']);
const NUMBER_KEYS = new Set(['min_price', 'max_price', 'page']);

export { ARRAY_KEYS, NUMBER_KEYS };

/**
 * Reads the filters out of anything that can answer `get(key) -> string`.
 *
 * `URLSearchParams` in the browser, a plain `{ key: value }` object on the
 * server. A repeated parameter arrives as an array there; the first one wins,
 * the same as `URLSearchParams.get`.
 */
export function readFilters(source) {
  const get = (key) => {
    const raw = typeof source?.get === 'function' ? source.get(key) : source?.[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value || undefined;
  };

  const readList = (key) => {
    const raw = get(key);
    return raw ? raw.split(',').filter(Boolean) : [];
  };

  const readNumber = (key) => {
    const raw = get(key);
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  return {
    search: get('search'),
    category: readList('category'),
    brand: readList('brand'),
    min_price: readNumber('min_price'),
    max_price: readNumber('max_price'),
    sort: get('sort') ?? DEFAULT_SORT,
    page: readNumber('page') ?? 1,
  };
}

/** Exactly the shape the public API expects, and the React Query cache key. */
export function queryFrom(filters) {
  return {
    search: filters.search,
    category: filters.category,
    brand: filters.brand,
    min_price: filters.min_price,
    max_price: filters.max_price,
    sort: filters.sort,
    page: filters.page,
    limit: PAGE_SIZE,
  };
}

export default { DEFAULT_SORT, PAGE_SIZE, readFilters, queryFrom };
