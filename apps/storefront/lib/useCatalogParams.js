'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Catalog filter state, held in the URL rather than in React state.
 *
 * This is what makes a filtered grid shareable, bookmarkable and correct under
 * the back button — all three of which a customer expects from a shop and none
 * of which come free with useState. It also means the navbar's category links
 * are ordinary hrefs instead of clicks that have to reach into a store.
 */
const ARRAY_KEYS = new Set(['category', 'brand']);
const NUMBER_KEYS = new Set(['min_price', 'max_price', 'page']);

export const DEFAULT_SORT = 'featured';
export const PAGE_SIZE = 24;

export function useCatalogParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => {
    const read = (key) => searchParams.get(key) || undefined;
    const readList = (key) => {
      const raw = read(key);
      return raw ? raw.split(',').filter(Boolean) : [];
    };
    const readNumber = (key) => {
      const raw = read(key);
      if (raw === undefined) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };

    return {
      search: read('search'),
      category: readList('category'),
      brand: readList('brand'),
      min_price: readNumber('min_price'),
      max_price: readNumber('max_price'),
      sort: read('sort') ?? DEFAULT_SORT,
      page: readNumber('page') ?? 1,
    };
  }, [searchParams]);

  /**
   * Merges a patch into the URL.
   *
   * Any change other than paging resets to page 1 — landing on page 4 of a
   * three-page result set after narrowing a filter is a real and very common
   * way to show a customer an empty grid.
   */
  const update = useCallback(
    (patch) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(patch)) {
        const empty =
          value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && value.length === 0);

        if (empty) next.delete(key);
        else if (ARRAY_KEYS.has(key)) next.set(key, value.join(','));
        else next.set(key, String(value));
      }

      if (!('page' in patch)) next.delete('page');
      if (next.get('sort') === DEFAULT_SORT) next.delete('sort');
      if (next.get('page') === '1') next.delete('page');

      const query = next.toString();
      // scroll:false — re-filtering should leave the customer where they are,
      // but a page change should take them back to the top of the grid.
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: 'page' in patch });
    },
    [pathname, router, searchParams],
  );

  const toggleInList = useCallback(
    (key, value) => {
      const current = filters[key] ?? [];
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      update({ [key]: next });
    },
    [filters, update],
  );

  const clearAll = useCallback(() => router.push(pathname), [pathname, router]);

  const activeCount =
    filters.category.length +
    filters.brand.length +
    (filters.min_price !== undefined ? 1 : 0) +
    (filters.max_price !== undefined ? 1 : 0);

  /** Exactly the shape the public API expects. */
  const query = useMemo(
    () => ({
      search: filters.search,
      category: filters.category,
      brand: filters.brand,
      min_price: filters.min_price,
      max_price: filters.max_price,
      sort: filters.sort,
      page: filters.page,
      limit: PAGE_SIZE,
    }),
    [filters],
  );

  return { filters, query, update, toggleInList, clearAll, activeCount };
}

export default useCatalogParams;
