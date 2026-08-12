'use client';

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line, Legend,
} from 'recharts';
import {
  Card, CardHeader, CardBody, PageHeader, Select, Skeleton, ErrorState, EmptyState, Badge,
} from '../../components/ui/primitives.jsx';
import { Table, THead, TH, TBody, TR, TD } from '../../components/ui/Table.jsx';
import {
  useInventoryValue, useMarginBands, useQualityOverview, useSuppliers, useDashboard,
} from '../../lib/hooks.js';
import { formatMoney, formatPercent, formatNumber, truncate } from '../../lib/format.js';
import { bandOf } from '../../lib/domain.js';

/** Reads a CSS variable so charts follow the same palette as the rest of the UI. */
const cssColor = (name) =>
  typeof window === 'undefined'
    ? '#888'
    : `rgb(${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()})`;

const AXIS = { fontSize: 11, fill: 'rgb(var(--ink-faint))' };

function ChartTooltip({ active, payload, label, currency, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface-raised px-2.5 py-2 shadow-pop">
      <p className="mb-1 text-2xs font-medium text-ink">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-2xs text-ink-muted">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
          {entry.name}:{' '}
          <span className="tnum text-ink">
            {formatter ? formatter(entry.value, entry.dataKey) : formatNumber(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [groupBy, setGroupBy] = useState('category');

  const inventory = useInventoryValue(groupBy);
  const bands = useMarginBands();
  const quality = useQualityOverview();
  const suppliers = useSuppliers();
  const dashboard = useDashboard();

  const currency = inventory.data?.currency ?? 'EGP';
  const money = (value) => formatMoney(value, currency, { compact: true });

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Every monetary figure is normalised into one reporting currency by the backend. Products whose currency is unknown are excluded rather than assumed."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Inventory value by dimension */}
        <Card>
          <CardHeader
            title="Inventory value"
            subtitle={`Cost vs retail, in ${currency}`}
            action={
              <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} aria-label="Group by">
                <option value="category">By category</option>
                <option value="subcategory">By subcategory</option>
                <option value="brand">By brand</option>
                <option value="supplier">By supplier</option>
                <option value="procurement">By basket</option>
                <option value="source">By source catalog</option>
                <option value="currency">By source currency</option>
              </Select>
            }
          />
          <CardBody>
            {inventory.isLoading ? (
              <Skeleton className="h-64" />
            ) : inventory.isError ? (
              <ErrorState error={inventory.error} onRetry={inventory.refetch} />
            ) : (
              <InventoryChart groups={inventory.data?.groups ?? []} currency={currency} money={money} />
            )}
          </CardBody>
        </Card>

        {/* Margin distribution */}
        <Card>
          <CardHeader title="Margin distribution" subtitle="Products per band, with capital exposed" />
          <CardBody>
            {bands.isLoading ? <Skeleton className="h-64" /> : <MarginChart bands={bands.data?.bands ?? []} money={money} />}
          </CardBody>
        </Card>

        {/* Quality distribution */}
        <Card>
          <CardHeader
            title="Data quality distribution"
            subtitle={`Publishable at ${quality.data?.min_publishable ?? 70}/100`}
          />
          <CardBody>
            {quality.isLoading ? <Skeleton className="h-64" /> : <QualityChart overview={quality.data} />}
          </CardBody>
        </Card>

        {/* Supplier comparison */}
        <Card>
          <CardHeader title="Suppliers" subtitle="Planned spend and the margin each supplier returns" />
          {suppliers.isLoading ? (
            <CardBody><Skeleton className="h-64" /></CardBody>
          ) : (
            <SupplierTable suppliers={suppliers.data?.suppliers ?? []} currency={currency} />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Most profitable products" subtitle="Unit margin × stock on hand" />
        {dashboard.isLoading ? (
          <CardBody><Skeleton className="h-64" /></CardBody>
        ) : (
          <ProfitChart rows={dashboard.data?.top_profitable ?? []} money={money} />
        )}
      </Card>
    </>
  );
}

/* --------------------------------- charts -------------------------------- */

function InventoryChart({ groups, currency, money }) {
  if (groups.length === 0) return <EmptyState title="No inventory value" description="No products carry both a cost and a quantity." />;

  const data = groups
    .filter((group) => group.cost_value > 0 || group.retail_value > 0)
    .slice(0, 12)
    .map((group) => ({
      name: truncate(group.key, 18),
      full: group.key,
      cost: group.cost_value,
      retail: group.retail_value,
      margin: group.average_margin_percentage,
    }));

  if (data.length === 0) {
    return (
      <EmptyState
        title="No priced stock in this view"
        description="These groups have products but no cost × quantity to value."
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" vertical={false} />
        <XAxis dataKey="name" tick={AXIS} interval={0} angle={-30} textAnchor="end" height={60} />
        <YAxis tick={AXIS} tickFormatter={money} width={60} />
        <YAxis yAxisId="right" orientation="right" tick={AXIS} tickFormatter={(v) => `${v}%`} width={40} />
        <Tooltip
          content={<ChartTooltip currency={currency} formatter={(value, key) => (key === 'margin' ? formatPercent(value) : formatMoney(value, currency))} />}
          cursor={{ fill: 'rgb(var(--surface-hover))' }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="cost" name="Cost value" fill={cssColor('brand')} radius={[3, 3, 0, 0]} />
        <Bar dataKey="retail" name="Retail value" fill={cssColor('target')} radius={[3, 3, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="margin" name="Avg margin" stroke={cssColor('warn')} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function MarginChart({ bands, money }) {
  if (bands.length === 0) return <EmptyState title="No margin data" description="No product has both a cost and a selling price." />;

  const data = bands.map((band) => ({
    name: bandOf(band.band).label,
    products: band.products,
    exposure: band.capital_at_risk,
    tone: bandOf(band.band).tone,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" vertical={false} />
        <XAxis dataKey="name" tick={AXIS} />
        <YAxis tick={AXIS} width={40} />
        <Tooltip
          content={<ChartTooltip formatter={(value, key) => (key === 'exposure' ? money(value) : formatNumber(value))} />}
          cursor={{ fill: 'rgb(var(--surface-hover))' }}
        />
        <Bar dataKey="products" name="Products" radius={[3, 3, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={cssColor(entry.tone)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function QualityChart({ overview }) {
  const distribution = overview?.score_distribution ?? [];
  if (distribution.length === 0) return <EmptyState title="Nothing scored yet" />;

  const tones = { 'F (0-39)': 'loss', 'D (40-59)': 'critical', 'C (60-74)': 'warn', 'B (75-89)': 'healthy', 'A (90-100)': 'target' };
  const data = distribution.map((bucket) => ({ name: bucket.band, value: bucket.count, tone: tones[bucket.band] ?? 'unknown' }));

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={index} fill={cssColor(entry.tone)} stroke="rgb(var(--surface-raised))" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <ul className="w-full shrink-0 space-y-1.5 sm:w-40">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between text-2xs">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span className="h-2 w-2 rounded-sm" style={{ background: cssColor(entry.tone) }} />
              {entry.name}
            </span>
            <span className="tnum text-ink">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SupplierTable({ suppliers, currency }) {
  if (suppliers.length === 0) return <EmptyState title="No suppliers recorded" />;

  return (
    <Table>
      <THead>
        <TH>Supplier</TH>
        <TH align="right">Products</TH>
        <TH align="right">Planned spend</TH>
        <TH align="right">Avg margin</TH>
        <TH align="right">Avg quality</TH>
        <TH align="center">Verdict</TH>
      </THead>
      <TBody>
        {suppliers.slice(0, 12).map((supplier) => (
          <TR key={supplier.supplier}>
            <TD className="font-medium">{truncate(supplier.supplier, 28)}</TD>
            <TD align="right" numeric>{formatNumber(supplier.products)}</TD>
            <TD align="right" numeric>{formatMoney(supplier.planned_spend, currency)}</TD>
            <TD align="right" numeric>{formatPercent(supplier.average_margin_percentage)}</TD>
            <TD align="right" numeric>{supplier.average_quality_score ?? '—'}</TD>
            <TD align="center">
              <span className="inline-flex gap-1">
                {supplier.must_buy > 0 && <Badge tone="target" size="xs">{supplier.must_buy} buy</Badge>}
                {supplier.avoid > 0 && <Badge tone="loss" size="xs">{supplier.avoid} avoid</Badge>}
              </span>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function ProfitChart({ rows, money }) {
  if (rows.length === 0) return <CardBody><EmptyState title="No profitable products yet" description="Products need both a cost and stock on hand." /></CardBody>;

  const data = rows.slice(0, 10).map((row) => ({
    name: truncate(row.name, 26),
    profit: row.total_profit,
    unit: row.unit_profit,
  }));

  return (
    <CardBody>
      <ResponsiveContainer width="100%" height={Math.max(240, data.length * 30)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" horizontal={false} />
          <XAxis type="number" tick={AXIS} tickFormatter={money} />
          <YAxis type="category" dataKey="name" tick={{ ...AXIS, fontSize: 10 }} width={170} />
          <Tooltip content={<ChartTooltip formatter={money} />} cursor={{ fill: 'rgb(var(--surface-hover))' }} />
          <Bar dataKey="profit" name="Total profit" fill={cssColor('target')} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </CardBody>
  );
}
