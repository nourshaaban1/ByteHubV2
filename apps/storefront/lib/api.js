/**
 * Storefront API client.
 *
 * Talks to the public catalog endpoints over HTTP and nothing else. It has no
 * database access, no admin key, and no knowledge of cost or margin — the
 * backend decides what a customer may see and serves an already-sanitised
 * payload. This file only transports and unwraps.
 */
const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** A missing or unpublished product, which pages render as "not found". */
  get isNotFound() {
    return this.status === 404;
  }
}

const buildQuery = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

async function request(path, { params, signal } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}${buildQuery(params)}`, { signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the ByteHub catalog. Is the backend running?', {
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(payload?.error?.message ?? `Request failed (${response.status})`, {
      status: response.status,
      code: payload?.error?.code ?? 'HTTP_ERROR',
    });
  }

  return payload;
}

export const api = {
  /** Paginated product grid. Returns `{ items, meta }`. */
  async products(params, signal) {
    const payload = await request('/products/public', { params, signal });
    return { items: payload?.data ?? [], meta: payload?.meta ?? null };
  },

  async product(id, signal) {
    const payload = await request(`/products/public/${id}`, { signal });
    return payload?.data ?? null;
  },

  /** Categories, brands and the price range, counted over the live catalog. */
  async facets(signal) {
    const payload = await request('/products/public/facets', { signal });
    return payload?.data ?? null;
  },
};

export default api;
