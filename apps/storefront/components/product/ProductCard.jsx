import Link from 'next/link';
import { formatPrice, dirFor } from '../../lib/format.js';
import ProductImage from './ProductImage.jsx';
import Icon from '../ui/Icon.jsx';

/**
 * One product tile.
 *
 * The whole card is a single link rather than a card containing a link, so the
 * tap target on a phone is the tile and not the 14px title inside it.
 */
export default function ProductCard({ product, priority }) {
  const price = formatPrice(product.price);

  return (
    <Link
      href={`/products/${product.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white
                 transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-lift"
    >
      <div className="relative aspect-square overflow-hidden bg-canvas">
        <ProductImage
          src={product.image}
          alt={product.name}
          category={product.category}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="h-full w-full p-5 transition-transform duration-500 group-hover:scale-[1.06]"
        />

        {!product.availability?.in_stock ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium text-ink-muted shadow-card backdrop-blur">
            Ask availability
          </span>
        ) : null}

        {/* Appears on hover as the affordance that the tile is clickable. */}
        <span
          aria-hidden="true"
          className="absolute bottom-3 right-3 flex h-9 w-9 translate-y-2 items-center justify-center
                     rounded-full bg-ink text-white opacity-0 shadow-lift transition-all duration-300
                     group-hover:translate-y-0 group-hover:opacity-100"
        >
          <Icon name="arrowRight" className="h-4 w-4" />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t border-line p-4">
        {product.brand ? <span className="eyebrow">{product.brand}</span> : null}

        <h3
          dir={dirFor(product.name)}
          className="line-clamp-2-safe text-sm font-medium leading-snug text-ink
                     transition-colors group-hover:text-accent"
        >
          {product.name}
        </h3>

        <div className="mt-auto pt-3">
          {price ? (
            <span className="display text-base tabular-nums text-ink">
              {price}
              {product.price?.is_estimated ? (
                <span className="ml-1.5 align-middle text-[11px] font-normal text-flag">
                  approx.
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-sm font-medium text-ink-muted">Price on request</span>
          )}
        </div>
      </div>
    </Link>
  );
}
