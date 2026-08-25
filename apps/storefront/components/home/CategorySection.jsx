'use client';

import Link from 'next/link';
import { FEATURED_CATEGORIES } from '../../lib/categories.js';
import { useFacets } from '../../lib/hooks.js';
import { formatCount } from '../../lib/format.js';
import Icon from '../ui/Icon.jsx';

export default function CategorySection({ initialFacets }) {
  const { data: facets } = useFacets({ initialData: initialFacets });

  const countFor = (name) =>
    facets?.categories?.find((entry) => entry.name === name)?.count ?? null;

  return (
    <section className="container-page py-16 sm:py-20">
      <div className="section-head">
        <div>
          <span className="eyebrow">Browse</span>
          <h2 className="section-title mt-2">Shop by category</h2>
        </div>
        <Link
          href="/products"
          className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-ink transition-colors hover:text-accent sm:flex"
        >
          See everything
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {FEATURED_CATEGORIES.map((category) => {
          const count = countFor(category.name);

          return (
            <Link
              key={category.name}
              href={`/products?category=${encodeURIComponent(category.name)}`}
              className="group relative isolate flex min-h-[11rem] flex-col overflow-hidden rounded-2xl
                         border border-line bg-white p-5 transition-all duration-300
                         hover:-translate-y-1 hover:border-transparent hover:shadow-lift sm:min-h-[13rem] sm:p-6"
            >
              <div
                aria-hidden="true"
                className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-60 transition-opacity duration-300 group-hover:opacity-100 ${category.accent}`}
              />
              {/* Oversized glyph bleeding off the corner: gives each tile a
                  distinct silhouette without needing category artwork. */}
              <Icon
                name={category.icon}
                aria-hidden="true"
                strokeWidth={1}
                className="pointer-events-none absolute -bottom-6 -right-6 -z-10 h-32 w-32 text-ink/[0.07]
                           transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6"
              />

              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/85 text-ink shadow-card backdrop-blur">
                <Icon name={category.icon} className="h-5 w-5" />
              </span>

              <h3 className="display mt-auto pt-8 text-base text-ink sm:text-lg">
                {category.name}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted sm:text-sm">
                {category.blurb}
              </p>

              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
                {/* Non-breaking space holds the row's height until the count
                    arrives, so the grid does not jump on load. */}
                {count === null ? ' ' : formatCount(count, 'product')}
                {count !== null ? (
                  <Icon
                    name="arrowRight"
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
                  />
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
