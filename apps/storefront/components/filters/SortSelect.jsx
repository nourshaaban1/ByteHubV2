'use client';

import Icon from '../ui/Icon.jsx';

/**
 * Sort values must match the API's allowlist exactly — it validates the enum
 * and 400s on anything else.
 */
export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name: A to Z' },
  { value: 'newest', label: 'Newest first' },
];

export default function SortSelect({ value, onChange }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Sort products"
        className="field appearance-none py-2 pl-3.5 pr-9 text-sm"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
      />
    </div>
  );
}
