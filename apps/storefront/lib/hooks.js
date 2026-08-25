'use client';

import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import api from './api.js';

/**
 * Delays a fast-changing value.
 *
 * Search is wired to every keystroke; without this, typing "charger" fires
 * seven requests and the grid flickers through seven result sets, the last of
 * which may not be the one that arrives last.
 */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * `initialData` is what the server already fetched for this exact query.
 *
 * Without it a client component renders empty on the server, so the HTML a
 * crawler receives has no products and no links in it. Passing the server's
 * result in means the first render — on the server and on hydration — is the
 * real grid, and the query still refreshes it afterwards.
 */
export function useProducts(params, { enabled = true, initialData } = {}) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: ({ signal }) => api.products(params, signal),
    enabled,
    ...(initialData ? { initialData } : {}),
    // Without this the grid empties to a skeleton on every filter change.
    // Keeping the previous page visible while the next one loads is what makes
    // filtering feel instant rather than like a page reload.
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: ({ signal }) => api.product(id, signal),
    enabled: Boolean(id),
    // A product that is not published is a 404, and retrying will not publish
    // it. Retrying a genuine network blip is still worth one attempt.
    retry: (failureCount, error) => !error?.isNotFound && failureCount < 1,
  });
}

export function useFacets({ initialData } = {}) {
  return useQuery({
    queryKey: ['facets'],
    queryFn: ({ signal }) => api.facets(signal),
    ...(initialData ? { initialData } : {}),
    // The catalog's shape changes when the shop imports a spreadsheet, not
    // while a customer is browsing.
    staleTime: 5 * 60 * 1000,
  });
}

export default { useDebounced, useProducts, useProduct, useFacets };
