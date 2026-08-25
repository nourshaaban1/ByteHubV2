import 'server-only';

/**
 * Server-side catalog reads.
 *
 * The browser reaches the API through Next's rewrite proxy, but a rewrite is a
 * client-request concern — code running on the server has to address the
 * backend directly. Same HTTP contract, same public endpoints, no database
 * access: this is still a frontend talking to an API.
 *
 * Product pages are rendered on the server from these, because a shop that
 * ships an empty shell and fetches its catalog in the browser is a shop search
 * engines cannot read and slow connections cannot use.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';

/** How long a rendered page may serve before Next revalidates it. */
export const REVALIDATE = {
  product: 300,
  catalog: 120,
  sitemap: 3600,
};

async function get(path, { revalidate = REVALIDATE.catalog, params } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const suffix = query.toString() ? `?${query}` : '';

  try {
    const response = await fetch(`${API_ORIGIN}/api/v1${path}${suffix}`, {
      next: { revalidate },
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // A page must never fail to render because the catalog was briefly
    // unreachable. Callers treat null as "not found" and show a real message.
    return null;
  }
}

/** One product by slug (or legacy id). Null when unpublished or missing. */
export async function fetchProduct(handle) {
  const payload = await get(`/products/public/${encodeURIComponent(handle)}`, {
    revalidate: REVALIDATE.product,
  });
  return payload?.data ?? null;
}

/** A page of products. Always returns a usable shape, even on failure. */
export async function fetchProducts(params = {}) {
  const payload = await get('/products/public', { params, revalidate: REVALIDATE.catalog });
  return { items: payload?.data ?? [], meta: payload?.meta ?? null };
}

export async function fetchFacets() {
  const payload = await get('/products/public/facets', { revalidate: REVALIDATE.catalog });
  return payload?.data ?? null;
}

/** Every published slug with its last-modified date, for the sitemap. */
export async function fetchSitemapEntries() {
  const payload = await get('/products/public/sitemap', { revalidate: REVALIDATE.sitemap });
  return payload?.data ?? [];
}

/**
 * Products in the same category, excluding the one being viewed.
 *
 * Fetched on the server alongside the product so the "More in Cables" strip is
 * in the initial HTML — it is internal linking, which only counts if a crawler
 * can see it without running JavaScript.
 */
export async function fetchRelated(product, limit = 4) {
  if (!product?.category) return [];

  const { items } = await fetchProducts({ category: product.category, limit: limit + 1 });
  return items.filter((entry) => entry.id !== product.id).slice(0, limit);
}

export default { fetchProduct, fetchProducts, fetchFacets, fetchSitemapEntries, fetchRelated };
