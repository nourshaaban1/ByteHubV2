'use client';

import Link from 'next/link';
import { useProducts } from '../../lib/hooks.js';
import ProductGrid from '../product/ProductGrid.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Icon from '../ui/Icon.jsx';

/**
 * The home page grid.
 *
 * Sorted by the backend's `featured` order, which puts the best-documented
 * products — real photos, filled-in specs, a description — at the front. That
 * is the right shop window: the products the catalog can actually sell.
 */
export default function FeaturedSection({
  eyebrow = 'The shelf',
  title,
  subtitle,
  params,
  limit = 8,
  initialProducts,
}) {
  const { data, isLoading, isError, error } = useProducts(
    { limit, ...params },
    { initialData: initialProducts },
  );
  const products = data?.items ?? [];

  return (
    <section className="container-page pb-20">
      <div className="section-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="section-title mt-2">{title}</h2>
          {subtitle ? <p className="mt-2 text-sm text-ink-muted">{subtitle}</p> : null}
        </div>
        <Link
          href="/products"
          className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-ink transition-colors hover:text-accent sm:flex"
        >
          View all
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-8">
        {isError ? (
          <EmptyState
            icon="alert"
            title="Couldn't load products"
            message={error?.message ?? 'Something went wrong reaching the catalog.'}
          />
        ) : !isLoading && products.length === 0 ? (
          <EmptyState
            title="No products published yet"
            message="The catalog is imported but nothing has been approved for the storefront."
          />
        ) : (
          <ProductGrid products={products} loading={isLoading} skeletonCount={limit} />
        )}
      </div>

      <div className="mt-8 sm:hidden">
        <Link href="/products" className="btn-ghost w-full">
          View all products
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
