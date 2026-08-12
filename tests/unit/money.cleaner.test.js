import { describe, it, expect } from 'vitest';
import { parseMoney, parsePercent, parseInteger } from '../../src/modules/catalog/cleaners/money.cleaner.js';

describe('parseMoney — plain values', () => {
  it('accepts a number straight from Excel', () => {
    const result = parseMoney(440);
    expect(result).toMatchObject({ value: 440, min: 440, max: 440, is_range: false, ok: true });
  });

  it('accepts a numeric string with thousands separators', () => {
    expect(parseMoney('1,399').value).toBe(1399);
  });

  it('reads a decimal', () => {
    expect(parseMoney('247.50').value).toBe(247.5);
  });
});

describe('parseMoney — ranges', () => {
  it('parses "225-270" and uses the midpoint as the headline value', () => {
    expect(parseMoney('225-270')).toMatchObject({ value: 247.5, min: 225, max: 270, is_range: true });
  });

  it('parses a range with thousands separators', () => {
    expect(parseMoney('1,100-1,400')).toMatchObject({ min: 1100, max: 1400, value: 1250 });
  });

  it('parses an en-dash range with currency symbols on both sides', () => {
    expect(parseMoney('$25 – $35')).toMatchObject({ min: 25, max: 35, value: 30, currency: 'USD' });
  });

  it('parses a spaced hyphen range', () => {
    expect(parseMoney('25 – 35', { defaultCurrency: 'EGP' })).toMatchObject({ min: 25, max: 35, currency: 'EGP' });
  });

  it('normalises a reversed range', () => {
    expect(parseMoney('35-25')).toMatchObject({ min: 25, max: 35, value: 30 });
  });

  it('marks any range as an estimate', () => {
    expect(parseMoney('25-35').is_estimated).toBe(true);
  });
});

describe('parseMoney — currency detection', () => {
  it.each([
    ['$25', 'USD'],
    ['25 USD', 'USD'],
    ['750 ج.م', 'EGP'],
    ['750 EGP', 'EGP'],
    ['750 جنيه', 'EGP'],
  ])('reads the currency out of %s', (input, currency) => {
    expect(parseMoney(input).currency).toBe(currency);
  });

  it('falls back to the supplied default', () => {
    expect(parseMoney('440', { defaultCurrency: 'EGP' }).currency).toBe('EGP');
  });

  it('lets an explicit symbol override the default', () => {
    expect(parseMoney('$30', { defaultCurrency: 'EGP' }).currency).toBe('USD');
  });
});

describe('parseMoney — variant pricing', () => {
  it('splits "64GB: $6–$9 | 128GB: $9–$13 | 256GB: $15–$20" into variants', () => {
    const result = parseMoney('64GB: $6–$9 | 128GB: $9–$13 | 256GB: $15–$20');
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]).toMatchObject({ label: '64GB', min: 6, max: 9, currency: 'USD' });
    expect(result.variants[2]).toMatchObject({ label: '256GB', min: 15, max: 20 });
    // The low end is the honest headline for a variant list.
    expect(result.min).toBe(6);
    expect(result.max).toBe(20);
    expect(result.is_estimated).toBe(true);
  });
});

describe('parseMoney — non-values and commentary', () => {
  it.each(['n/a', 'N/A', '-', '—', 'TBD', 'none', '', 'Not purchased'])(
    'treats %s as no value rather than zero',
    (input) => {
      const result = parseMoney(input);
      expect(result.value).toBeNull();
      expect(result.ok).toBe(false);
    },
  );

  it('handles null and undefined', () => {
    expect(parseMoney(null).value).toBeNull();
    expect(parseMoney(undefined).value).toBeNull();
  });

  it('parses "n/a — priced above market" as no value, keeping the reason', () => {
    const result = parseMoney('n/a — priced above market');
    expect(result.value).toBeNull();
    expect(result.note).toBe('priced above market');
  });

  it('keeps the number and captures the caveat in "1,000-1,400 (plan\'s guess — unverified)"', () => {
    const result = parseMoney("1,000-1,400 (plan's guess — unverified)");
    expect(result.min).toBe(1000);
    expect(result.max).toBe(1400);
    expect(result.note).toContain('unverified');
    expect(result.is_estimated).toBe(true);
  });

  it('marks "~500" and "est. 500" as estimates', () => {
    expect(parseMoney('~500').is_estimated).toBe(true);
    expect(parseMoney('est. 500').is_estimated).toBe(true);
  });

  it('honours an estimate hint from the column header', () => {
    expect(parseMoney(500, { assumeEstimate: true }).is_estimated).toBe(true);
  });
});

describe('parseMoney — hostile input', () => {
  it('does not read a negative number as a range', () => {
    const result = parseMoney('-25');
    expect(result.value).toBe(-25);
    expect(result.is_range).toBe(false);
  });

  it('converts Arabic-Indic digits', () => {
    expect(parseMoney('٤٤٠').value).toBe(440);
  });

  it('returns no value for text with no digits', () => {
    expect(parseMoney('priced on application').ok).toBe(false);
  });

  it('survives NaN and Infinity', () => {
    expect(parseMoney(Number.NaN).ok).toBe(false);
    expect(parseMoney(Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});

describe('parsePercent', () => {
  it('reads Excel\'s fraction representation', () => {
    expect(parsePercent(0.413333333333333)).toBe(41.33);
  });

  it('reads a literal percent string', () => {
    expect(parsePercent('41.3%')).toBe(41.3);
  });

  it('reads a bare number above 1 as an already-scaled percentage', () => {
    expect(parsePercent(41.3)).toBe(41.3);
  });

  it('treats exactly 1 as 100%, not 1%', () => {
    expect(parsePercent(1)).toBe(100);
  });

  it('keeps "0.5%" as 0.5 because the symbol is explicit', () => {
    expect(parsePercent('0.5%')).toBe(0.5);
  });

  it('handles negatives and blanks', () => {
    expect(parsePercent('-12%')).toBe(-12);
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('n/a')).toBeNull();
    expect(parsePercent(null)).toBeNull();
  });
});

describe('parseInteger', () => {
  it('parses quantities', () => {
    expect(parseInteger(30)).toBe(30);
    expect(parseInteger('30')).toBe(30);
    expect(parseInteger('1,200')).toBe(1200);
  });

  it('truncates a stray decimal', () => {
    expect(parseInteger(30.7)).toBe(30);
  });

  it('returns null for non-quantities', () => {
    expect(parseInteger('—')).toBeNull();
    expect(parseInteger('n/a')).toBeNull();
    expect(parseInteger(null)).toBeNull();
  });
});
