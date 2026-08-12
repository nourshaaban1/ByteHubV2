/**
 * Display formatting only.
 *
 * The critical rule here: a missing value renders as an explicit "—", never as
 * 0, never as a guess. The backend deliberately returns null when it cannot
 * know something (an unconvertible currency, an absent cost), and the UI must
 * carry that distinction through to the operator rather than flattening it.
 */
export const EM_DASH = '—';

const isNil = (value) => value === null || value === undefined || Number.isNaN(value);

const CURRENCY_SYMBOLS = { EGP: 'ج.م', USD: '$' };

export function formatMoney(value, currency = 'EGP', { compact = false, decimals } = {}) {
  if (isNil(value)) return EM_DASH;

  const symbol = CURRENCY_SYMBOLS[currency] ?? currency ?? '';
  const abs = Math.abs(value);

  if (compact && abs >= 1000) {
    const units = [
      { limit: 1e9, suffix: 'B' },
      { limit: 1e6, suffix: 'M' },
      { limit: 1e3, suffix: 'K' },
    ];
    const unit = units.find((entry) => abs >= entry.limit);
    const scaled = value / unit.limit;
    const text = `${scaled.toFixed(scaled >= 100 ? 0 : 1).replace(/\.0$/, '')}${unit.suffix}`;
    return currency === 'USD' ? `${symbol}${text}` : `${text} ${symbol}`;
  }

  const places = decimals ?? (abs > 0 && abs < 10 ? 2 : 0);
  const text = value.toLocaleString('en-US', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });

  return currency === 'USD' ? `${symbol}${text}` : `${text} ${symbol}`;
}

export function formatPercent(value, { decimals = 1, sign = false } = {}) {
  if (isNil(value)) return EM_DASH;
  const text = value.toFixed(decimals).replace(/\.0$/, '');
  return `${sign && value > 0 ? '+' : ''}${text}%`;
}

export function formatNumber(value, { decimals = 0 } = {}) {
  if (isNil(value)) return EM_DASH;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDate(value, { withTime = false } = {}) {
  if (!value) return EM_DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function formatRelative(value) {
  if (!value) return EM_DASH;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return EM_DASH;

  const seconds = Math.round((then - Date.now()) / 1000);
  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, 'second');
}

/** Turns MISSING_COST into "Missing cost" for display. */
export function humanizeCode(code) {
  if (!code) return '';
  const text = String(code).replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function truncate(value, length = 60) {
  const text = String(value ?? '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** Right-to-left detection, so Arabic product names render correctly in tables. */
const RTL = /[؀-ۿݐ-ݿ]/;
export const isRtl = (value) => RTL.test(String(value ?? ''));
export const dirFor = (value) => (isRtl(value) ? 'rtl' : 'ltr');

export default {
  formatMoney,
  formatPercent,
  formatNumber,
  formatDate,
  formatRelative,
  humanizeCode,
  truncate,
  isRtl,
  dirFor,
  EM_DASH,
};
