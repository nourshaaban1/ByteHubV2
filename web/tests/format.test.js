import { describe, it, expect } from 'vitest';
import {
  formatMoney, formatPercent, formatNumber, humanizeCode, isRtl, dirFor, truncate, EM_DASH,
} from '../lib/format.js';
import { gradeFor, bandOf, isFixable, needsDecision } from '../lib/domain.js';

describe('formatMoney — missing values are never rendered as zero', () => {
  it.each([null, undefined, Number.NaN])('renders %s as an em dash', (value) => {
    expect(formatMoney(value, 'EGP')).toBe(EM_DASH);
  });

  it('renders an actual zero as zero, not as missing', () => {
    // A price of 0 and an absent price are different facts.
    expect(formatMoney(0, 'EGP')).not.toBe(EM_DASH);
    expect(formatMoney(0, 'EGP')).toContain('0');
  });

  it('places the EGP symbol after the number and the dollar before it', () => {
    expect(formatMoney(750, 'EGP')).toBe('750 ج.م');
    expect(formatMoney(30, 'USD')).toBe('$30');
  });

  it('groups thousands', () => {
    expect(formatMoney(123560, 'EGP')).toBe('123,560 ج.م');
  });

  it('compacts large figures for tiles', () => {
    expect(formatMoney(123560, 'EGP', { compact: true })).toBe('124K ج.م');
    expect(formatMoney(1_500_000, 'EGP', { compact: true })).toBe('1.5M ج.م');
  });

  it('shows cents on small amounts where rounding would mislead', () => {
    expect(formatMoney(5.5, 'USD')).toBe('$5.50');
  });

  it('falls back to the currency code when the symbol is unknown', () => {
    expect(formatMoney(100, 'SAR')).toBe('100 SAR');
  });
});

describe('formatPercent', () => {
  it('renders null as an em dash rather than 0%', () => {
    expect(formatPercent(null)).toBe(EM_DASH);
  });

  it('keeps a negative margin negative', () => {
    expect(formatPercent(-15.9)).toBe('-15.9%');
  });

  it('drops a trailing .0', () => {
    expect(formatPercent(70.0)).toBe('70%');
  });

  it('renders zero as 0%', () => {
    expect(formatPercent(0)).toBe('0%');
  });
});

describe('formatNumber', () => {
  it('renders missing as an em dash but zero as 0', () => {
    expect(formatNumber(null)).toBe(EM_DASH);
    expect(formatNumber(0)).toBe('0');
  });
});

describe('right-to-left handling', () => {
  it('detects Arabic product names', () => {
    expect(isRtl('شاحن 45W GaN')).toBe(true);
    expect(dirFor('شاحن 45W GaN')).toBe('rtl');
  });

  it('leaves Latin names alone', () => {
    expect(isRtl('Anker PowerPort III')).toBe(false);
    expect(dirFor('Anker PowerPort III')).toBe('ltr');
  });

  it('handles null without throwing', () => {
    expect(dirFor(null)).toBe('ltr');
  });
});

describe('humanizeCode', () => {
  it('turns an issue code into a readable label', () => {
    expect(humanizeCode('SELLING_BELOW_COST')).toBe('Selling below cost');
    expect(humanizeCode('MISSING_COST')).toBe('Missing cost');
  });

  it('handles empty input', () => {
    expect(humanizeCode(null)).toBe('');
  });
});

describe('truncate', () => {
  it('shortens long names with an ellipsis', () => {
    expect(truncate('a'.repeat(100), 10)).toHaveLength(10);
  });

  it('leaves short names untouched', () => {
    expect(truncate('HDMI', 10)).toBe('HDMI');
  });
});

describe('domain vocabulary', () => {
  it.each([
    [95, 'A'], [80, 'B'], [65, 'C'], [45, 'D'], [10, 'F'],
  ])('grades %i as %s', (score, letter) => {
    expect(gradeFor(score).letter).toBe(letter);
  });

  it('shows no grade when there is no score', () => {
    expect(gradeFor(null).letter).toBe(EM_DASH);
  });

  it('falls back to "unknown" for an unrecognised margin band', () => {
    expect(bandOf('nonsense').label).toBe('Unknown');
    expect(bandOf(undefined).label).toBe('Unknown');
  });

  it('separates issues that take a typed value from ones needing a decision', () => {
    expect(isFixable('MISSING_COST')).toBe(true);
    expect(isFixable('DUPLICATE_SKU')).toBe(false);
    expect(needsDecision('DUPLICATE_SKU')).toBe(true);
    expect(needsDecision('AMBIGUOUS_SKU')).toBe(true);
  });
});
