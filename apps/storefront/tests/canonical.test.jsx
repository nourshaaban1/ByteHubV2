/**
 * Canonical links and breadcrumb data.
 *
 * Both of these went wrong silently. Next merges layout metadata into every
 * page, so a canonical declared once in the root layout was inherited by the
 * catalog — telling search engines the whole shop was a duplicate of the home
 * page. And the BreadcrumbList component was written, exported and tested
 * without ever being rendered, so the structured data the README promised was
 * not on any page.
 *
 * Neither shows up in a screenshot, which is why they are asserted here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { metadata as rootMetadata } from '../app/layout.jsx';
import { metadata as homeMetadata } from '../app/page.jsx';
import { generateMetadata as catalogMetadata } from '../app/products/page.jsx';
import ProductDetail from '../components/product/ProductDetail.jsx';
import { BreadcrumbJsonLd } from '../components/seo/ProductJsonLd.jsx';
import { productTrail } from '../lib/breadcrumbs.js';
import { makeProduct } from './fixtures.js';

const parse = (container) =>
  JSON.parse(container.querySelector('script[type="application/ld+json"]').innerHTML);

describe('canonical URLs', () => {
  it('the root layout declares no canonical of its own', () => {
    // Every page that did not override it inherited "/" and was published as a
    // duplicate of the home page.
    expect(rootMetadata.alternates?.canonical).toBeUndefined();
    expect(rootMetadata.openGraph?.url).toBeUndefined();
  });

  it('the home page points at the site root', () => {
    expect(homeMetadata.alternates.canonical).toBe('/');
  });

  it('the catalog points at itself, not at the home page', async () => {
    const meta = await catalogMetadata({ searchParams: {} });
    expect(meta.alternates.canonical).toBe('/products');
  });

  it('a category filter is its own page', async () => {
    const meta = await catalogMetadata({ searchParams: { category: 'Power Banks' } });

    expect(meta.alternates.canonical).toBe('/products?category=Power%20Banks');
    expect(meta.title).toBe('Power Banks');
  });

  it('folds a multi-category combination back onto the plain catalog', async () => {
    // "Cables,Audio" is a filter the customer built, not a page worth indexing.
    const meta = await catalogMetadata({ searchParams: { category: 'Cables,Audio' } });
    expect(meta.alternates.canonical).toBe('/products');
  });

  it('ignores sort and page, which reorder the same products', async () => {
    const meta = await catalogMetadata({ searchParams: { sort: 'price_desc', page: '3' } });
    expect(meta.alternates.canonical).toBe('/products');
  });
});

describe('breadcrumb structured data on a product page', () => {
  it('matches the trail the customer can see', () => {
    const product = makeProduct();

    const { container } = render(<BreadcrumbJsonLd trail={productTrail(product)} />);
    const names = parse(container).itemListElement.map((entry) => entry.name);

    render(<ProductDetail product={product} />);
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    const visible = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);

    // Google requires the markup to describe the breadcrumb actually shown.
    expect(names).toEqual(visible);
    expect(names).toEqual(['Home', 'Products', 'Chargers']);
  });

  it('drops the category crumb when a product has no category', () => {
    const trail = productTrail(makeProduct({ category: null }));
    expect(trail.map((crumb) => crumb.label)).toEqual(['Home', 'Products']);
  });
});
