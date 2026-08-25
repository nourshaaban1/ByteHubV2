'use client';

import clsx from 'clsx';
import { Skeleton } from './primitives.jsx';

/**
 * A dense data table for a back-office. Horizontal overflow is contained
 * inside the wrapper so the page body never scrolls sideways.
 */
export function Table({ children, className }) {
  return (
    <div className="table-scroll">
      <table className={clsx('w-full border-collapse text-left text-xs', className)}>{children}</table>
    </div>
  );
}

export function THead({ children }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface-sunken/95 backdrop-blur">
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

export function TH({ children, align = 'left', sortable, sorted, onSort, className, width }) {
  const Cell = sortable ? 'button' : 'div';
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={clsx(
        'whitespace-nowrap px-3 py-2 font-medium text-ink-muted',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      <Cell
        {...(sortable ? { type: 'button', onClick: onSort } : {})}
        className={clsx(
          'inline-flex items-center gap-1',
          align === 'right' && 'flex-row-reverse',
          sortable && 'cursor-pointer hover:text-ink',
        )}
      >
        {children}
        {sortable && (
          <span aria-hidden className={clsx('text-2xs', sorted ? 'text-brand' : 'text-ink-faint/60')}>
            {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}
          </span>
        )}
      </Cell>
    </th>
  );
}

export function TBody({ children }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({ children, onClick, selected, className, ...props }) {
  return (
    <tr
      onClick={onClick}
      className={clsx(
        'transition-colors',
        onClick && 'cursor-pointer',
        selected ? 'bg-brand-soft' : 'hover:bg-surface-hover',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TD({ children, align = 'left', className, numeric, ...props }) {
  return (
    <td
      className={clsx(
        'px-3 py-2 align-middle text-ink',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        numeric && 'tnum',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function TableSkeleton({ rows = 8, columns = 6 }) {
  return (
    <Table>
      <TBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <tr key={rowIndex} className="border-b border-line">
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <td key={columnIndex} className="px-3 py-2.5">
                <Skeleton className={clsx('h-3', columnIndex === 0 ? 'w-48' : 'w-16')} />
              </td>
            ))}
          </tr>
        ))}
      </TBody>
    </Table>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null;

  const { page, pages, total, limit } = meta;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs">
      <p className="text-ink-muted tnum">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!meta.hasPrev}
          onClick={() => onPage(page - 1)}
          className="rounded px-2 py-1 text-ink-muted hover:bg-surface-hover hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Previous
        </button>
        <span className="px-2 text-ink-muted tnum">
          {page} / {pages}
        </span>
        <button
          type="button"
          disabled={!meta.hasNext}
          onClick={() => onPage(page + 1)}
          className="rounded px-2 py-1 text-ink-muted hover:bg-surface-hover hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Next
        </button>
      </div>
    </div>
  );
}
