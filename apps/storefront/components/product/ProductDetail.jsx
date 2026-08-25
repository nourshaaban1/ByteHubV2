import Link from 'next/link';
import { formatPrice, dirFor } from '../../lib/format.js';
import { toSpecRows, toHighlights } from '../../lib/specs.js';
import { whatsappLink, shop } from '../../lib/shop.js';
import Gallery from './Gallery.jsx';
import ProductGrid from './ProductGrid.jsx';
import Icon from '../ui/Icon.jsx';

function Breadcrumbs({ product }) {
  const trail = [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products' },
    product.category
      ? {
          label: product.category,
          href: `/products?category=${encodeURIComponent(product.category)}`,
        }
      : null,
  ].filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
      {trail.map((crumb, index) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          {index > 0 ? <Icon name="chevronRight" className="h-3.5 w-3.5 text-ink-faint" /> : null}
          <Link href={crumb.href} className="text-ink-muted hover:text-ink">
            {crumb.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

/**
 * Products from the same category, fetched on the server by the page.
 *
 * Server-rendered rather than client-fetched: these are internal links, and a
 * link only helps discovery if a crawler sees it in the HTML.
 */
function RelatedProducts({ product, related = [] }) {
  if (related.length === 0) return null;

  return (
    <section className="mt-16 border-t border-line pt-10">
      <h2 className="section-title">More in {product.category}</h2>
      <div className="mt-6">
        <ProductGrid products={related} />
      </div>
    </section>
  );
}

export default function ProductDetail({ product, related = [] }) {
  const price = formatPrice(product.price);
  const highlights = toHighlights(product.specs);
  const specRows = toSpecRows(product.specs);
  const features = product.specs?.features ?? [];

  return (
    <div className="container-page py-6 sm:py-8">
      <Breadcrumbs product={product} />

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <Gallery images={product.images} name={product.name} category={product.category} />

        <div>
          {product.brand ? (
            <Link
              href={`/products?brand=${encodeURIComponent(product.brand)}`}
              className="eyebrow transition-colors hover:text-accent"
            >
              {product.brand}
            </Link>
          ) : null}

          <h1
            dir={dirFor(product.name)}
            className="display mt-2 text-3xl leading-[1.1] text-ink sm:text-4xl"
          >
            {product.name}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-faint">
            {product.sku ? <span>SKU {product.sku}</span> : null}
            {product.subcategory ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{product.subcategory}</span>
              </>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-baseline gap-3">
            {price ? (
              <>
                <span className="display text-4xl tabular-nums text-ink">{price}</span>
                {product.price?.is_estimated ? (
                  <span className="rounded-full bg-flag/10 px-2.5 py-1 text-xs font-medium text-flag">
                    approximate — confirm before buying
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-xl font-medium text-ink-muted">Price on request</span>
            )}
          </div>

          <div className="mt-2 flex items-center gap-1.5 text-sm">
            <Icon
              name={product.availability?.in_stock ? 'check' : 'alert'}
              className={`h-4 w-4 ${product.availability?.in_stock ? 'text-emerald-600' : 'text-amber-500'}`}
            />
            <span className={product.availability?.in_stock ? 'text-emerald-700' : 'text-ink-muted'}>
              {product.availability?.in_stock ? 'In stock' : 'Ask us about availability'}
            </span>
          </div>

          {product.description?.short ? (
            <p
              dir={dirFor(product.description.short)}
              className="mt-6 text-[15px] leading-relaxed text-ink-muted"
            >
              {product.description.short}
            </p>
          ) : null}

          {highlights.length > 0 ? (
            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {highlights.map((row) => (
                <div key={row.label} className="rounded-xl border border-line bg-canvas px-3.5 py-3">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{row.label}</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium text-ink" title={row.value}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
            <a
              href={whatsappLink(product)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-accent flex-1 py-3"
            >
              <Icon name="whatsapp" className="h-4 w-4" />
              Contact to buy
            </a>
            <a href={`tel:${shop.phone.replace(/\s/g, '')}`} className="btn-ghost flex-1 py-3">
              <Icon name="phone" className="h-4 w-4" />
              Call the shop
            </a>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            ByteHub sells in person — there is no online checkout. Message us and we&apos;ll confirm
            stock, hold the item and arrange pickup.
          </p>
        </div>
      </div>

      {specRows.length > 0 || features.length > 0 || product.description?.long ? (
        <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:gap-14">
          {specRows.length > 0 ? (
            <section>
              <h2 className="display text-xl text-ink">Specifications</h2>
              <dl className="mt-4 divide-y divide-line border-y border-line">
                {specRows.map((row) => (
                  <div key={row.label} className="flex gap-4 py-3">
                    <dt className="w-40 shrink-0 text-sm text-ink-faint">{row.label}</dt>
                    <dd className="text-sm text-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {features.length > 0 || product.description?.long ? (
            <section>
              <h2 className="display text-xl text-ink">Details</h2>

              {product.description?.long ? (
                <p
                  dir={dirFor(product.description.long)}
                  className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-muted"
                >
                  {product.description.long}
                </p>
              ) : null}

              {features.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {features.map((feature) => (
                    <li key={feature} className="flex gap-2.5 text-sm text-ink-muted">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      {feature}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      <RelatedProducts product={product} related={related} />
    </div>
  );
}
