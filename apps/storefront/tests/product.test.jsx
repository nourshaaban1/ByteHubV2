/**
 * What a customer sees on a product card and a product page.
 *
 * The recurring rule: the shop must never show a number it does not have.
 * A missing price is "Price on request", never "0 EGP"; an estimated one says
 * so. Getting that wrong on a storefront means quoting a customer a price the
 * shop cannot honour.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ProductCard from '../components/product/ProductCard.jsx';
import ProductDetail from '../components/product/ProductDetail.jsx';
import ProductImage from '../components/product/ProductImage.jsx';
import { formatPrice } from '../lib/format.js';
import { makeProduct } from './fixtures.js';

describe('ProductCard', () => {
  it('links by slug, not by database id', () => {
    render(<ProductCard product={makeProduct()} />);
    const link = screen.getByRole('link');

    expect(link).toHaveAttribute(
      'href',
      '/products/joyroom-jr-tcg13-gan-wall-charger-45w-usb-c',
    );
  });

  it('falls back to the id when a product has no slug', () => {
    render(<ProductCard product={makeProduct({ slug: null })} />);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/products/6a720620267f7e4b8ba9244f',
    );
  });

  it('shows the price with its currency', () => {
    render(<ProductCard product={makeProduct()} />);
    expect(screen.getByText(/750/)).toBeInTheDocument();
  });

  it('says "price on request" rather than showing zero', () => {
    render(<ProductCard product={makeProduct({ price: { amount: null, currency: 'EGP' } })} />);

    expect(screen.queryByText(/^0/)).not.toBeInTheDocument();
    expect(screen.getByText(/request/i)).toBeInTheDocument();
  });

  it('renders an Arabic name right-to-left', () => {
    render(<ProductCard product={makeProduct({ name: 'شاحن 45W GaN' })} />);
    expect(screen.getByText('شاحن 45W GaN')).toHaveAttribute('dir', 'rtl');
  });
});

describe('ProductImage', () => {
  it('renders the photo when there is one', () => {
    render(<ProductImage src="/catalog/a.jpg" alt="Charger" category="Chargers" />);
    expect(screen.getByRole('img', { name: 'Charger' })).toHaveAttribute('src', '/catalog/a.jpg');
  });

  it('falls back to a labelled placeholder instead of a broken image', () => {
    render(<ProductImage src={null} alt="Charger" category="Chargers" />);
    expect(screen.getByRole('img', { name: /no photo available/i })).toBeInTheDocument();
  });

  it('keeps the caller’s sizing and padding classes on the wrapper', () => {
    // The photos sit inset on a white card; an image that fills its container
    // edge to edge is a visual regression, not just a detail.
    const { container } = render(
      <ProductImage src="/catalog/a.jpg" alt="x" className="aspect-square w-full p-6" />,
    );
    expect(container.firstChild).toHaveClass('aspect-square', 'w-full', 'p-6');
  });
});

describe('ProductDetail', () => {
  it('shows name, SKU, price and both descriptions', () => {
    render(<ProductDetail product={makeProduct()} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Joyroom JR-TCG13');
    expect(screen.getByText('SKU JR-TCG13')).toBeInTheDocument();
    expect(screen.getByText(formatPrice(makeProduct().price))).toBeInTheDocument();
    expect(screen.getByText(/GaN wall charger with a single USB-C port/)).toBeInTheDocument();
    expect(screen.getByText(/gallium nitride/)).toBeInTheDocument();
  });

  it('renders a breadcrumb trail back to the category', () => {
    render(<ProductDetail product={makeProduct()} />);
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });

    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Chargers' })).toHaveAttribute(
      'href',
      '/products?category=Chargers',
    );
  });

  it('flags an estimated price instead of presenting it as firm', () => {
    render(
      <ProductDetail
        product={makeProduct({ price: { amount: 750, currency: 'EGP', is_estimated: true } })}
      />,
    );
    expect(screen.getByText(/approximate/i)).toBeInTheDocument();
  });

  it('asks the customer to check availability when stock is unknown', () => {
    render(<ProductDetail product={makeProduct({ availability: { in_stock: false } })} />);
    expect(screen.getByText(/ask us about availability/i)).toBeInTheDocument();
  });

  it('offers a WhatsApp link carrying the SKU the shop searches on', () => {
    render(<ProductDetail product={makeProduct()} />);
    const contact = screen.getByRole('link', { name: /contact to buy/i });

    expect(contact).toHaveAttribute('href', expect.stringContaining('wa.me/'));
    expect(decodeURIComponent(contact.getAttribute('href'))).toContain('JR-TCG13');
    expect(contact).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders related products as real links, so crawlers follow them', () => {
    const related = [makeProduct({ id: 'x', slug: 'other-charger', name: 'Other charger' })];
    render(<ProductDetail product={makeProduct()} related={related} />);

    expect(screen.getByRole('link', { name: /Other charger/ })).toHaveAttribute(
      'href',
      '/products/other-charger',
    );
  });

  it('omits the related strip entirely when there is nothing to show', () => {
    render(<ProductDetail product={makeProduct()} related={[]} />);
    expect(screen.queryByText(/More in/)).not.toBeInTheDocument();
  });

  it('survives a product with no specs, no images and no descriptions', () => {
    const bare = makeProduct({ specs: {}, images: [], image: null, description: {} });
    expect(() => render(<ProductDetail product={bare} />)).not.toThrow();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
