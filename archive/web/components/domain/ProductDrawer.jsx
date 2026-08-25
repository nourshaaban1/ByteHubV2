'use client';

import { useState, useMemo } from 'react';
import clsx from 'clsx';
import { Drawer, ConfirmDialog } from '../ui/Modal.jsx';
import { Button, Input, Select, Field, Badge, Card, Skeleton, ErrorState, Tabs } from '../ui/primitives.jsx';
import {
  MarginCell, MarginBandBadge, QualityScore, VerificationBadge,
  ProcurementBadge, LifecycleBadge, LockBadge,
} from './indicators.jsx';
import {
  useProduct, useUpdateProduct, useUpdatePrice, useVerifyProduct,
  useUnlockFields, useQualityExplain, usePriceSuggestion,
} from '../../lib/hooks.js';
import { formatMoney, formatPercent, formatNumber, formatDate, formatRelative, humanizeCode, dirFor, EM_DASH } from '../../lib/format.js';
import { severityOf, bySeverity, needsDecision } from '../../lib/domain.js';

/* ------------------------------- shared bits ------------------------------ */

function Row({ label, children, locked }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="flex items-center gap-1 text-xs text-ink-muted">
        {label}
        <LockBadge locked={locked} />
      </span>
      <span className="text-right text-xs text-ink">{children}</span>
    </div>
  );
}

const Section = ({ title, children, action }) => (
  <section className="border-b border-line px-5 py-4 last:border-0">
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

/* --------------------------------- panels -------------------------------- */

function OverviewPanel({ product }) {
  const locked = new Set(product.metadata?.locked_fields ?? []);
  const pricing = product.pricing ?? {};
  const currency = pricing.currency;

  return (
    <>
      <Section title="Identity">
        <Row label="Name" locked={locked.has('name')}>
          <span dir={dirFor(product.name)}>{product.name}</span>
        </Row>
        <Row label="SKU" locked={locked.has('sku')}>
          <span className="font-mono">{product.sku ?? EM_DASH}</span>
          {product.metadata?.sku_generated && (
            <Badge tone="warn" size="xs" className="ml-1.5" title="Auto-generated, not supplied by the source">
              generated
            </Badge>
          )}
        </Row>
        {product.metadata?.sku_corrected && (
          <Row label="Corrected from">
            <span className="font-mono text-warn">{product.metadata.sku_corrected}</span>
          </Row>
        )}
        <Row label="Brand" locked={locked.has('brand')}>{product.brand ?? EM_DASH}</Row>
        <Row label="Category" locked={locked.has('category')}>
          {product.category ?? EM_DASH}
          {product.subcategory && <span className="text-ink-faint"> › {product.subcategory}</span>}
        </Row>
        <Row label="Status">
          <span className="inline-flex flex-wrap justify-end gap-1">
            <VerificationBadge status={product.status} />
            <ProcurementBadge value={product.status?.procurement} />
            <LifecycleBadge value={product.status?.lifecycle} />
          </span>
        </Row>
      </Section>

      <Section title="Pricing">
        <Row label="Currency" locked={locked.has('pricing.currency')}>
          {currency ?? <span className="text-warn">Unknown</span>}
        </Row>
        <Row label="Wholesale cost (RDP)" locked={locked.has('pricing.rdp')}>
          {formatMoney(pricing.rdp, currency)}
        </Row>
        <Row label="Recommended retail (RRP)">{formatMoney(pricing.rrp, currency)}</Row>
        <Row label="Selling price" locked={locked.has('pricing.selling_price')}>
          {formatMoney(pricing.selling_price, currency)}
        </Row>
        <Row label="Margin">
          <span className="inline-flex items-center gap-2">
            <MarginCell pricing={pricing} />
            <MarginBandBadge band={pricing.margin_band} size="xs" />
          </span>
        </Row>
        <Row label="Profit per unit">{formatMoney(pricing.margin_value, currency)}</Row>

        {(pricing.market_low || pricing.market_high) && (
          <Row label="Observed market">
            {formatMoney(pricing.market_low, currency)} – {formatMoney(pricing.market_high, currency)}
          </Row>
        )}

        {pricing.normalized?.rdp !== null && pricing.normalized?.currency !== currency && (
          <Row label={`Normalised (${pricing.normalized?.currency})`}>
            <span className="text-ink-muted">
              {formatMoney(pricing.normalized?.rdp, pricing.normalized?.currency)} →{' '}
              {formatMoney(pricing.normalized?.selling_price, pricing.normalized?.currency)}
            </span>
          </Row>
        )}

        {pricing.detail?.selling_price?.is_range && (
          <p className="mt-2 rounded bg-warn/10 px-2 py-1.5 text-2xs text-warn">
            Source supplied a range ({formatMoney(pricing.detail.selling_price.min, currency)} –{' '}
            {formatMoney(pricing.detail.selling_price.max, currency)}); the midpoint is shown. Set an
            exact price to clear this.
          </p>
        )}

        {pricing.variants?.length > 0 && (
          <div className="mt-2.5">
            <p className="mb-1 text-2xs text-ink-faint">Variant pricing from the source</p>
            <ul className="space-y-0.5">
              {pricing.variants.map((variant, index) => (
                <li key={index} className="flex justify-between text-2xs">
                  <span className="text-ink-muted">{variant.label}</span>
                  <span className="tnum">
                    {formatMoney(variant.min, variant.currency)} – {formatMoney(variant.max, variant.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Inventory & specs">
        <Row label="Quantity" locked={locked.has('inventory.quantity')}>
          {formatNumber(product.inventory?.quantity)}
        </Row>
        <Row label="Supplier" locked={locked.has('inventory.supplier')}>
          {product.inventory?.supplier ?? EM_DASH}
        </Row>
        {product.specs?.power_wattage && <Row label="Power">{product.specs.power_wattage} W</Row>}
        {product.specs?.battery_capacity && <Row label="Battery">{formatNumber(product.specs.battery_capacity)} mAh</Row>}
        {product.specs?.cable_type && <Row label="Cable type">{product.specs.cable_type}</Row>}
        {product.specs?.capacity && <Row label="Capacity">{product.specs.capacity}</Row>}
        {product.specs?.interface && <Row label="Interface">{product.specs.interface}</Row>}
        {product.specs?.warranty_months && <Row label="Warranty">{product.specs.warranty_months} months</Row>}
        <Row label="Condition">{humanizeCode(product.specs?.condition)}</Row>

        {product.specs?.features?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {product.specs.features.slice(0, 12).map((feature, index) => (
              <Badge key={index} tone="neutral" size="xs">{feature}</Badge>
            ))}
          </div>
        )}
      </Section>

      {product.images?.length > 0 && (
        <Section title={`Images (${product.images.length})`}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {product.images.map((image, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={image.url ?? `/${image.path}`}
                alt={`${product.name} ${index + 1}`}
                loading="lazy"
                className="h-20 w-20 shrink-0 rounded border border-line object-cover"
              />
            ))}
          </div>
          <p className="mt-1.5 text-2xs text-ink-faint">Linked from {product.images[0].source}</p>
        </Section>
      )}

      <Section title="Provenance">
        <Row label="Source catalog">{product.metadata?.source_catalog ?? EM_DASH}</Row>
        <Row label="Sheet / row">
          {product.metadata?.source_sheet ?? EM_DASH}
          {product.metadata?.source_row ? ` : ${product.metadata.source_row}` : ''}
        </Row>
        <Row label="Last imported">{formatDate(product.metadata?.last_imported_at, { withTime: true })}</Row>
        <Row label="Mapping confidence">
          {product.metadata?.mapping_confidence !== null && product.metadata?.mapping_confidence !== undefined
            ? `${Math.round(product.metadata.mapping_confidence * 100)}%`
            : EM_DASH}
        </Row>
        {product.metadata?.cost_mismatch && (
          <div className="mt-2 rounded bg-critical/10 px-2 py-1.5 text-2xs text-critical">
            The source claimed a cost of{' '}
            {formatMoney(product.metadata.cost_mismatch.reported, currency)} but the verified price
            list says {formatMoney(product.metadata.cost_mismatch.verified, currency)} — a difference
            of {formatMoney(product.metadata.cost_mismatch.delta, currency)}.
          </div>
        )}
        {product.metadata?.notes?.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-2xs text-ink-muted hover:text-ink">
              Source notes ({product.metadata.notes.length})
            </summary>
            <ul className="mt-1.5 space-y-1">
              {product.metadata.notes.map((note, index) => (
                <li key={index} className="text-2xs leading-relaxed text-ink-muted">{note}</li>
              ))}
            </ul>
          </details>
        )}
      </Section>
    </>
  );
}

function IssuesPanel({ product }) {
  const { data: explain, isLoading } = useQualityExplain(product._id);
  const issues = [...(product.issues ?? [])].sort(bySeverity);

  return (
    <>
      <Section title="Quality score">
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <QualityScore score={explain?.score ?? product.metadata?.data_quality_score} />
              <span className="text-2xs text-ink-faint">
                completeness {formatPercent(explain?.completeness)} − penalties{' '}
                {explain?.breakdown?.penalty_total ?? 0}
              </span>
            </div>

            {explain?.breakdown?.completeness && (
              <ul className="space-y-1.5">
                {Object.entries(explain.breakdown.completeness).map(([group, detail]) => (
                  <li key={group}>
                    <div className="flex items-center justify-between text-2xs">
                      <span className="capitalize text-ink-muted">{group}</span>
                      <span className="tnum text-ink">{detail.earned}/{detail.possible}</span>
                    </div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-hover">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${detail.pct}%` }}
                      />
                    </div>
                    {detail.missing?.length > 0 && (
                      <p className="mt-0.5 text-2xs text-ink-faint">
                        missing: {detail.missing.join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      <Section title={`Issues (${issues.length})`}>
        {issues.length === 0 ? (
          <p className="text-xs text-healthy">No issues detected.</p>
        ) : (
          <ul className="space-y-2">
            {issues.map((issue, index) => {
              const severity = severityOf(issue.severity);
              return (
                <li key={`${issue.code}-${index}`} className="rounded border border-line p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-ink">{humanizeCode(issue.code)}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {needsDecision(issue.code) && (
                        <Badge tone="neutral" size="xs" title="Needs a judgement call, not a data entry fix">
                          decision
                        </Badge>
                      )}
                      <Badge tone={severity.tone} size="xs">{severity.label}</Badge>
                    </span>
                  </div>
                  {issue.message && (
                    <p className="mt-1 text-2xs leading-relaxed text-ink-muted">{issue.message}</p>
                  )}
                  {issue.field && (
                    <p className="mt-1 font-mono text-2xs text-ink-faint">{issue.field}</p>
                  )}
                  {issue.context && (
                    <pre className="mt-1.5 max-h-24 overflow-auto rounded bg-surface-sunken p-1.5 text-2xs text-ink-muted">
                      {JSON.stringify(issue.context, null, 1)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

function EditPanel({ product, onClose }) {
  const update = useUpdateProduct();
  const updatePrice = useUpdatePrice();
  const unlock = useUnlockFields();
  const suggestion = usePriceSuggestion(product._id);

  const locked = product.metadata?.locked_fields ?? [];
  const currency = product.pricing?.currency;

  const [form, setForm] = useState({
    name: product.name ?? '',
    brand: product.brand ?? '',
    category: product.category ?? '',
    currency: currency ?? '',
    rdp: product.pricing?.rdp ?? '',
    selling_price: product.pricing?.selling_price ?? '',
    quantity: product.inventory?.quantity ?? '',
    supplier: product.inventory?.supplier ?? '',
    reason: '',
  });

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const num = (value) => (value === '' || value === null ? undefined : Number(value));

  // Only changed fields are sent: an unchanged field must not become "locked"
  // just because the form was opened.
  const buildPatch = () => {
    const patch = {};
    if (form.name !== (product.name ?? '')) patch.name = form.name;
    if (form.brand !== (product.brand ?? '')) patch.brand = form.brand || null;
    if (form.category !== (product.category ?? '')) patch.category = form.category || null;

    const pricing = {};
    if (form.currency !== (currency ?? '')) pricing.currency = form.currency || undefined;
    if (num(form.rdp) !== (product.pricing?.rdp ?? undefined)) pricing.rdp = num(form.rdp) ?? null;
    if (num(form.selling_price) !== (product.pricing?.selling_price ?? undefined)) {
      pricing.selling_price = num(form.selling_price) ?? null;
    }
    if (Object.keys(pricing).length > 0) patch.pricing = pricing;

    const inventory = {};
    if (num(form.quantity) !== (product.inventory?.quantity ?? undefined)) {
      inventory.quantity = num(form.quantity) ?? 0;
    }
    if (form.supplier !== (product.inventory?.supplier ?? '')) inventory.supplier = form.supplier || null;
    if (Object.keys(inventory).length > 0) patch.inventory = inventory;

    return patch;
  };

  const patch = buildPatch();
  const dirty = Object.keys(patch).length > 0;

  const errors = update.error?.fieldErrors ?? updatePrice.error?.fieldErrors ?? {};

  const save = () => {
    if (!dirty) return;
    update.mutate(
      { id: product._id, patch: { ...patch, reason: form.reason || undefined } },
      { onSuccess: () => setForm((prev) => ({ ...prev, reason: '' })) },
    );
  };

  return (
    <>
      <Section title="Edit">
        <p className="mb-3 text-2xs leading-relaxed text-ink-faint">
          Every field you change is locked against future imports and recorded with an audit entry.
          Nothing is inferred: leave a field blank and it stays empty rather than being guessed.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2" error={errors.name}>
            <Input value={form.name} onChange={set('name')} dir={dirFor(form.name)} />
          </Field>
          <Field label="Brand" error={errors.brand}>
            <Input value={form.brand} onChange={set('brand')} placeholder="—" />
          </Field>
          <Field label="Category" error={errors.category}>
            <Input value={form.category} onChange={set('category')} placeholder="—" />
          </Field>

          <Field
            label="Currency"
            error={errors['pricing.currency']}
            hint={!currency ? 'Unknown — prices are not comparable until set' : undefined}
          >
            <Select value={form.currency} onChange={set('currency')}>
              <option value="">Unknown</option>
              <option value="EGP">EGP</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
          <Field label="Quantity" error={errors['inventory.quantity']}>
            <Input type="number" min="0" value={form.quantity} onChange={set('quantity')} />
          </Field>

          <Field label="Wholesale cost (RDP)" error={errors['pricing.rdp']}>
            <Input type="number" min="0" step="0.01" value={form.rdp} onChange={set('rdp')} placeholder="—" />
          </Field>
          <Field
            label="Selling price"
            error={errors['pricing.selling_price']}
            hint={
              suggestion.data?.suggested_selling_price
                ? `Target margin suggests ${formatMoney(suggestion.data.suggested_selling_price, currency)}`
                : undefined
            }
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.selling_price}
              onChange={set('selling_price')}
              placeholder="—"
              invalid={
                num(form.selling_price) !== undefined &&
                num(form.rdp) !== undefined &&
                num(form.selling_price) < num(form.rdp)
              }
            />
          </Field>

          <Field label="Supplier" className="sm:col-span-2" error={errors['inventory.supplier']}>
            <Input value={form.supplier} onChange={set('supplier')} placeholder="—" />
          </Field>

          <Field label="Reason (optional)" className="sm:col-span-2" hint="Stored in the audit trail">
            <Input value={form.reason} onChange={set('reason')} placeholder="e.g. Confirmed with supplier" />
          </Field>
        </div>

        {num(form.selling_price) !== undefined &&
          num(form.rdp) !== undefined &&
          num(form.selling_price) < num(form.rdp) && (
            <p className="mt-3 rounded bg-loss/10 px-2.5 py-2 text-2xs text-loss">
              This price is below cost — every unit sold would lose{' '}
              {formatMoney(num(form.rdp) - num(form.selling_price), currency)}. It will save, and be
              flagged.
            </p>
          )}

        <div className="mt-4 flex items-center gap-2">
          <Button variant="primary" onClick={save} disabled={!dirty} loading={update.isPending}>
            {dirty ? `Save ${Object.keys(patch).length} change${Object.keys(patch).length === 1 ? '' : 's'}` : 'No changes'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </Section>

      {locked.length > 0 && (
        <Section title={`Locked fields (${locked.length})`}>
          <p className="mb-2 text-2xs leading-relaxed text-ink-faint">
            Imports will not overwrite these. Release one to let the source catalog manage it again.
          </p>
          <ul className="space-y-1">
            {locked.map((field) => (
              <li key={field} className="flex items-center justify-between gap-2 text-2xs">
                <span className="font-mono text-ink-muted">{field}</span>
                <Button
                  size="xs"
                  variant="ghost"
                  loading={unlock.isPending}
                  onClick={() => unlock.mutate({ id: product._id, fields: [field] })}
                >
                  Release
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {product.metadata?.overrides?.length > 0 && (
        <Section title="Change history">
          <ul className="space-y-2">
            {[...product.metadata.overrides].reverse().slice(0, 12).map((entry, index) => (
              <li key={index} className="border-l-2 border-line pl-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xs text-ink">{entry.field}</span>
                  <span className="text-2xs text-ink-faint">{formatRelative(entry.at)}</span>
                </div>
                <p className="mt-0.5 text-2xs text-ink-muted">
                  <span className="line-through opacity-60">{String(entry.previous ?? '—')}</span>
                  {' → '}
                  <span className="text-ink">{String(entry.next ?? '—')}</span>
                </p>
                {entry.reason && <p className="mt-0.5 text-2xs italic text-ink-faint">{entry.reason}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

/* --------------------------------- drawer -------------------------------- */

export default function ProductDrawer({ productId, onClose }) {
  const [tab, setTab] = useState('overview');
  const [confirmVerify, setConfirmVerify] = useState(false);

  const { data: product, isLoading, isError, error, refetch } = useProduct(productId);
  const verify = useVerifyProduct();

  const criticalCount = useMemo(
    () => (product?.issues ?? []).filter((issue) => issue.severity === 'critical').length,
    [product],
  );

  const open = Boolean(productId);

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={product?.name ?? (isLoading ? 'Loading…' : 'Product')}
        subtitle={product ? `${product.sku ?? 'no SKU'} · ${product.brand ?? 'no brand'}` : undefined}
        footer={
          product && (
            <>
              <span className="mr-auto text-2xs text-ink-faint">
                Quality {product.metadata?.data_quality_score ?? EM_DASH}/100
              </span>
              {product.status?.is_verified ? (
                <Button
                  variant="secondary"
                  loading={verify.isPending}
                  onClick={() => verify.mutate({ id: product._id, isVerified: false })}
                >
                  Remove verification
                </Button>
              ) : (
                <Button
                  variant="primary"
                  loading={verify.isPending}
                  onClick={() => setConfirmVerify(true)}
                  title={criticalCount > 0 ? `${criticalCount} critical issue(s) block verification` : undefined}
                >
                  Verify
                </Button>
              )}
            </>
          )
        }
      >
        {isLoading && (
          <div className="space-y-3 p-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
          </div>
        )}

        {isError && <ErrorState error={error} onRetry={refetch} />}

        {product && (
          <>
            <div className="border-b border-line px-5 py-3">
              <Tabs
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'overview', label: 'Overview' },
                  { value: 'issues', label: 'Issues', count: product.issues?.length ?? 0 },
                  { value: 'edit', label: 'Edit' },
                ]}
              />
            </div>

            {tab === 'overview' && <OverviewPanel product={product} />}
            {tab === 'issues' && <IssuesPanel product={product} />}
            {tab === 'edit' && <EditPanel product={product} onClose={onClose} />}
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmVerify}
        onClose={() => setConfirmVerify(false)}
        onConfirm={() => {
          verify.mutate({ id: product._id, isVerified: true });
          setConfirmVerify(false);
        }}
        title="Verify this product?"
        tone="primary"
        confirmLabel="Verify"
        message={
          criticalCount > 0
            ? `This product has ${criticalCount} critical issue${criticalCount === 1 ? '' : 's'}. The API will refuse to verify it until they are resolved — you will see exactly which ones.`
            : 'Marks the product approved and locks its verification against re-import.'
        }
      />
    </>
  );
}
