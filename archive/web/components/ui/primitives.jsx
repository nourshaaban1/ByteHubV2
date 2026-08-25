'use client';

import { forwardRef } from 'react';
import clsx from 'clsx';

/* --------------------------------- Button -------------------------------- */

const BUTTON_VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-ink disabled:bg-brand/50',
  secondary:
    'bg-surface-raised text-ink border border-line hover:bg-surface-hover disabled:text-ink-faint',
  ghost: 'text-ink-muted hover:bg-surface-hover hover:text-ink',
  danger: 'bg-loss text-white hover:opacity-90',
  subtle: 'bg-brand-soft text-brand-ink hover:bg-brand-soft/70',
};

const BUTTON_SIZES = {
  xs: 'h-7 px-2 text-2xs gap-1',
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'sm', className, loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-3 w-3" />}
      {children}
    </button>
  );
});

export function Spinner({ className }) {
  return (
    <svg className={clsx('animate-spin', className ?? 'h-4 w-4')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2Z" />
    </svg>
  );
}

/* ---------------------------------- Card --------------------------------- */

export function Card({ className, children, ...props }) {
  return (
    <div
      className={clsx('rounded-lg border border-line bg-surface-raised shadow-card', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export const CardBody = ({ className, children }) => (
  <div className={clsx('p-4', className)}>{children}</div>
);

/* --------------------------------- Badge --------------------------------- */

const TONE_CLASSES = {
  loss: 'bg-loss/10 text-loss ring-loss/25',
  critical: 'bg-critical/10 text-critical ring-critical/25',
  warn: 'bg-warn/10 text-warn ring-warn/25',
  healthy: 'bg-healthy/10 text-healthy ring-healthy/25',
  target: 'bg-target/10 text-target ring-target/25',
  unknown: 'bg-unknown/10 text-unknown ring-unknown/25',
  brand: 'bg-brand-soft text-brand-ink ring-brand/20',
  neutral: 'bg-surface-hover text-ink-muted ring-line',
};

export function Badge({ tone = 'neutral', size = 'sm', className, children, title }) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'xs' ? 'px-1.5 py-0.5 text-2xs' : 'px-2 py-0.5 text-xs',
        TONE_CLASSES[tone] ?? TONE_CLASSES.neutral,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = 'unknown', className }) {
  return (
    <span
      aria-hidden
      className={clsx('inline-block h-1.5 w-1.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: `rgb(var(--${tone === 'brand' ? 'brand' : tone}))` }}
    />
  );
}

/* --------------------------------- Inputs -------------------------------- */

const FIELD_BASE =
  'w-full rounded-md border bg-surface-base text-ink placeholder:text-ink-faint ' +
  'transition-colors disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-faint';

export const Input = forwardRef(function Input({ className, invalid, size = 'sm', ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(
        FIELD_BASE,
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
        invalid ? 'border-loss focus:border-loss' : 'border-line focus:border-brand',
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ className, size = 'sm', children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={clsx(
        FIELD_BASE,
        'appearance-none bg-no-repeat pr-7',
        size === 'sm' ? 'h-8 pl-2.5 text-xs' : 'h-9 pl-3 text-sm',
        'border-line focus:border-brand',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M3 4.5 6 8l3-3.5z'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 0.5rem center',
        backgroundSize: '12px',
      }}
      {...props}
    >
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1 block text-2xs text-loss">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-2xs text-ink-faint">{hint}</span>
      )}
    </label>
  );
}

export function Checkbox({ className, ...props }) {
  return (
    <input
      type="checkbox"
      className={clsx(
        'h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-line text-brand',
        'focus:ring-1 focus:ring-brand focus:ring-offset-0',
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------- Feedback ------------------------------- */

export function EmptyState({ title, description, action, icon }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-faint">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-sm font-medium text-loss">{error?.message ?? 'Something went wrong'}</p>
      {error?.code && <p className="mt-1 font-mono text-2xs text-ink-faint">{error.code}</p>}
      {Array.isArray(error?.details) && error.details.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-2xs text-ink-muted">
          {error.details.slice(0, 5).map((detail, index) => (
            <li key={index}>
              <span className="font-mono">{detail.path}</span> — {detail.message}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={clsx('skeleton', className ?? 'h-4 w-full')} />;
}

/* ------------------------------- Structure ------------------------------- */

export function PageHeader({ title, description, action, children }) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-xs text-ink-muted">{description}</p>}
        {children}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function Tabs({ value, onChange, options }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-md bg-surface-sunken p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors',
            value === option.value
              ? 'bg-surface-raised text-ink shadow-card'
              : 'text-ink-muted hover:text-ink',
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className="ml-1.5 text-ink-faint tnum">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
