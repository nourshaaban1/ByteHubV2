'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useFacets } from '../../lib/hooks.js';
import { formatPrice } from '../../lib/format.js';
import Icon from '../ui/Icon.jsx';

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-line py-4 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-ink">{title}</span>
        <Icon
          name="chevronDown"
          className={clsx('h-4 w-4 text-ink-faint transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function CheckboxRow({ label, count, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 shrink-0 rounded border-line text-ink focus:ring-ink"
      />
      <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-ink-faint">{count}</span>
    </label>
  );
}

/**
 * Price range.
 *
 * Kept in local state and committed on submit rather than on change: filtering
 * the grid on every keystroke means typing "1500" briefly filters to "max 1",
 * which is both jarring and three wasted requests.
 */
function PriceRange({ filters, update, bounds }) {
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  // Re-sync when the URL changes underneath us (back button, clear-all).
  useEffect(() => {
    setMin(filters.min_price !== undefined ? String(filters.min_price) : '');
    setMax(filters.max_price !== undefined ? String(filters.max_price) : '');
  }, [filters.min_price, filters.max_price]);

  const commit = (event) => {
    event.preventDefault();
    const parse = (value) => {
      const trimmed = value.trim();
      if (trimmed === '') return undefined;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };

    let lower = parse(min);
    let upper = parse(max);
    // The API rejects an inverted range with a 400; swapping is friendlier
    // than showing a customer a validation error for an obvious typo.
    if (lower !== undefined && upper !== undefined && lower > upper) {
      [lower, upper] = [upper, lower];
    }

    update({ min_price: lower, max_price: upper });
  };

  return (
    <form onSubmit={commit}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={min}
          onChange={(event) => setMin(event.target.value)}
          placeholder={bounds?.min != null ? String(bounds.min) : 'Min'}
          aria-label="Minimum price in EGP"
          className="field px-2.5 py-2 text-sm"
        />
        <span className="text-ink-faint">–</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={max}
          onChange={(event) => setMax(event.target.value)}
          placeholder={bounds?.max != null ? String(bounds.max) : 'Max'}
          aria-label="Maximum price in EGP"
          className="field px-2.5 py-2 text-sm"
        />
      </div>

      {bounds?.min != null && bounds?.max != null ? (
        <p className="mt-2 text-xs text-ink-faint">
          Catalog range {formatPrice({ amount: bounds.min, currency: 'EGP' })} –{' '}
          {formatPrice({ amount: bounds.max, currency: 'EGP' })}
        </p>
      ) : null}

      <button type="submit" className="btn-ghost mt-3 w-full py-2 text-sm">
        Apply price
      </button>
    </form>
  );
}

export default function FilterPanel({ filters, update, toggleInList }) {
  const { data: facets, isLoading } = useFacets();

  if (isLoading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="skeleton h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <Section title="Category">
        <div className="max-h-64 overflow-y-auto pr-1">
          {facets?.categories?.map((entry) => (
            <CheckboxRow
              key={entry.name}
              label={entry.name}
              count={entry.count}
              checked={filters.category.includes(entry.name)}
              onChange={() => toggleInList('category', entry.name)}
            />
          ))}
        </div>
      </Section>

      <Section title="Brand">
        <div className="max-h-64 overflow-y-auto pr-1">
          {facets?.brands?.map((entry) => (
            <CheckboxRow
              key={entry.name}
              label={entry.name}
              count={entry.count}
              checked={filters.brand.includes(entry.name)}
              onChange={() => toggleInList('brand', entry.name)}
            />
          ))}
        </div>
      </Section>

      <Section title="Price (EGP)">
        <PriceRange filters={filters} update={update} bounds={facets?.price} />
      </Section>
    </div>
  );
}
