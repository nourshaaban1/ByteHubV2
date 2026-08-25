/**
 * The edge cases the brief names: missing fields, invalid pricing, duplicate
 * SKUs. Each asserts the rule that nothing is assumed and nothing is hidden.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarginCell, PriceCell, QualityScore, IssueChips, VerificationBadge } from '../components/domain/indicators.jsx';
import { Table, THead, TH, TBody, TR, TD } from '../components/ui/Table.jsx';
import { ErrorState, EmptyState } from '../components/ui/primitives.jsx';
import { makeProduct } from './utils.jsx';

const Row = ({ product }) => (
  <Table>
    <THead><TH>Product</TH><TH>Cost</TH><TH>Price</TH><TH>Margin</TH><TH>Quality</TH><TH>Issues</TH></THead>
    <TBody>
      <TR>
        <TD>{product.name}</TD>
        <TD><PriceCell value={product.pricing?.rdp} currency={product.pricing?.currency} /></TD>
        <TD><PriceCell value={product.pricing?.selling_price} currency={product.pricing?.currency} /></TD>
        <TD><MarginCell pricing={product.pricing} /></TD>
        <TD><QualityScore score={product.metadata?.data_quality_score} /></TD>
        <TD><IssueChips issues={product.issues} limit={3} /></TD>
      </TR>
    </TBody>
  </Table>
);

describe('a product with no cost', () => {
  const product = makeProduct({
    pricing: { currency: 'EGP', rdp: null, selling_price: 750, margin_percentage: null, margin_band: 'unknown' },
    metadata: { data_quality_score: 32 },
    issues: [{ code: 'MISSING_COST', severity: 'critical', message: 'No RDP' }],
  });

  it('shows the missing cost as an em dash, never as zero', () => {
    render(<Row product={product} />);
    const cells = screen.getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('—');
    expect(cells[1]).not.toHaveTextContent('0');
  });

  it('leaves the margin blank rather than inventing one', () => {
    render(<Row product={product} />);
    expect(screen.getAllByRole('cell')[3]).toHaveTextContent('—');
  });

  it('surfaces the reason as an issue chip', () => {
    render(<Row product={product} />);
    expect(screen.getByText('Missing cost')).toBeInTheDocument();
  });
});

describe('a product priced below cost', () => {
  const product = makeProduct({
    pricing: {
      currency: 'EGP', rdp: 1665, selling_price: 1400,
      margin_percentage: -15.92, gross_margin_percentage: -18.93, margin_band: 'loss',
    },
    issues: [{ code: 'SELLING_BELOW_COST', severity: 'critical', message: 'Loses money per unit' }],
  });

  it('shows the negative margin rather than clamping it to zero', () => {
    render(<Row product={product} />);
    expect(screen.getByText('-15.9%')).toBeInTheDocument();
  });

  it('names the problem in words, not only in colour', () => {
    render(<Row product={product} />);
    expect(screen.getByText('Selling below cost')).toBeInTheDocument();
  });
});

describe('a product whose currency is unknown', () => {
  const product = makeProduct({
    pricing: {
      currency: null, rdp: 440, selling_price: 750,
      margin_percentage: 70.45, margin_band: 'target',
      normalized: { currency: 'EGP', rdp: null, selling_price: null },
    },
    issues: [{ code: 'MISSING_CURRENCY', severity: 'high', message: 'Currency unknown' }],
  });

  it('marks the price as not comparable instead of assuming a currency', () => {
    render(<Row product={product} />);
    expect(screen.getAllByTitle(/currency unknown/i).length).toBeGreaterThan(0);
  });

  it('still shows the margin, which is currency-agnostic', () => {
    render(<Row product={product} />);
    expect(screen.getByText('70.5%')).toBeInTheDocument();
  });
});

describe('a product with a duplicate SKU', () => {
  const product = makeProduct({
    issues: [
      { code: 'AMBIGUOUS_SKU', severity: 'high', message: 'Supplier reuses this model code' },
      { code: 'DUPLICATE_PRODUCT', severity: 'high', message: 'Also present in another catalog' },
    ],
  });

  it('flags rather than blocks — the row still renders in full', () => {
    render(<Row product={product} />);
    // A shared SKU is a real supplier practice, not a reason to hide a product.
    expect(screen.getByText('شاحن 45W GaN')).toBeInTheDocument();
    expect(screen.getByText('Ambiguous sku')).toBeInTheDocument();
    expect(screen.getByText('Duplicate product')).toBeInTheDocument();
  });
});

describe('a generic placeholder row', () => {
  const product = makeProduct({
    name: 'GENERAL CABLE TYPE C TO TYPE C',
    status: { is_active: true, is_generic: true, is_verified: false },
    metadata: { data_quality_score: 0 },
    issues: [{ code: 'GENERIC_ITEM', severity: 'medium', message: 'Placeholder, not a real SKU' }],
  });

  it('is labelled as generic so it is never mistaken for orderable stock', () => {
    render(<VerificationBadge status={product.status} />);
    expect(screen.getByText('Generic')).toBeInTheDocument();
  });

  it('shows a zero quality score as 0, distinct from unscored', () => {
    render(<QualityScore score={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

describe('a completely empty product', () => {
  it('renders every cell without throwing', () => {
    const product = { name: 'Unknown item', pricing: {}, metadata: {}, issues: [], status: {} };
    expect(() => render(<Row product={product} />)).not.toThrow();
    expect(screen.getByText('Unknown item')).toBeInTheDocument();
  });

  it('survives null sub-objects entirely', () => {
    const product = { name: 'Broken', pricing: null, metadata: null, issues: null, status: null };
    expect(() => render(<Row product={product} />)).not.toThrow();
  });
});

describe('failure states', () => {
  it('shows the backend error code and field details rather than a generic message', () => {
    render(
      <ErrorState
        error={{
          message: 'Request validation failed',
          code: 'BAD_REQUEST',
          details: [{ path: 'pricing.rdp', message: 'Must not be negative' }],
        }}
      />,
    );
    expect(screen.getByText('Request validation failed')).toBeInTheDocument();
    expect(screen.getByText('BAD_REQUEST')).toBeInTheDocument();
    expect(screen.getByText('pricing.rdp')).toBeInTheDocument();
  });

  it('explains an empty result instead of showing a blank panel', () => {
    render(<EmptyState title="No products match these filters" description="Try clearing a filter." />);
    expect(screen.getByText('No products match these filters')).toBeInTheDocument();
  });
});
