'use client';

import clsx from 'clsx';
import { Badge } from '../ui/primitives.jsx';
import { bandOf, severityOf, gradeFor, PROCUREMENT, LIFECYCLE } from '../../lib/domain.js';
import { formatPercent, formatMoney, humanizeCode, EM_DASH } from '../../lib/format.js';

/**
 * Margin display.
 *
 * Shows the cost basis as the headline (the ByteHub spec's definition) with
 * the revenue basis alongside, because the procurement workbooks quote the
 * latter and conflating them makes a thin margin look healthy. Both come from
 * the backend; nothing is recomputed here.
 */
export function MarginCell({ pricing, showBoth = true }) {
  const band = bandOf(pricing?.margin_band);
  const cost = pricing?.margin_percentage;
  const revenue = pricing?.gross_margin_percentage;

  if (cost === null || cost === undefined) {
    return (
      <span className="text-ink-faint" title="Not enough price data to compute a margin">
        {EM_DASH}
      </span>
    );
  }

  return (
    <span className="inline-flex items-baseline gap-1.5 tnum" title={band.description}>
      <span className={clsx('font-medium', `text-${band.tone}`)} style={{ color: `rgb(var(--${band.tone}))` }}>
        {formatPercent(cost)}
      </span>
      {showBoth && revenue !== null && revenue !== undefined && (
        <span className="text-2xs text-ink-faint" title="Margin on revenue (procurement workbook basis)">
          / {formatPercent(revenue)}
        </span>
      )}
    </span>
  );
}

export function MarginBandBadge({ band, size = 'sm' }) {
  const meta = bandOf(band);
  return (
    <Badge tone={meta.tone} size={size} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

/** Quality score with its letter grade. Reads as a work queue, not a KPI. */
export function QualityScore({ score, showBar = true, className }) {
  const grade = gradeFor(score);
  const value = score ?? 0;

  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <span
        className="w-8 text-right text-xs font-medium tnum"
        style={{ color: `rgb(var(--${grade.tone}))` }}
      >
        {score === null || score === undefined ? EM_DASH : Math.round(score)}
      </span>
      {showBar && (
        <span className="h-1 w-12 overflow-hidden rounded-full bg-surface-hover" aria-hidden>
          <span
            className="block h-full rounded-full transition-all"
            style={{ width: `${Math.max(2, value)}%`, backgroundColor: `rgb(var(--${grade.tone}))` }}
          />
        </span>
      )}
      <span className="text-2xs text-ink-faint">{grade.letter}</span>
    </span>
  );
}

export function VerificationBadge({ status: raw }) {
  const status = raw ?? {};
  if (status?.is_verified) {
    return (
      <Badge tone="healthy" size="xs" title={`Verified ${status.verified_at ?? ''}`}>
        Verified
      </Badge>
    );
  }
  if (status?.is_draft) return <Badge tone="warn" size="xs">Draft</Badge>;
  if (status?.is_generic) return <Badge tone="unknown" size="xs">Generic</Badge>;
  if (!status?.is_active) return <Badge tone="neutral" size="xs">Archived</Badge>;
  return <Badge tone="neutral" size="xs">Unverified</Badge>;
}

export function ProcurementBadge({ value, size = 'xs' }) {
  const meta = PROCUREMENT[value] ?? PROCUREMENT.unclassified;
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}

export function LifecycleBadge({ value }) {
  return (
    <Badge tone="neutral" size="xs">
      {LIFECYCLE[value] ?? value}
    </Badge>
  );
}

/** Compact issue chips, worst severity first. */
export function IssueChips({ issues, limit = 3, onSelect }) {
  // A default parameter only covers `undefined`; the API can legitimately
  // send null here, and a crashed table is worse than a missing chip.
  const list = Array.isArray(issues) ? issues : [];

  if (list.length === 0) {
    return <span className="text-2xs text-ink-faint">Clean</span>;
  }

  const sorted = [...list].sort(
    (a, b) => severityOf(a.severity).rank - severityOf(b.severity).rank,
  );
  const shown = sorted.slice(0, limit);
  const rest = sorted.length - shown.length;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((issue) => (
        <Badge
          key={issue.code}
          tone={severityOf(issue.severity).tone}
          size="xs"
          title={issue.message ?? issue.code}
          className={onSelect ? 'cursor-pointer' : undefined}
        >
          <span onClick={onSelect ? () => onSelect(issue) : undefined}>{humanizeCode(issue.code)}</span>
        </Badge>
      ))}
      {rest > 0 && (
        <span className="text-2xs text-ink-faint" title={sorted.slice(limit).map((i) => i.code).join(', ')}>
          +{rest}
        </span>
      )}
    </span>
  );
}

/**
 * Currency-aware price. An unknown currency is shown as such rather than
 * silently assumed — the backend returns null for unconvertible values and
 * that distinction has to survive to the operator.
 */
export function PriceCell({ value, currency, muted }) {
  if (value === null || value === undefined) {
    return <span className="text-ink-faint">{EM_DASH}</span>;
  }
  return (
    <span className={clsx('tnum', muted && 'text-ink-muted')}>
      {formatMoney(value, currency)}
      {!currency && (
        <span className="ml-1 text-2xs text-warn" title="Currency unknown — this price is not comparable">
          ?
        </span>
      )}
    </span>
  );
}

/** Marks a field an admin has edited, which imports must not overwrite. */
export function LockBadge({ locked, className }) {
  if (!locked) return null;
  return (
    <span
      className={clsx('text-2xs text-brand', className)}
      title="Manually edited — the next import will not overwrite this field"
    >
      🔒
    </span>
  );
}
