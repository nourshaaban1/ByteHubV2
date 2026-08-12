'use client';

import { useState } from 'react';
import clsx from 'clsx';
import ProductImage from './ProductImage.jsx';

/**
 * Product image gallery: one large view, thumbnails underneath.
 *
 * Thumbnails are only rendered when there is more than one photo — a single
 * thumbnail under its own enlargement is pure noise.
 */
export default function Gallery({ images = [], name, category }) {
  const [active, setActive] = useState(0);
  const current = images[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="card overflow-hidden">
        <ProductImage
          src={current?.url}
          alt={name}
          category={category}
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="aspect-square w-full p-6 sm:p-10"
        />
      </div>

      {images.length > 1 ? (
        <div
          className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label={`${name} images`}
        >
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={`Image ${index + 1} of ${images.length}`}
              onClick={() => setActive(index)}
              className={clsx(
                'h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-white transition-colors sm:h-20 sm:w-20',
                index === active
                  ? 'border-ink ring-1 ring-ink'
                  : 'border-line hover:border-ink-faint',
              )}
            >
              <ProductImage
                src={image.url}
                alt=""
                category={category}
                sizes="80px"
                className="h-full w-full p-1.5"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
