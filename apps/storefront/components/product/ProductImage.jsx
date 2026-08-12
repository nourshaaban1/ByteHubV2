'use client';

import { useState } from 'react';
import clsx from 'clsx';
import Icon from '../ui/Icon.jsx';

/**
 * A product photo, or a category-tinted placeholder when there isn't one.
 *
 * Most of the imported catalog has no photo yet — the images are linked from
 * folders by a separate matching step, and it only reaches products it can
 * match confidently. A grid of identical grey boxes reads as broken, so the
 * placeholder picks up the product's category glyph and tint. It looks
 * deliberate, and the categories stay visually distinguishable while the shop
 * fills the gaps in.
 *
 * Plain <img> rather than next/image: these are proxied through a rewrite from
 * the backend's static mount, and the optimiser adds a round trip and a config
 * surface for no benefit on already-sized catalog photos.
 */
const CATEGORY_STYLE = {
  Chargers: { icon: 'bolt', tint: 'from-amber-50 to-orange-100/60 text-amber-500' },
  Cables: { icon: 'cable', tint: 'from-sky-50 to-blue-100/60 text-sky-500' },
  'Power Banks': { icon: 'battery', tint: 'from-emerald-50 to-teal-100/60 text-emerald-500' },
  Audio: { icon: 'audio', tint: 'from-violet-50 to-purple-100/60 text-violet-500' },
};

const DEFAULT_STYLE = { icon: 'box', tint: 'from-slate-50 to-slate-100 text-slate-400' };

export default function ProductImage({ src, alt, category, className, sizes = '100vw', priority }) {
  // A linked file can go missing on disk; falling back keeps the card intact
  // instead of rendering a broken-image glyph.
  const [failed, setFailed] = useState(false);
  const style = CATEGORY_STYLE[category] ?? DEFAULT_STYLE;

  if (!src || failed) {
    return (
      <div
        className={clsx(
          'flex items-center justify-center bg-gradient-to-br',
          style.tint,
          className,
        )}
        role="img"
        aria-label={`${alt} — no photo available`}
      >
        <Icon name={style.icon} className="h-1/4 w-1/4 opacity-70" strokeWidth={1.25} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      sizes={sizes}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={clsx('bg-white object-contain', className)}
    />
  );
}
