const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001').replace(/\/$/, '');

/**
 * Crawl policy.
 *
 * Filtered and sorted catalog URLs are the same products in a different order.
 * Letting a crawler walk every combination burns the crawl budget on
 * near-duplicates instead of the product pages that actually rank.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/products?*sort=', '/products?*page=', '/products?*brand='],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
