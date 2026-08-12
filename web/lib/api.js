/**
 * Thin API client.
 *
 * It transports and unwraps; it never computes. Margins, quality scores,
 * currency conversion and issue detection all belong to the backend — the
 * frontend is a control and visibility layer over them.
 */
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1';

export class ApiError extends Error {
  constructor(message, { status, code, details, path } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.path = path;
  }

  /** Field-level validation messages, keyed by dotted path, for form display. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(
      this.details
        .filter((entry) => entry && entry.path)
        .map((entry) => [entry.path, entry.message]),
    );
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

async function parseBody(response) {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiFetch(path, { method = 'GET', body, params, signal, raw } = {}) {
  const url = `${BASE}${path}${buildQuery(params)}`;

  const init = { method, signal, headers: {} };

  const apiKey = typeof window !== 'undefined' ? window.localStorage?.getItem('bytehub.apiKey') : null;
  if (apiKey) init.headers['x-api-key'] = apiKey;

  if (body instanceof FormData) {
    init.body = body; // let the browser set the multipart boundary
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the ByteHub API. Is the backend running on port 4000?', {
      status: 0,
      code: 'NETWORK_ERROR',
      path,
    });
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    // 207 is a partial success: the batch ran, some items failed. The caller
    // needs the body to report which — it is not an error to throw on.
    if (response.status === 207 && payload) return raw ? payload : payload.data;

    throw new ApiError(payload?.error?.message ?? `Request failed (${response.status})`, {
      status: response.status,
      code: payload?.error?.code ?? 'HTTP_ERROR',
      details: payload?.error?.details,
      path,
    });
  }

  if (raw) return payload;
  return payload?.data ?? null;
}

/** Returns `{ data, meta }` for endpoints that paginate. */
export async function apiFetchPaged(path, params) {
  const payload = await apiFetch(path, { params, raw: true });
  return { items: payload?.data ?? [], meta: payload?.meta ?? null };
}

export const api = {
  products: {
    list: (params) => apiFetchPaged('/products', params),
    get: (id) => apiFetch(`/products/${id}`),
    create: (body) => apiFetch('/products', { method: 'POST', body }),
    update: (id, body) => apiFetch(`/products/${id}`, { method: 'PATCH', body, raw: true }),
    updatePrice: (id, body) => apiFetch(`/products/${id}/price`, { method: 'PATCH', body, raw: true }),
    verify: (id, body) => apiFetch(`/products/${id}/verify`, { method: 'PATCH', body }),
    unlock: (id, fields) => apiFetch(`/products/${id}/unlock`, { method: 'PATCH', body: { fields } }),
    remove: (id, hard) => apiFetch(`/products/${id}`, { method: 'DELETE', params: { hard } }),
    bulk: (body) => apiFetch('/products/bulk', { method: 'PATCH', body }),
  },

  analytics: {
    dashboard: () => apiFetch('/analytics/dashboard'),
    summary: () => apiFetch('/analytics/summary'),
    inventoryValue: (groupBy) => apiFetch('/analytics/inventory-value', { params: { group_by: groupBy } }),
    topProfitable: (params) => apiFetch('/analytics/top-profitable', { params }),
    marginBands: () => apiFetch('/analytics/margin-bands'),
    lowMargin: (params) => apiFetch('/analytics/low-margin', { params }),
    suppliers: () => apiFetch('/analytics/suppliers'),
    procurement: () => apiFetch('/analytics/procurement'),
  },

  quality: {
    overview: () => apiFetch('/quality/overview'),
    rubric: () => apiFetch('/quality/rubric'),
    worst: (params) => apiFetch('/quality/worst', { params }),
    explain: (id) => apiFetch(`/quality/${id}/explain`),
    duplicateSkus: () => apiFetch('/quality/duplicates/sku'),
    similar: (params) => apiFetch('/quality/duplicates/similar', { params }),
    rescore: (body) => apiFetch('/quality/rescore', { method: 'POST', body: body ?? {} }),
  },

  pricing: {
    policy: () => apiFetch('/pricing/policy'),
    quote: (body) => apiFetch('/pricing/quote', { method: 'POST', body }),
    alerts: (params) => apiFetch('/pricing/alerts', { params }),
    lossMakers: (params) => apiFetch('/pricing/loss-makers', { params }),
    suggest: (id, targetMargin) =>
      apiFetch(`/pricing/${id}/suggest`, { params: { target_margin: targetMargin } }),
    recalculate: (body) => apiFetch('/pricing/recalculate', { method: 'POST', body: body ?? {} }),
  },

  catalog: {
    preview: (formData) => apiFetch('/catalog/preview', { method: 'POST', body: formData }),
    import: (formData) => apiFetch('/catalog/import', { method: 'POST', body: formData }),
    imports: (params) => apiFetchPaged('/catalog/imports', params),
    importRun: (id) => apiFetch(`/catalog/imports/${id}`),
    skuCollisions: () => apiFetch('/catalog/sku-collisions'),
    mapping: () => apiFetch('/catalog/mapping'),
    images: (params) => apiFetch('/catalog/images', { params }),
    linkImages: (folder, productId) =>
      apiFetch('/catalog/images/link', { method: 'POST', body: { folder, product_id: productId } }),
    unlinkImages: (productId) =>
      apiFetch('/catalog/images/unlink', { method: 'POST', body: { product_id: productId } }),
    autoLinkImages: (body) =>
      apiFetch('/catalog/images/auto-link', { method: 'POST', body: body ?? {} }),
  },
};

export default api;
