'use client';

import { useEffect, useState } from 'react';
import { useProducts } from '../../lib/hooks.js';
import { useCatalogParams } from '../../lib/useCatalogParams.js';
import { formatCount } from '../../lib/format.js';
import ProductGrid from '../product/ProductGrid.jsx';
import Pagination from '../ui/Pagination.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Icon from '../ui/Icon.jsx';
import FilterPanel from '../filters/FilterPanel.jsx';
import SortSelect from '../filters/SortSelect.jsx';
import ActiveFilters from '../filters/ActiveFilters.jsx';

export default function CatalogView() {
  const { filters, query, update, toggleInList, clearAll, activeCount } = useCatalogParams();
  const { data, isLoading, isFetching, isError, error } = useProducts(query);
  const [sheetOpen, setSheetOpen] = useState(false);

  const products = data?.items ?? [];
  const meta = data?.meta;

  useEffect(() => {
    document.body.style.overflow = sheetOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);

  const heading = filters.search
    ? `Results for “${filters.search}”`
    : filters.category.length === 1
      ? filters.category[0]
      : 'All products';

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="section-title">{heading}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {isLoading ? 'Loading…' : formatCount(meta?.total ?? 0, 'product')}
            {/* Only shown on a background refetch, so the count reads as
                "updating" rather than the grid silently going stale. */}
            {isFetching && !isLoading ? ' · updating' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="chip gap-2 lg:hidden"
            aria-label="Open filters"
          >
            <Icon name="filter" className="h-4 w-4" />
            Filters
            {activeCount > 0 ? (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-semibold text-white">
                {activeCount}
              </span>
            ) : null}
          </button>

          <SortSelect value={filters.sort} onChange={(sort) => update({ sort })} />
        </div>
      </div>

      <div className="mt-5">
        <ActiveFilters
          filters={filters}
          update={update}
          toggleInList={toggleInList}
          clearAll={clearAll}
        />
      </div>

      <div className="mt-6 flex gap-8">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-sm font-semibold text-ink">Filters</h2>
              {activeCount > 0 ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-medium text-ink-muted hover:text-ink"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <FilterPanel filters={filters} update={update} toggleInList={toggleInList} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {isError ? (
            <EmptyState
              icon="alert"
              title="Couldn't load products"
              message={error?.message ?? 'Something went wrong reaching the catalog.'}
            />
          ) : !isLoading && products.length === 0 ? (
            <EmptyState
              icon="search"
              title="No products match"
              message={
                activeCount > 0 || filters.search
                  ? 'Try removing a filter or searching for something broader.'
                  : 'The catalog is imported but nothing has been approved for the storefront yet.'
              }
              action={
                activeCount > 0 || filters.search ? (
                  <button type="button" onClick={clearAll} className="btn-ghost">
                    Clear all filters
                  </button>
                ) : null
              }
            />
          ) : (
            <>
              <ProductGrid products={products} loading={isLoading} skeletonCount={12} />

              {meta?.pages > 1 ? (
                <div className="mt-10">
                  <Pagination
                    page={meta.page}
                    pages={meta.pages}
                    onChange={(page) => update({ page })}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {sheetOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
          />

          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-5 py-4">
              <h2 className="text-base font-semibold text-ink">Filters</h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close filters"
                className="rounded-full border border-line p-1.5"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 pb-5">
              <FilterPanel filters={filters} update={update} toggleInList={toggleInList} />
            </div>

            <div className="sticky bottom-0 flex gap-2.5 border-t border-line bg-white px-5 py-4">
              {activeCount > 0 ? (
                <button type="button" onClick={clearAll} className="btn-ghost flex-1">
                  Clear all
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="btn-primary flex-1"
              >
                Show {meta?.total ?? 0} products
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
