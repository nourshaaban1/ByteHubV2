'use client';

import { useEffect, useState } from 'react';
import { Input, Select, Button, Badge } from '../ui/primitives.jsx';
import { humanizeCode } from '../../lib/format.js';

const ISSUE_CODES = [
  'MISSING_COST', 'MISSING_SELLING_PRICE', 'MISSING_CURRENCY', 'MISSING_QUANTITY',
  'MISSING_SUPPLIER', 'MISSING_BRAND', 'MISSING_CATEGORY', 'MISSING_SPECS', 'MISSING_IMAGES',
  'PRICE_RANGE_ONLY', 'ESTIMATED_PRICE', 'SELLING_BELOW_COST', 'MARKET_BELOW_COST',
  'LOW_MARGIN', 'CRITICAL_MARGIN', 'IMPLAUSIBLE_MARGIN', 'COST_MISMATCH',
  'DUPLICATE_PRODUCT', 'DUPLICATE_SKU', 'AMBIGUOUS_SKU', 'SKU_CORRECTED',
  'GENERATED_SKU', 'GENERIC_ITEM', 'DRAFT_ITEM', 'UNMAPPED_CATEGORY',
];

const BANDS = ['loss', 'critical', 'low', 'healthy', 'target', 'implausible'];

/** Debounced text input so a filter keystroke does not fire a request per letter. */
function DebouncedInput({ value, onChange, delay = 300, ...props }) {
  const [local, setLocal] = useState(value ?? '');

  useEffect(() => setLocal(value ?? ''), [value]);

  useEffect(() => {
    if (local === (value ?? '')) return undefined;
    const timer = setTimeout(() => onChange(local), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return <Input value={local} onChange={(event) => setLocal(event.target.value)} {...props} />;
}

export default function ProductFilters({ filters, onChange, facets = {}, compact }) {
  const set = (patch) => onChange({ ...filters, ...patch, page: 1 });

  const active = Object.entries(filters).filter(
    ([key, value]) =>
      !['page', 'limit', 'sort'].includes(key) && value !== undefined && value !== '' && value !== null,
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <DebouncedInput
          value={filters.search ?? ''}
          onChange={(value) => set({ search: value || undefined })}
          placeholder="Search name, SKU, brand…"
          className="w-full sm:w-64"
          aria-label="Search products"
        />

        <Select
          value={filters.category ?? ''}
          onChange={(event) => set({ category: event.target.value || undefined })}
          aria-label="Category"
          className="w-auto min-w-[9rem]"
        >
          <option value="">All categories</option>
          {(facets.categories ?? []).map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </Select>

        <Select
          value={filters.brand ?? ''}
          onChange={(event) => set({ brand: event.target.value || undefined })}
          aria-label="Brand"
          className="w-auto min-w-[8rem]"
        >
          <option value="">All brands</option>
          {(facets.brands ?? []).map((brand) => (
            <option key={brand} value={brand}>{brand}</option>
          ))}
        </Select>

        {!compact && (
          <>
            <Select
              value={filters.issue_code ?? ''}
              onChange={(event) => set({ issue_code: event.target.value || undefined })}
              aria-label="Issue"
              className="w-auto min-w-[10rem]"
            >
              <option value="">Any issue</option>
              {ISSUE_CODES.map((code) => (
                <option key={code} value={code}>{humanizeCode(code)}</option>
              ))}
            </Select>

            <Select
              value={filters.is_verified ?? ''}
              onChange={(event) => set({ is_verified: event.target.value || undefined })}
              aria-label="Verification"
              className="w-auto"
            >
              <option value="">Any status</option>
              <option value="true">Verified</option>
              <option value="false">Unverified</option>
            </Select>

            <Select
              value={filters.currency ?? ''}
              onChange={(event) => set({ currency: event.target.value || undefined })}
              aria-label="Currency"
              className="w-auto"
            >
              <option value="">Any currency</option>
              <option value="EGP">EGP</option>
              <option value="USD">USD</option>
            </Select>
          </>
        )}

        {active.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ page: 1, limit: filters.limit, sort: filters.sort })}
          >
            Clear
          </Button>
        )}
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map(([key, value]) => (
            <Badge key={key} tone="brand" size="xs">
              <span className="text-ink-faint">{key.replace(/_/g, ' ')}:</span> {String(value)}
              <button
                type="button"
                onClick={() => set({ [key]: undefined })}
                aria-label={`Remove ${key} filter`}
                className="ml-0.5 hover:text-loss"
              >
                ✕
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export { BANDS, ISSUE_CODES };
