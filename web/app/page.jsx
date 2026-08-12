'use client';

import Link from 'next/link';
import { useDashboard, useQualityOverview } from '../lib/hooks.js';
import { Card, CardHeader, CardBody, Button, Skeleton, ErrorState, PageHeader, Badge } from '../components/ui/primitives.jsx';
import { Table, THead, TH, TBody, TR, TD } from '../components/ui/Table.jsx';
import { MarginCell, MarginBandBadge, QualityScore, PriceCell, ProcurementBadge } from '../components/domain/indicators.jsx';
import { formatMoney, formatPercent, formatNumber, EM_DASH, dirFor, truncate } from '../lib/format.js';
import { bandOf } from '../lib/domain.js';

/* ------------------------------- stat tiles ------------------------------ */

function Stat({ label, value, sub, tone, href, hint }) {
  const body = (
    <div className="flex h-full flex-col justify-between gap-2 p-4">
      <p className="text-xs font-medium text-ink-muted" title={hint}>
        {label}
      </p>
      <div>
        <p
          className="text-xl font-semibold tracking-tight tnum"
          style={tone ? { color: `rgb(var(--${tone}))` } : undefined}
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-2xs text-ink-faint">{sub}</p>}
      </div>
    </div>
  );

  return (
    <Card className={href ? 'transition-colors hover:border-line-strong hover:bg-surface-hover' : undefined}>
      {href ? <Link href={href} className="block h-full">{body}</Link> : body}
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <div className="space-y-3 p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-2 w-20" />
      </div>
    </Card>
  );
}

/* --------------------------------- page ---------------------------------- */

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useDashboard();
  const quality = useQualityOverview();

  if (isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      </>
    );
  }

  const summary = data?.summary;
  const currency = summary?.currency ?? 'EGP';
  const lossMakers = (data?.low_margin_alerts ?? []).filter((p) => p.margin_band === 'loss');
  const qualityTotals = quality.data?.totals;
  const needsWork = qualityTotals ? qualityTotals.products - qualityTotals.publishable : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What the catalog is worth, what it earns, and what is blocking it from being sold."
        action={
          <Button variant="secondary" onClick={() => refetch()} loading={isLoading}>
            Refresh
          </Button>
        }
      />

      {/* Headline numbers */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <StatSkeleton key={index} />)
        ) : (
          <>
            <Stat
              label="Inventory value (at cost)"
              value={formatMoney(summary?.inventory_cost_value, currency, { compact: true })}
              sub={`${formatNumber(summary?.total_units)} units · retail ${formatMoney(summary?.inventory_retail_value, currency, { compact: true })}`}
              hint="Quantity × verified wholesale cost, converted to the reporting currency"
            />
            <Stat
              label="Potential gross profit"
              value={formatMoney(summary?.potential_gross_profit, currency, { compact: true })}
              sub="If current stock sold at listed prices"
              tone="target"
            />
            <Stat
              label="Average margin"
              value={formatPercent(summary?.average_margin_percentage)}
              sub={`${formatPercent(summary?.average_gross_margin_percentage)} on revenue basis`}
              hint="Headline is margin on cost, (selling − rdp) / rdp"
            />
            <Stat
              label="Needs work"
              value={needsWork === null ? EM_DASH : formatNumber(needsWork)}
              sub={`of ${formatNumber(qualityTotals?.products)} products below the publishable score`}
              tone={needsWork > 0 ? 'warn' : 'healthy'}
              href="/quality"
            />
          </>
        )}
      </section>

      {/* Loss makers get their own banner: they are the one thing that is
          actively costing money right now. */}
      {lossMakers.length > 0 && (
        <Card className="mt-4 border-loss/40 bg-loss/5">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-loss">
                {lossMakers.length} product{lossMakers.length === 1 ? '' : 's'} priced below cost
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Every unit sold loses money. Reprice or stop selling these first.
              </p>
            </div>
            <Link href="/pricing?band=loss">
              <Button variant="danger" size="sm">Review pricing</Button>
            </Link>
          </CardBody>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Procurement decision — the buy question */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Procurement baskets"
            subtitle="Committed spend recomputed from quantity × verified cost"
            action={<Link href="/analytics" className="text-xs text-brand hover:underline">Analytics</Link>}
          />
          {isLoading ? (
            <CardBody><Skeleton className="h-32" /></CardBody>
          ) : (
            <ProcurementTable data={data?.procurement} currency={currency} />
          )}
        </Card>

        {/* Quality distribution — the fix question */}
        <Card>
          <CardHeader
            title="Data quality"
            subtitle="A work queue, not a score to optimise"
            action={<Link href="/quality" className="text-xs text-brand hover:underline">Fix queue</Link>}
          />
          <CardBody>
            {quality.isLoading ? (
              <Skeleton className="h-32" />
            ) : (
              <QualityDistribution overview={quality.data} />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Top profitable products"
            subtitle="Unit margin × stock on hand"
            action={<Link href="/products?sort=-margin" className="text-xs text-brand hover:underline">All products</Link>}
          />
          {isLoading ? <CardBody><Skeleton className="h-40" /></CardBody> : <TopProfitable rows={data?.top_profitable} currency={currency} />}
        </Card>

        <Card>
          <CardHeader
            title="Low-margin alerts"
            subtitle="Ranked by capital tied up, not by percentage"
            action={<Link href="/pricing" className="text-xs text-brand hover:underline">Pricing</Link>}
          />
          {isLoading ? <CardBody><Skeleton className="h-40" /></CardBody> : <LowMarginAlerts rows={data?.low_margin_alerts} currency={currency} />}
        </Card>
      </div>
    </>
  );
}

/* ------------------------------ sub-sections ----------------------------- */

function ProcurementTable({ data, currency }) {
  const baskets = (data?.baskets ?? []).filter((b) => b.basket !== 'unclassified' || b.products > 0);

  if (baskets.length === 0) {
    return <CardBody><p className="text-xs text-ink-muted">No products classified yet.</p></CardBody>;
  }

  return (
    <>
      <Table>
        <THead>
          <TH>Basket</TH>
          <TH align="right">Products</TH>
          <TH align="right">Units</TH>
          <TH align="right">Cost</TH>
          <TH align="right">Expected profit</TH>
          <TH align="right">Avg margin</TH>
        </THead>
        <TBody>
          {baskets.map((basket) => (
            <TR key={basket.basket}>
              <TD><ProcurementBadge value={basket.basket} size="sm" /></TD>
              <TD align="right" numeric>{formatNumber(basket.products)}</TD>
              <TD align="right" numeric>{formatNumber(basket.units)}</TD>
              <TD align="right" numeric>{formatMoney(basket.basket_cost, currency)}</TD>
              <TD align="right" numeric className="text-target">
                {basket.expected_profit > 0 ? formatMoney(basket.expected_profit, currency) : EM_DASH}
              </TD>
              <TD align="right" numeric>{formatPercent(basket.average_margin_percentage)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {data?.committed_total && (
        <div className="flex items-center justify-between border-t border-line bg-surface-sunken px-4 py-2.5">
          <span className="text-xs font-medium text-ink">
            Committed ({data.committed_total.products} SKUs)
          </span>
          <span className="text-sm font-semibold tnum">
            {formatMoney(data.committed_total.basket_cost, currency)}
          </span>
        </div>
      )}
    </>
  );
}

function QualityDistribution({ overview }) {
  const distribution = overview?.score_distribution ?? [];
  const total = distribution.reduce((sum, bucket) => sum + bucket.count, 0);

  if (total === 0) return <p className="text-xs text-ink-muted">No products scored yet.</p>;

  const tones = { 'F (0-39)': 'loss', 'D (40-59)': 'critical', 'C (60-74)': 'warn', 'B (75-89)': 'healthy', 'A (90-100)': 'target' };
  const order = ['F (0-39)', 'D (40-59)', 'C (60-74)', 'B (75-89)', 'A (90-100)'];
  const byBand = Object.fromEntries(distribution.map((bucket) => [bucket.band, bucket.count]));

  return (
    <div className="space-y-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-hover" aria-hidden>
        {order.map((band) => {
          const count = byBand[band] ?? 0;
          if (count === 0) return null;
          return (
            <span
              key={band}
              title={`${band}: ${count}`}
              style={{ width: `${(count / total) * 100}%`, backgroundColor: `rgb(var(--${tones[band]}))` }}
            />
          );
        })}
      </div>

      <ul className="space-y-1.5">
        {order.map((band) => {
          const count = byBand[band] ?? 0;
          return (
            <li key={band} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-ink-muted">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: `rgb(var(--${tones[band]}))` }}
                  aria-hidden
                />
                {band}
              </span>
              <span className="tnum text-ink">{count}</span>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line pt-3 text-2xs text-ink-faint">
        <p>
          Average {overview?.totals?.average_score ?? EM_DASH}/100 · publishable at{' '}
          {overview?.min_publishable ?? 70}+
        </p>
        <p className="mt-1">
          Low scores reflect the source catalogs, which mostly lack cost and quantity — not a
          failure of the import.
        </p>
      </div>
    </div>
  );
}

function TopProfitable({ rows = [], currency }) {
  if (rows.length === 0) {
    return <CardBody><p className="text-xs text-ink-muted">No priced products with stock on hand.</p></CardBody>;
  }

  return (
    <Table>
      <THead>
        <TH>Product</TH>
        <TH align="right">Qty</TH>
        <TH align="right">Margin</TH>
        <TH align="right">Total profit</TH>
      </THead>
      <TBody>
        {rows.slice(0, 8).map((row) => (
          <TR key={row._id}>
            <TD>
              <Link href={`/products?search=${encodeURIComponent(row.sku ?? row.name)}`} className="hover:underline">
                <span dir={dirFor(row.name)} className="block max-w-[16rem] truncate font-medium">
                  {row.name}
                </span>
              </Link>
              <span className="text-2xs text-ink-faint">{row.sku}</span>
            </TD>
            <TD align="right" numeric>{formatNumber(row.quantity)}</TD>
            <TD align="right">
              <MarginCell pricing={{ margin_percentage: row.margin_percentage, gross_margin_percentage: row.gross_margin_percentage, margin_band: row.margin_band }} showBoth={false} />
            </TD>
            <TD align="right" numeric className="font-medium">{formatMoney(row.total_profit, currency)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function LowMarginAlerts({ rows = [], currency }) {
  if (rows.length === 0) {
    return (
      <CardBody>
        <p className="text-xs text-ink-muted">No products below the warning threshold.</p>
      </CardBody>
    );
  }

  return (
    <Table>
      <THead>
        <TH>Product</TH>
        <TH align="right">Margin</TH>
        <TH align="right">Capital at risk</TH>
      </THead>
      <TBody>
        {rows.slice(0, 8).map((row) => (
          <TR key={row._id}>
            <TD>
              <span dir={dirFor(row.name)} className="block max-w-[14rem] truncate font-medium">
                {truncate(row.name, 42)}
              </span>
              <span className="flex items-center gap-1.5 text-2xs text-ink-faint">
                {row.sku}
                <MarginBandBadge band={row.margin_band} size="xs" />
              </span>
            </TD>
            <TD align="right">
              <MarginCell pricing={{ margin_percentage: row.margin_percentage, margin_band: row.margin_band }} showBoth={false} />
            </TD>
            <TD align="right" numeric>{formatMoney(row.exposure, currency)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
