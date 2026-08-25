'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';
import { useQualityOverview, usePricingAlerts } from '../../lib/hooks.js';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '◧' },
  { href: '/products', label: 'Products', icon: '▤' },
  { href: '/quality', label: 'Fix queue', icon: '⚠', badge: 'quality' },
  { href: '/pricing', label: 'Pricing', icon: '％', badge: 'pricing' },
  { href: '/analytics', label: 'Analytics', icon: '◕' },
  { href: '/import', label: 'Import', icon: '⇪' },
  { href: '/images', label: 'Images', icon: '▩' },
];

function NavBadge({ kind }) {
  const quality = useQualityOverview();
  const alerts = usePricingAlerts({ limit: 200 });

  if (kind === 'quality') {
    const total = quality.data?.totals;
    if (!total) return null;
    // Products below the publishable threshold are the actual work queue.
    const count = total.products - total.publishable;
    if (count <= 0) return null;
    return <Count value={count} tone="warn" />;
  }

  if (kind === 'pricing') {
    const losses = (alerts.data ?? []).filter((p) => p.pricing?.margin_band === 'loss').length;
    if (losses <= 0) return null;
    return <Count value={losses} tone="loss" />;
  }

  return null;
}

const Count = ({ value, tone }) => (
  <span
    className="ml-auto rounded px-1.5 py-0.5 text-2xs font-medium tnum"
    style={{
      backgroundColor: `rgb(var(--${tone}) / 0.12)`,
      color: `rgb(var(--${tone}))`,
    }}
  >
    {value > 99 ? '99+' : value}
  </span>
);

function Nav({ onNavigate }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {NAV.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-brand-soft text-brand-ink'
                : 'text-ink-muted hover:bg-surface-hover hover:text-ink',
            )}
          >
            <span aria-hidden className="w-4 text-center text-sm opacity-70">
              {item.icon}
            </span>
            {item.label}
            {item.badge && <NavBadge kind={item.badge} />}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Shell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-line bg-surface-raised lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="flex items-center gap-2 px-4 py-4">
            <span className="grid h-7 w-7 place-items-center rounded bg-brand text-xs font-bold text-white">
              B
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-ink">ByteHub</p>
              <p className="text-2xs text-ink-faint">Catalog control</p>
            </div>
          </div>
          <Nav />
          <div className="mt-auto border-t border-line p-3">
            <HealthPill />
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative h-full w-60 border-r border-line bg-surface-raised">
            <div className="flex items-center justify-between px-4 py-4">
              <span className="text-sm font-semibold text-ink">ByteHub</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="text-ink-muted">
                ✕
              </button>
            </div>
            <Nav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface-base/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded p-1 text-ink-muted hover:bg-surface-hover"
          >
            ☰
          </button>
          <span className="text-sm font-semibold text-ink">ByteHub</span>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function HealthPill() {
  const quality = useQualityOverview();

  if (quality.isError) {
    return (
      <p className="text-2xs leading-relaxed text-loss">
        API unreachable. Start the backend with <code className="font-mono">npm start</code>.
      </p>
    );
  }

  const totals = quality.data?.totals;
  if (!totals) return <p className="text-2xs text-ink-faint">Connecting…</p>;

  return (
    <div className="text-2xs text-ink-faint">
      <p className="tnum">
        {totals.products.toLocaleString()} products · {totals.publishable} publishable
      </p>
      <p className="mt-0.5 tnum">avg quality {totals.average_score ?? '—'}/100</p>
    </div>
  );
}
