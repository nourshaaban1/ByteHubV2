'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useDebounced, useProducts } from '../../lib/hooks.js';
import { formatPrice, dirFor } from '../../lib/format.js';
import ProductImage from '../product/ProductImage.jsx';
import Icon from '../ui/Icon.jsx';

/**
 * Instant search over name, brand and SKU.
 *
 * The input is uncontrolled by the URL and debounced, so typing stays smooth
 * and the catalog is queried once the customer pauses rather than on every
 * keystroke. Enter opens the full results page; picking a suggestion jumps
 * straight to the product.
 */
export default function SearchBox({ autoFocus, onNavigate, className }) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef(null);

  const debounced = useDebounced(term, 250);
  const active = debounced.trim().length >= 2;

  const { data, isFetching } = useProducts(
    { search: debounced.trim(), limit: 6 },
    { enabled: active },
  );
  // React Query keeps the previous query's data while disabled, so the results
  // are gated on `active` too — otherwise clearing the box leaves stale
  // suggestions sitting under an empty input.
  const results = active ? (data?.items ?? []) : [];

  // Clicking anywhere else dismisses the suggestions.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => setHighlighted(-1), [debounced]);

  const close = () => {
    setOpen(false);
    setHighlighted(-1);
  };

  const goTo = (href) => {
    close();
    setTerm('');
    onNavigate?.();
    router.push(href);
  };

  const submit = () => {
    const query = term.trim();
    if (query) goTo(`/products?search=${encodeURIComponent(query)}`);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (highlighted >= 0 && results[highlighted]) goTo(`/products/${results[highlighted].slug ?? results[highlighted].id}`);
      else submit();
      return;
    }
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (results.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => (current + step + results.length) % results.length);
    }
  };

  const showPanel = open && active;

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="search"
          value={term}
          autoFocus={autoFocus}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search products, brands or SKU…"
          aria-label="Search products"
          aria-expanded={showPanel}
          aria-controls="search-suggestions"
          role="combobox"
          className="field pl-10 pr-10"
        />
        {term ? (
          <button
            type="button"
            onClick={() => {
              setTerm('');
              close();
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showPanel ? (
        <div
          id="search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden
                     rounded-2xl border border-line bg-white shadow-lift"
        >
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              {isFetching ? 'Searching…' : `No products match "${debounced.trim()}"`}
            </p>
          ) : (
            <>
              <ul className="max-h-[22rem] overflow-y-auto py-1.5">
                {results.map((product, index) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === highlighted}
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => goTo(`/products/${product.slug ?? product.id}`)}
                      className={clsx(
                        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                        index === highlighted ? 'bg-canvas' : 'bg-white',
                      )}
                    >
                      <ProductImage
                        src={product.image}
                        alt={product.name}
                        category={product.category}
                        sizes="44px"
                        className="h-11 w-11 shrink-0 rounded-lg border border-line p-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          dir={dirFor(product.name)}
                          className="block truncate text-sm font-medium text-ink"
                        >
                          {product.name}
                        </span>
                        <span className="block truncate text-xs text-ink-faint">
                          {[product.brand, product.sku].filter(Boolean).join(' · ') ||
                            product.category}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {formatPrice(product.price) ?? '—'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={submit}
                className="flex w-full items-center justify-center gap-1.5 border-t border-line
                           bg-canvas px-4 py-2.5 text-sm font-medium text-ink hover:bg-line/50"
              >
                See all results
                <Icon name="arrowRight" className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
