/**
 * The server-side catalog reads that product pages are rendered from.
 *
 * The behaviour that matters in production is what happens when the API is
 * slow, down or returns something unexpected: a shop that 500s because the
 * catalog blipped is worse than one that shows a "not available" page.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const load = async () => {
  vi.resetModules();
  return import('../lib/server-api.js');
};

const jsonOk = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('fetchProduct', () => {
  it('unwraps the API envelope', async () => {
    const { fetchProduct } = await load();
    fetch.mockResolvedValue(jsonOk({ success: true, data: { id: '1', slug: 'a-charger' } }));

    await expect(fetchProduct('a-charger')).resolves.toEqual({ id: '1', slug: 'a-charger' });
  });

  it('percent-encodes the handle so a slash cannot alter the path', async () => {
    const { fetchProduct } = await load();
    fetch.mockResolvedValue(jsonOk({ success: true, data: {} }));

    await fetchProduct('../admin');
    expect(fetch.mock.calls[0][0]).toContain('%2F');
    expect(fetch.mock.calls[0][0]).not.toContain('/../admin');
  });

  it('returns null for an unpublished product rather than throwing', async () => {
    const { fetchProduct } = await load();
    fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    await expect(fetchProduct('gone')).resolves.toBeNull();
  });

  it('returns null when the API is unreachable, so the page still renders', async () => {
    const { fetchProduct } = await load();
    fetch.mockRejectedValue(new TypeError('fetch failed'));

    await expect(fetchProduct('a-charger')).resolves.toBeNull();
  });

  it('asks Next to revalidate rather than caching a price forever', async () => {
    const { fetchProduct, REVALIDATE } = await load();
    fetch.mockResolvedValue(jsonOk({ success: true, data: {} }));

    await fetchProduct('a-charger');
    expect(fetch.mock.calls[0][1].next).toEqual({ revalidate: REVALIDATE.product });
  });
});

describe('fetchProducts', () => {
  it('always returns a usable shape, even when the API fails', async () => {
    const { fetchProducts } = await load();
    fetch.mockRejectedValue(new Error('down'));

    await expect(fetchProducts()).resolves.toEqual({ items: [], meta: null });
  });

  it('serialises array params as a comma list and drops empty ones', async () => {
    const { fetchProducts } = await load();
    fetch.mockResolvedValue(jsonOk({ success: true, data: [] }));

    await fetchProducts({ category: ['Cables', 'Audio'], search: '', limit: 4 });
    const url = fetch.mock.calls[0][0];

    expect(url).toContain('category=Cables%2CAudio');
    expect(url).toContain('limit=4');
    expect(url).not.toContain('search=');
  });
});

describe('fetchRelated', () => {
  it('excludes the product being viewed', async () => {
    const { fetchRelated } = await load();
    fetch.mockResolvedValue(
      jsonOk({ success: true, data: [{ id: 'self' }, { id: 'a' }, { id: 'b' }] }),
    );

    const related = await fetchRelated({ id: 'self', category: 'Cables' });
    expect(related.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('does not query at all for a product with no category', async () => {
    const { fetchRelated } = await load();

    await expect(fetchRelated({ id: 'x', category: null })).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('caps the list at the requested size', async () => {
    const { fetchRelated } = await load();
    const many = Array.from({ length: 10 }, (_, index) => ({ id: `p${index}` }));
    fetch.mockResolvedValue(jsonOk({ success: true, data: many }));

    expect(await fetchRelated({ id: 'self', category: 'Cables' }, 3)).toHaveLength(3);
  });
});

describe('fetchSitemapEntries', () => {
  it('returns an empty list when the API is down, so the build still succeeds', async () => {
    const { fetchSitemapEntries } = await load();
    fetch.mockRejectedValue(new Error('down'));

    await expect(fetchSitemapEntries()).resolves.toEqual([]);
  });

  it('returns the slugs it was given', async () => {
    const { fetchSitemapEntries } = await load();
    fetch.mockResolvedValue(
      jsonOk({ success: true, data: [{ slug: 'a-charger', updated_at: '2026-01-01' }] }),
    );

    const entries = await fetchSitemapEntries();
    expect(entries[0].slug).toBe('a-charger');
  });
});
