'use client';

import Link from 'next/link';
import { useFacets, useProducts } from '../../lib/hooks.js';
import { shop, whatsappLink } from '../../lib/shop.js';
import ProductImage from '../product/ProductImage.jsx';
import Icon from '../ui/Icon.jsx';

/**
 * Landing hero.
 *
 * Dark, so the white product photography in the strip below it has something
 * to sit against — on a white hero the shelf would dissolve into the page.
 *
 * The counts come from the live facet endpoint rather than being written into
 * the copy: a storefront claiming "500+ products" over a catalog of 59 is
 * exactly the kind of detail that costs a shop trust.
 */
export default function Hero() {
  const { data: facets } = useFacets();

  // Only products with real photography — this is a shop window, and a row of
  // placeholder glyphs is worse than no row at all.
  const { data } = useProducts({ has_image: true, limit: 12, sort: 'featured' });
  const shelf = data?.items ?? [];

  const stats = [
    { value: facets?.total, label: 'products in stock' },
    { value: facets?.categories?.length, label: 'categories' },
    { value: facets?.brands?.length, label: 'brands' },
  ];

  return (
    <section className="relative overflow-hidden bg-ink text-white">
      {/* Colour wash + grid, drawn behind everything and ignored by pointers. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_12%_0%,rgba(47,91,255,0.38)_0%,transparent_62%),radial-gradient(45%_55%_at_88%_5%,rgba(245,158,11,0.18)_0%,transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:64px_64px]"
      />

      <div className="container-page relative pt-16 sm:pt-20 lg:pt-24">
        <div className="max-w-3xl animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Checked, priced and in stock in Egypt
          </span>

          <h1 className="display mt-6 text-[2.75rem] leading-[0.95] sm:text-6xl lg:text-7xl">
            Phone gear worth
            <br />
            <span className="bg-gradient-to-r from-accent-ring via-white to-accent-ring bg-clip-text text-transparent">
              actually owning.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg">
            {shop.tagline} Compare specs and prices, then message us to buy — no account, no
            checkout.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/products" className="btn-accent">
              Browse products
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
            <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="btn-invert">
              <Icon name="whatsapp" className="h-4 w-4" />
              Ask on WhatsApp
            </a>
          </div>

          <dl className="mt-12 flex flex-wrap gap-x-12 gap-y-5">
            {stats.map((stat) => (
              // Reversed so the number reads above its label without repeating
              // the label in a visually-hidden <dt> for screen readers.
              <div key={stat.label} className="flex flex-col-reverse">
                <dt className="mt-1 text-sm text-white/45">{stat.label}</dt>
                <dd className="display text-3xl tabular-nums text-white">
                  {/* Dash rather than 0 while loading: a real "0 products" and
                      an unloaded count must not look the same. */}
                  {stat.value ?? '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {shelf.length > 0 ? (
          <div className="edge-fade relative mt-14 overflow-hidden pb-16 sm:mt-16">
            <ul className="flex w-max gap-4 animate-marquee hover:[animation-play-state:paused]">
              {/* Duplicated so the -50% translate loops seamlessly. The copy is
                  hidden from screen readers, which would otherwise read every
                  product twice. */}
              {[...shelf, ...shelf].map((product, index) => (
                <li
                  key={`${product.id}-${index}`}
                  aria-hidden={index >= shelf.length ? 'true' : undefined}
                >
                  <Link
                    href={`/products/${product.slug ?? product.id}`}
                    tabIndex={index >= shelf.length ? -1 : undefined}
                    className="group flex w-44 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur transition-colors hover:border-white/25 sm:w-52"
                  >
                    <div className="aspect-square bg-white">
                      <ProductImage
                        src={product.image}
                        alt={product.name}
                        category={product.category}
                        // The front of the strip is above the fold and is
                        // usually the largest paint on the page, so it must
                        // not wait on an intersection callback.
                        priority={index < 6}
                        sizes="208px"
                        className="h-full w-full p-3 transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-3">
                      <p className="truncate text-xs text-white/50">{product.brand}</p>
                      <p className="mt-1 truncate text-sm font-medium text-white">
                        {product.name}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="h-16" />
        )}
      </div>
    </section>
  );
}
