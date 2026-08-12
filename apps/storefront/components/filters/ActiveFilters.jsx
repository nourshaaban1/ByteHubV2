'use client';

import { formatPrice } from '../../lib/format.js';
import Icon from '../ui/Icon.jsx';

/**
 * The applied filters, each individually removable.
 *
 * On mobile the filter controls live behind a sheet, so without this row a
 * customer has no visible reason why the grid is showing nine products.
 */
export default function ActiveFilters({ filters, update, toggleInList, clearAll }) {
  const chips = [];

  if (filters.search) {
    chips.push({
      key: 'search',
      label: `“${filters.search}”`,
      onRemove: () => update({ search: undefined }),
    });
  }

  for (const category of filters.category) {
    chips.push({
      key: `category:${category}`,
      label: category,
      onRemove: () => toggleInList('category', category),
    });
  }

  for (const brand of filters.brand) {
    chips.push({
      key: `brand:${brand}`,
      label: brand,
      onRemove: () => toggleInList('brand', brand),
    });
  }

  if (filters.min_price !== undefined || filters.max_price !== undefined) {
    const money = (amount) => formatPrice({ amount, currency: 'EGP' });
    const label =
      filters.min_price !== undefined && filters.max_price !== undefined
        ? `${money(filters.min_price)} – ${money(filters.max_price)}`
        : filters.min_price !== undefined
          ? `From ${money(filters.min_price)}`
          : `Up to ${money(filters.max_price)}`;

    chips.push({
      key: 'price',
      label,
      onRemove: () => update({ min_price: undefined, max_price: undefined }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="chip gap-1.5 pr-2.5"
          aria-label={`Remove filter ${chip.label}`}
        >
          {chip.label}
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      ))}

      {chips.length > 1 ? (
        <button
          type="button"
          onClick={clearAll}
          className="px-1.5 text-sm font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
