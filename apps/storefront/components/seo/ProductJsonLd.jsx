import { shop } from '../../lib/shop.js';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001').replace(/\/$/, '');

const absolute = (url) => (url?.startsWith('http') ? url : url ? `${siteUrl}${url}` : undefined);

/**
 * Schema.org Product data, emitted as JSON-LD.
 *
 * This is what turns a search result into a rich one — price, availability and
 * brand shown directly in Google — and it is the only way a shop with no
 * checkout can appear in shopping surfaces at all.
 *
 * Only fields the catalog actually knows are emitted. An invented `priceValidUntil`
 * or a guessed `gtin` is worse than an absent one: structured data that
 * contradicts the page is a manual-action risk, not a ranking boost.
 */
export default function ProductJsonLd({ product }) {
  if (!product) return null;

  const url = `${siteUrl}/products/${product.slug ?? product.id}`;
  const images = (product.images ?? [])
    .map((image) => absolute(image.url))
    .filter(Boolean)
    .slice(0, 8);

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url,
    ...(product.description?.short ? { description: product.description.short } : {}),
    ...(images.length > 0 ? { image: images } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.sku ? { sku: product.sku, mpn: product.sku } : {}),
    ...(product.category ? { category: product.category } : {}),
  };

  if (product.price?.amount > 0) {
    data.offers = {
      '@type': 'Offer',
      url,
      price: String(product.price.amount),
      priceCurrency: product.price.currency ?? 'EGP',
      availability: product.availability?.in_stock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/LimitedAvailability',
      // The shop sells in person; the offer is fulfilled by contacting them.
      seller: { '@type': 'Organization', name: shop.name },
    };
  }

  return (
    <script
      type="application/ld+json"
      // The payload is built from our own API, never from user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/** Breadcrumb trail, so search results show Home › Products › Cables. */
export function BreadcrumbJsonLd({ trail = [] }) {
  if (trail.length === 0) return null;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: `${siteUrl}${crumb.href}`,
    })),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
