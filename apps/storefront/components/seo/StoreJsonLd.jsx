import { shop } from '../../lib/shop.js';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001').replace(/\/$/, '');

/**
 * Schema.org data for the shop itself.
 *
 * A `Store` rather than a plain `Organization`: ByteHub sells in person, and
 * the local-business shape is what puts a phone number and an area next to the
 * result for someone searching nearby.
 *
 * The address is deliberately coarse. Structured data is published to the
 * world, and the catalog only records a city — inventing a street line to fill
 * the schema would be publishing something untrue.
 */
export default function StoreJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': `${siteUrl}/#store`,
    name: shop.name,
    description: shop.tagline,
    url: siteUrl,
    telephone: shop.phone,
    email: shop.email,
    address: { '@type': 'PostalAddress', addressLocality: shop.address, addressCountry: 'EG' },
    currenciesAccepted: 'EGP',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/products?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
