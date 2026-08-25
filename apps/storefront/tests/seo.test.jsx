/**
 * SEO output.
 *
 * For a shop with no checkout, search results *are* the storefront: structured
 * data is what puts a price and an availability badge next to the link, and a
 * wrong one is a manual-action risk rather than a missed opportunity. These
 * assert what we emit and, just as importantly, what we refuse to invent.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ProductJsonLd, { BreadcrumbJsonLd } from '../components/seo/ProductJsonLd.jsx';
import StoreJsonLd from '../components/seo/StoreJsonLd.jsx';
import { makeProduct } from './fixtures.js';

const parse = (container) => JSON.parse(container.querySelector('script[type="application/ld+json"]').innerHTML);

describe('Product structured data', () => {
  it('emits a Product with the fields Google needs for a rich result', () => {
    const { container } = render(<ProductJsonLd product={makeProduct()} />);
    const data = parse(container);

    expect(data['@type']).toBe('Product');
    expect(data.name).toBe('Joyroom JR-TCG13 GaN Wall Charger — 45W USB-C');
    expect(data.sku).toBe('JR-TCG13');
    expect(data.brand).toEqual({ '@type': 'Brand', name: 'Joyroom' });
    expect(data.offers).toMatchObject({
      '@type': 'Offer',
      price: '750',
      priceCurrency: 'EGP',
      availability: 'https://schema.org/InStock',
    });
  });

  it('points at the slug URL, which is what the site links to', () => {
    const { container } = render(<ProductJsonLd product={makeProduct()} />);
    const data = parse(container);

    expect(data.url).toMatch(/\/products\/joyroom-jr-tcg13-gan-wall-charger-45w-usb-c$/);
    expect(data.url).not.toMatch(/[0-9a-f]{24}/);
  });

  it('makes image URLs absolute — a relative one is ignored by crawlers', () => {
    const { container } = render(<ProductJsonLd product={makeProduct()} />);
    for (const image of parse(container).image) {
      expect(image).toMatch(/^https?:\/\//);
    }
  });

  it('omits the offer entirely when there is no price, rather than sending zero', () => {
    const { container } = render(
      <ProductJsonLd product={makeProduct({ price: { amount: null, currency: 'EGP' } })} />,
    );
    expect(parse(container).offers).toBeUndefined();
  });

  it('reports limited availability rather than claiming stock it does not have', () => {
    const { container } = render(
      <ProductJsonLd product={makeProduct({ availability: { in_stock: false } })} />,
    );
    expect(parse(container).offers.availability).toBe('https://schema.org/LimitedAvailability');
  });

  it('leaves out fields the catalog does not know', () => {
    const { container } = render(
      <ProductJsonLd product={makeProduct({ brand: null, sku: null, description: {} })} />,
    );
    const data = parse(container);

    // Structured data that contradicts the page is worse than absent data.
    expect(data).not.toHaveProperty('brand');
    expect(data).not.toHaveProperty('sku');
    expect(data).not.toHaveProperty('description');
    expect(data).not.toHaveProperty('gtin');
  });

  it('renders nothing without a product', () => {
    const { container } = render(<ProductJsonLd product={null} />);
    expect(container.querySelector('script')).toBeNull();
  });

  it('produces valid JSON even for names full of punctuation', () => {
    const { container } = render(
      <ProductJsonLd product={makeProduct({ name: 'Cable "Pro" — 100W <b>& more</b>' })} />,
    );
    expect(() => parse(container)).not.toThrow();
    expect(parse(container).name).toBe('Cable "Pro" — 100W <b>& more</b>');
  });
});

describe('Store structured data', () => {
  it('describes the shop as a local Store with contact details', () => {
    const { container } = render(<StoreJsonLd />);
    const data = parse(container);

    expect(data['@type']).toBe('Store');
    expect(data.telephone).toBeTruthy();
    expect(data.address.addressCountry).toBe('EG');
    expect(data.currenciesAccepted).toBe('EGP');
  });

  it('exposes a search action pointing at the real catalog route', () => {
    const { container } = render(<StoreJsonLd />);
    expect(parse(container).potentialAction.target.urlTemplate).toMatch(
      /\/products\?search=\{search_term_string\}$/,
    );
  });

  it('gives only the locality, because that is all the catalog records', () => {
    const { container } = render(<StoreJsonLd />);
    // Inventing a street line to satisfy the schema would publish something untrue.
    expect(parse(container).address).not.toHaveProperty('streetAddress');
  });
});

describe('Breadcrumb structured data', () => {
  it('numbers the trail from one', () => {
    const { container } = render(
      <BreadcrumbJsonLd
        trail={[
          { label: 'Home', href: '/' },
          { label: 'Products', href: '/products' },
        ]}
      />,
    );
    const data = parse(container);

    expect(data.itemListElement.map((entry) => entry.position)).toEqual([1, 2]);
    expect(data.itemListElement[0].item).toMatch(/^https?:\/\//);
  });

  it('renders nothing for an empty trail', () => {
    const { container } = render(<BreadcrumbJsonLd trail={[]} />);
    expect(container.querySelector('script')).toBeNull();
  });
});
