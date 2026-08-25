'use client';

import { useState } from 'react';
import NextImage from 'next/image';
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
 * Served through next/image. The catalog photos are unprocessed source files —
 * several are over 1 MB and none are sized for a phone — so the optimiser
 * re-encodes them to AVIF/WebP at the width actually requested. On the mobile
 * connections this shop's customers are on, that is the difference between a
 * grid that loads and one that does not.
 *
 * Sized by CSS rather than by `fill`. Every call site passes padding along with
 * its dimensions, and an absolutely-positioned `fill` image covers the padding
 * box — it would have quietly removed the inset that keeps product photos off
 * the edge of their card. The width/height below are an aspect-ratio hint only;
 * `sizes` is what drives which resized file the browser actually downloads.
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
    <span className={clsx('block overflow-hidden bg-white', className)}>
      <NextImage
        src={src}
        alt={alt}
        width={800}
        height={800}
        sizes={sizes}
        priority={priority}
        // A linked file can vanish from disk; the placeholder above is a far
        // better outcome than a broken-image glyph in a product grid.
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
