'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Card, CardHeader, CardBody, PageHeader, Button, Input, Select, Field,
  Badge, Skeleton, ErrorState, EmptyState, Tabs,
} from '../../components/ui/primitives.jsx';
import { Table, THead, TH, TBody, TR, TD, TableSkeleton } from '../../components/ui/Table.jsx';
import ProductDrawer from '../../components/domain/ProductDrawer.jsx';
import { MarginCell, MarginBandBadge, PriceCell } from '../../components/domain/indicators.jsx';
import {
  usePricingAlerts, usePricingPolicy, useLossMakers, useMarginBands, useRecalculatePricing,
} from '../../lib/hooks.js';
import api from '../../lib/api.js';
import { formatMoney, formatPercent, formatNumber, dirFor, EM_DASH } from '../../lib/format.js';
import { bandOf } from '../../lib/domain.js';

function PricingView() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('band') === 'loss' ? 'loss' : 'alerts');
  const [drawerId, setDrawerId] = useState(null);

  const policy = usePricingPolicy();
  const alerts = usePricingAlerts({ limit: 100 });
  const losses = useLossMakers({ limit: 100 });
  const bands = useMarginBands();
  const recalculate = useRecalculatePricing();

  const currency = policy.data?.base_currency ?? 'EGP';

  return (
    <>
      <PageHeader
        title="Pricing & margins"
        description="Both margin definitions are shown side by side: markup on cost, and share of revenue. Conflating them is how a thin margin looks healthy."
        action={
          <Button variant="secondary" loading={recalculate.isPending} onClick={() => recalculate.mutate()}>
            Recalculate
          </Button>
        }
      />

      {policy.data && (
        <Card className="mb-4">
          <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-xs">
            <Definition label="Margin on cost" formula="(selling − rdp) / rdp" note="headline" />
            <Definition label="Margin on revenue" formula="(selling − rdp) / selling" note="workbook basis" />
            <span className="ml-auto flex items-center gap-3 text-2xs text-ink-faint">
              <span>target {policy.data.thresholds.targetPct}%</span>
              <span>warn &lt;{policy.data.thresholds.warnPct}%</span>
              <span>critical &lt;{policy.data.thresholds.criticalPct}%</span>
              <span>1 USD = {policy.data.usd_to_egp_rate} EGP</span>
            </span>
          </CardBody>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Margin distribution" subtitle="Products and capital exposed per band" />
          {bands.isLoading ? (
            <CardBody><Skeleton className="h-40" /></CardBody>
          ) : (
            <MarginBandTable data={bands.data} currency={currency} />
          )}
        </Card>

        <Card>
          <CardHeader title="What-if calculator" subtitle="Computed by the API, not the browser" />
          <CardBody><QuoteCalculator /></CardBody>
        </Card>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'alerts', label: 'Margin alerts', count: alerts.data?.length },
          { value: 'loss', label: 'Selling below cost', count: losses.data?.length },
        ]}
      />

      <div className="mt-3">
        {tab === 'alerts' && (
          <Card>
            <CardHeader
              title="Low, critical and loss-making margins"
              subtitle="Ranked worst first, with the suggested price to reach the warning threshold"
            />
            {alerts.isError ? (
              <ErrorState error={alerts.error} onRetry={alerts.refetch} />
            ) : alerts.isLoading ? (
              <TableSkeleton rows={8} columns={6} />
            ) : (alerts.data ?? []).length === 0 ? (
              <EmptyState title="No margin alerts" description="Every priced product is above the warning threshold." />
            ) : (
              <Table>
                <THead>
                  <TH>Product</TH>
                  <TH align="right">Cost</TH>
                  <TH align="right">Price</TH>
                  <TH align="right">Margin</TH>
                  <TH align="right">Suggested</TH>
                  <TH align="right">Capital at risk</TH>
                </THead>
                <TBody>
                  {alerts.data.map((product) => (
                    <TR key={product._id} onClick={() => setDrawerId(product._id)}>
                      <TD>
                        <span dir={dirFor(product.name)} className="block max-w-[18rem] truncate font-medium">
                          {product.name}
                        </span>
                        <span className="flex items-center gap-1.5 font-mono text-2xs text-ink-faint">
                          {product.sku}
                          <MarginBandBadge band={product.pricing?.margin_band} size="xs" />
                        </span>
                      </TD>
                      <TD align="right"><PriceCell value={product.pricing?.rdp} currency={product.pricing?.currency} muted /></TD>
                      <TD align="right"><PriceCell value={product.pricing?.selling_price} currency={product.pricing?.currency} /></TD>
                      <TD align="right"><MarginCell pricing={product.pricing} /></TD>
                      <TD align="right" numeric className="text-brand">
                        {formatMoney(product.suggested_price, product.pricing?.currency)}
                      </TD>
                      <TD align="right" numeric>{formatMoney(product.exposure, currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        )}

        {tab === 'loss' && (
          <Card className="border-loss/30">
            <CardHeader
              title="Products selling below cost"
              subtitle="Every unit sold loses money. This is the sharpest failure mode in the catalog."
            />
            {losses.isLoading ? (
              <TableSkeleton rows={5} columns={5} />
            ) : (losses.data ?? []).length === 0 ? (
              <EmptyState title="Nothing sells below cost" description="No product has a selling price under its wholesale cost." />
            ) : (
              <Table>
                <THead>
                  <TH>Product</TH>
                  <TH align="right">Cost</TH>
                  <TH align="right">Price</TH>
                  <TH align="right">Loss per unit</TH>
                  <TH align="right">Total exposure</TH>
                </THead>
                <TBody>
                  {losses.data.map((product) => (
                    <TR key={product._id} onClick={() => setDrawerId(product._id)}>
                      <TD>
                        <span dir={dirFor(product.name)} className="block max-w-[18rem] truncate font-medium">
                          {product.name}
                        </span>
                        <span className="font-mono text-2xs text-ink-faint">{product.sku}</span>
                      </TD>
                      <TD align="right"><PriceCell value={product.pricing?.rdp} currency={product.pricing?.currency} muted /></TD>
                      <TD align="right"><PriceCell value={product.pricing?.selling_price} currency={product.pricing?.currency} /></TD>
                      <TD align="right" numeric className="font-medium text-loss">
                        −{formatMoney(product.loss_per_unit, product.pricing?.currency)}
                      </TD>
                      <TD align="right" numeric className="text-loss">
                        {product.total_exposure > 0 ? `−${formatMoney(product.total_exposure, currency)}` : EM_DASH}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        )}
      </div>

      <ProductDrawer productId={drawerId} onClose={() => setDrawerId(null)} />
    </>
  );
}

const Definition = ({ label, formula, note }) => (
  <span className="flex items-baseline gap-2">
    <span className="font-medium text-ink">{label}</span>
    <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-ink-muted">{formula}</code>
    <span className="text-2xs text-ink-faint">{note}</span>
  </span>
);

function MarginBandTable({ data, currency }) {
  const bands = data?.bands ?? [];
  if (bands.length === 0) {
    return <CardBody><p className="text-xs text-ink-muted">No priced products yet.</p></CardBody>;
  }

  const total = bands.reduce((sum, band) => sum + band.products, 0);

  return (
    <>
      <div className="flex h-2 overflow-hidden px-4 pt-4" aria-hidden>
        <div className="flex h-full w-full overflow-hidden rounded-full bg-surface-hover">
          {bands.map((band) => (
            <span
              key={band.band}
              title={`${band.band}: ${band.products}`}
              style={{
                width: `${(band.products / total) * 100}%`,
                backgroundColor: `rgb(var(--${bandOf(band.band).tone}))`,
              }}
            />
          ))}
        </div>
      </div>
      <Table>
        <THead>
          <TH>Band</TH>
          <TH align="right">Products</TH>
          <TH align="right">Avg margin</TH>
          <TH align="right">Capital at risk</TH>
        </THead>
        <TBody>
          {bands.map((band) => (
            <TR key={band.band}>
              <TD><MarginBandBadge band={band.band} /></TD>
              <TD align="right" numeric>{formatNumber(band.products)}</TD>
              <TD align="right" numeric>{formatPercent(band.average_margin_percentage)}</TD>
              <TD align="right" numeric>{formatMoney(band.capital_at_risk, currency)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}

/** Delegates the arithmetic to POST /pricing/quote — the UI never computes margin. */
function QuoteCalculator() {
  const [form, setForm] = useState({ rdp: '', selling_price: '', currency: 'EGP' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api.pricing.quote({
          rdp: Number(form.rdp),
          selling_price: Number(form.selling_price),
          currency: form.currency,
        }),
      );
    } catch (caught) {
      setError(caught);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const valid = form.rdp !== '' && form.selling_price !== '';

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cost">
          <Input type="number" min="0" step="0.01" value={form.rdp} onChange={set('rdp')} required />
        </Field>
        <Field label="Selling price">
          <Input type="number" min="0" step="0.01" value={form.selling_price} onChange={set('selling_price')} required />
        </Field>
      </div>
      <Field label="Currency">
        <Select value={form.currency} onChange={set('currency')}>
          <option value="EGP">EGP</option>
          <option value="USD">USD</option>
        </Select>
      </Field>

      <Button type="submit" variant="primary" className="w-full" disabled={!valid} loading={busy}>
        Calculate
      </Button>

      {error && <p className="text-2xs text-loss">{error.message}</p>}

      {result && (
        <dl className="space-y-1.5 border-t border-line pt-3 text-xs">
          <Line label="Margin on cost" value={formatPercent(result.margin_percentage)} strong />
          <Line label="Margin on revenue" value={formatPercent(result.gross_margin_percentage)} />
          <Line label="Profit per unit" value={formatMoney(result.margin_value, form.currency)} />
          <Line label="Break-even" value={formatMoney(result.break_even_price, form.currency)} />
          <Line
            label={`Price for ${result.target_margin_percentage}% target`}
            value={formatMoney(result.price_for_target_margin, form.currency)}
          />
          <div className="pt-1"><MarginBandBadge band={result.margin_band} /></div>

          {result.alerts?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.alerts.map((alert, index) => (
                <li key={index} className="text-2xs text-warn">{alert.code.replace(/_/g, ' ').toLowerCase()}</li>
              ))}
            </ul>
          )}
        </dl>
      )}
    </form>
  );
}

const Line = ({ label, value, strong }) => (
  <div className="flex justify-between gap-2">
    <dt className="text-ink-muted">{label}</dt>
    <dd className={strong ? 'font-semibold tnum text-ink' : 'tnum text-ink'}>{value}</dd>
  </div>
);

export default function PricingPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={8} columns={6} />}>
      <PricingView />
    </Suspense>
  );
}
