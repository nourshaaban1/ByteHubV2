import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiFetch, apiFetchPaged, ApiError } from '../lib/api.js';

const jsonResponse = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
});

beforeEach(() => {
  globalThis.fetch = vi.fn();
  globalThis.window = globalThis.window ?? {};
  window.localStorage = { getItem: () => null, setItem: () => {} };
});

describe('apiFetch', () => {
  it('unwraps the { success, data } envelope', async () => {
    fetch.mockResolvedValue(jsonResponse({ success: true, data: { _id: '1' } }));
    await expect(apiFetch('/products/1')).resolves.toEqual({ _id: '1' });
  });

  it('returns the whole payload when asked for it', async () => {
    fetch.mockResolvedValue(jsonResponse({ success: true, data: [], meta: { total: 0 } }));
    const payload = await apiFetch('/products', { raw: true });
    expect(payload.meta).toEqual({ total: 0 });
  });

  it('serialises array params as a comma list and drops empties', async () => {
    fetch.mockResolvedValue(jsonResponse({ success: true, data: [] }));
    await apiFetch('/products', { params: { brand: ['Anker', 'Joyroom'], search: '', page: 2, missing: undefined } });

    const url = fetch.mock.calls[0][0];
    expect(url).toContain('brand=Anker%2CJoyroom');
    expect(url).toContain('page=2');
    expect(url).not.toContain('search=');
    expect(url).not.toContain('missing');
  });

  it('throws an ApiError carrying the backend code and details', async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Request validation failed',
            details: [{ path: 'pricing.rdp', message: 'Must not be negative' }],
          },
        },
        { status: 400 },
      ),
    );

    await expect(apiFetch('/products/1', { method: 'PATCH', body: {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('exposes validation details keyed by field path, for form display', async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Request validation failed',
            details: [
              { path: 'pricing.rdp', message: 'Must not be negative' },
              { path: 'name', message: 'Too short' },
            ],
          },
        },
        { status: 400 },
      ),
    );

    const error = await apiFetch('/products', { method: 'POST', body: {} }).catch((caught) => caught);
    expect(error.fieldErrors).toEqual({
      'pricing.rdp': 'Must not be negative',
      name: 'Too short',
    });
  });

  it('treats 207 as a partial success and returns the body rather than throwing', async () => {
    // The bulk fix endpoint reports per-item outcomes; a failed item inside a
    // successful batch is information the caller needs, not an exception.
    fetch.mockResolvedValue(
      jsonResponse(
        { success: false, data: { total: 2, updated: 1, failed: 1, results: [] } },
        { status: 207 },
      ),
    );

    await expect(apiFetch('/products/bulk', { method: 'PATCH', body: {} })).resolves.toMatchObject({
      updated: 1,
      failed: 1,
    });
  });

  it('reports an unreachable backend in plain language', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await apiFetch('/products').catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toMatch(/backend running/i);
  });

  it('does not set a JSON content type on FormData uploads', async () => {
    fetch.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    const form = new FormData();
    await apiFetch('/catalog/import', { method: 'POST', body: form });

    // The browser must set the multipart boundary itself.
    expect(fetch.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
  });

  it('sends the admin key when one is stored', async () => {
    window.localStorage = { getItem: () => 'secret-key' };
    fetch.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await apiFetch('/products', { method: 'POST', body: {} });
    expect(fetch.mock.calls[0][1].headers['x-api-key']).toBe('secret-key');
  });

  it('survives a non-JSON error response', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => 'text/html' },
      json: async () => { throw new Error('not json'); },
    });
    await expect(apiFetch('/products')).rejects.toMatchObject({ status: 502 });
  });
});

describe('apiFetchPaged', () => {
  it('splits items from pagination meta', async () => {
    fetch.mockResolvedValue(
      jsonResponse({ success: true, data: [{ _id: '1' }], meta: { total: 1, page: 1, limit: 25 } }),
    );
    const result = await apiFetchPaged('/products');
    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('returns an empty list rather than undefined when the API sends none', async () => {
    fetch.mockResolvedValue(jsonResponse({ success: true }));
    const result = await apiFetchPaged('/products');
    expect(result.items).toEqual([]);
  });
});
