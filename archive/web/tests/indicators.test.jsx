import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  MarginCell, MarginBandBadge, QualityScore, VerificationBadge,
  IssueChips, PriceCell,
} from '../components/domain/indicators.jsx';

describe('MarginCell', () => {
  it('shows both margin definitions, cost basis first', () => {
    render(
      <MarginCell
        pricing={{ margin_percentage: 70.45, gross_margin_percentage: 41.33, margin_band: 'target' }}
      />,
    );
    // The brief defines margin on cost; the workbooks quote it on revenue.
    // Showing only one would make a thin margin look healthy.
    expect(screen.getByText('70.5%')).toBeInTheDocument();
    expect(screen.getByText('/ 41.3%')).toBeInTheDocument();
  });

  it('renders an em dash when there is not enough data to compute a margin', () => {
    render(<MarginCell pricing={{ margin_percentage: null, margin_band: 'unknown' }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('handles an entirely missing pricing block', () => {
    render(<MarginCell pricing={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows a negative margin as negative', () => {
    render(<MarginCell pricing={{ margin_percentage: -15.9, margin_band: 'loss' }} showBoth={false} />);
    expect(screen.getByText('-15.9%')).toBeInTheDocument();
  });

  it('can hide the secondary basis in dense tables', () => {
    render(
      <MarginCell
        pricing={{ margin_percentage: 70.45, gross_margin_percentage: 41.33, margin_band: 'target' }}
        showBoth={false}
      />,
    );
    expect(screen.queryByText('/ 41.3%')).not.toBeInTheDocument();
  });
});

describe('MarginBandBadge', () => {
  it.each([
    ['loss', 'Loss'],
    ['critical', 'Critical'],
    ['low', 'Low'],
    ['target', 'Target'],
    ['implausible', 'Implausible'],
  ])('labels the %s band', (band, label) => {
    render(<MarginBandBadge band={band} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('explains a loss band on hover rather than relying on colour alone', () => {
    render(<MarginBandBadge band="loss" />);
    expect(screen.getByTitle(/every unit loses money/i)).toBeInTheDocument();
  });

  it('falls back to Unknown for an unrecognised band', () => {
    render(<MarginBandBadge band="not-a-band" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});

describe('QualityScore', () => {
  it('shows the score and its letter grade', () => {
    render(<QualityScore score={85} />);
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('shows a zero score as 0, not as missing', () => {
    render(<QualityScore score={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('F')).toBeInTheDocument();
  });

  it('shows an em dash when unscored — for both the number and the grade', () => {
    render(<QualityScore score={null} />);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});

describe('VerificationBadge', () => {
  it('marks a verified product', () => {
    render(<VerificationBadge status={{ is_verified: true, is_active: true }} />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('marks a draft ahead of generic', () => {
    render(<VerificationBadge status={{ is_draft: true, is_generic: true, is_active: true }} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('marks a generic placeholder', () => {
    render(<VerificationBadge status={{ is_generic: true, is_active: true }} />);
    expect(screen.getByText('Generic')).toBeInTheDocument();
  });

  it('marks an archived product', () => {
    render(<VerificationBadge status={{ is_active: false }} />);
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('defaults to unverified rather than assuming', () => {
    render(<VerificationBadge status={{ is_active: true }} />);
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });
});

describe('IssueChips', () => {
  const issues = [
    { code: 'MISSING_COST', severity: 'critical', message: 'No RDP' },
    { code: 'LOW_MARGIN', severity: 'high', message: 'Thin margin' },
    { code: 'MISSING_IMAGES', severity: 'low', message: 'No images' },
    { code: 'MISSING_SPECS', severity: 'low', message: 'No specs' },
  ];

  it('orders the worst severity first', () => {
    render(<IssueChips issues={issues} limit={2} />);
    expect(screen.getByText('Missing cost')).toBeInTheDocument();
    expect(screen.getByText('Low margin')).toBeInTheDocument();
    // Lower-severity issues are collapsed, not dropped.
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('says "Clean" when there is nothing wrong', () => {
    render(<IssueChips issues={[]} />);
    expect(screen.getByText('Clean')).toBeInTheDocument();
  });

  it('handles a missing issues array', () => {
    render(<IssueChips />);
    expect(screen.getByText('Clean')).toBeInTheDocument();
  });
});

describe('PriceCell', () => {
  it('formats a price in its own currency', () => {
    render(<PriceCell value={440} currency="EGP" />);
    expect(screen.getByText('440 ج.م')).toBeInTheDocument();
  });

  it('flags a price whose currency is unknown instead of assuming one', () => {
    // The backend returns null for unconvertible values; the UI must carry
    // that ambiguity through rather than silently picking a currency.
    render(<PriceCell value={100} currency={null} />);
    expect(screen.getByTitle(/currency unknown/i)).toBeInTheDocument();
  });

  it('renders a missing price as an em dash', () => {
    render(<PriceCell value={null} currency="EGP" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
