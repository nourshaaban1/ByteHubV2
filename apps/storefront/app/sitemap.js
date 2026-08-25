import { fetchSitemapEntries, fetchFacets, REVALIDATE } from '../lib/server-api.js';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export const revalidate = REVALIDATE.sitemap;

/**
 * The catalog sitemap.
 *
 * Product pages carry their real last-modified date from the API, so a crawler
 * only re-reads what actually changed. Category listings are included because
 * they are the pages a shopper searching "power bank Cairo" should land on.
 */
export default async function sitemap() {
  const [products, facets] = await Promise.all([fetchSitemapEntries(), fetchFacets()]);

  const staticPages = [
    { url: `${siteUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/products`, changeFrequency: 'daily', priority: 0.9 },
  ];

  const categoryPages = (facets?.categories ?? []).map((category) => ({
    url: `${siteUrl}/products?category=${encodeURIComponent(category.name)}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const productPages = products.map((entry) => ({
    url: `${siteUrl}/products/${entry.slug}`,
    lastModified: entry.updated_at ? new Date(entry.updated_at) : undefined,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticPages, ...categoryPages, ...productPages];
}
