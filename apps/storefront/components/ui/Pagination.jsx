'use client';

import clsx from 'clsx';
import Icon from './Icon.jsx';

/** Page numbers around the current one, with ellipses instead of 40 buttons. */
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);

  const output = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) output.push('…');
    output.push(page);
    previous = page;
  }
  return output;
}

export default function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;

  const go = (next) => onChange(Math.min(pages, Math.max(1, next)));

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className="chip disabled:pointer-events-none disabled:opacity-40"
        aria-label="Previous page"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
      </button>

      {pageWindow(page, pages).map((entry, index) =>
        entry === '…' ? (
          <span key={`gap-${index}`} className="px-1.5 text-sm text-ink-faint">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => go(entry)}
            aria-current={entry === page ? 'page' : undefined}
            className={clsx('chip min-w-[2.5rem] justify-center', entry === page && 'chip-active')}
          >
            {entry}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page >= pages}
        className="chip disabled:pointer-events-none disabled:opacity-40"
        aria-label="Next page"
      >
        <Icon name="chevronRight" className="h-4 w-4" />
      </button>
    </nav>
  );
}
