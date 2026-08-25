'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Card, CardHeader, CardBody, PageHeader, Button, Input, Select,
  Badge, Skeleton, ErrorState, EmptyState, Checkbox, Tabs,
} from '../../components/ui/primitives.jsx';
import { Table, THead, TH, TBody, TR, TD, TableSkeleton } from '../../components/ui/Table.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import ProductDrawer from '../../components/domain/ProductDrawer.jsx';
import { QualityScore, IssueChips, PriceCell, MarginCell } from '../../components/domain/indicators.jsx';
import {
  useWorstProducts, useQualityOverview, useBulkUpdate, useRescoreQuality, useDuplicateSkus,
} from '../../lib/hooks.js';
import { formatNumber, humanizeCode, dirFor, EM_DASH } from '../../lib/format.js';
import { FIXABLE_ISSUES, severityOf, needsDecision, bySeverity } from '../../lib/domain.js';

/* ---------------------------- inline fix editor --------------------------- */

/**
 * One editable cell per product, targeting the field its worst fixable issue
 * points at. Nothing is pre-filled with a guess: an empty box stays empty
 * until the operator types a real value.
 */
function FixInput({ product, value, onChange, field }) {
  const definition = FIXABLE_ISSUES[field.code];
  const currency = product.pricing?.currency;

  if (definition.type === 'currency') {
    return (
      <Select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        aria-label={`${definition.label} for ${product.name}`}
        className="w-28"
      >
        <option value="">Not set</option>
        <option value="EGP">EGP</option>
        <option value="USD">USD</option>
      </Select>
    );
  }

  const numeric = definition.type === 'money' || definition.type === 'integer';

  return (
    <Input
      type={numeric ? 'number' : 'text'}
      min={numeric ? '0' : undefined}
      step={definition.type === 'money' ? '0.01' : definition.type === 'integer' ? '1' : undefined}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      placeholder={definition.type === 'money' && currency ? currency : 'Not set'}
      aria-label={`${definition.label} for ${product.name}`}
      className={clsx('w-28', numeric && 'text-right tnum')}
    />
  );
}

/** Builds the nested patch a dotted field path implies. */
function patchFor(path, rawValue, type) {
  let value = rawValue;
  if (type === 'money') value = Number(rawValue);
  if (type === 'integer') value = Number.parseInt(rawValue, 10);
  if (Number.isNaN(value)) return null;

  const keys = path.split('.');
  const patch = {};
  let cursor = patch;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cursor[keys[i]] = {};
    cursor = cursor[keys[i]];
  }
  cursor[keys[keys.length - 1]] = value;
  return patch;
}

/** Picks the issue this row should present for fixing: worst severity first. */
function primaryFixable(product) {
  const sorted = [...(product.issues ?? [])].sort(bySeverity);
  return sorted.find((issue) => FIXABLE_ISSUES[issue.code]) ?? null;
}

/* --------------------------------- page ---------------------------------- */

export default function QualityPage() {
  const [tab, setTab] = useState('queue');
  const [severity, setSeverity] = useState('');
  const [limit, setLimit] = useState(25);
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState({});
  const [drawerId, setDrawerId] = useState(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const overview = useQualityOverview();
  const worst = useWorstProducts({ limit, severity: severity || undefined });
  const duplicates = useDuplicateSkus();
  const bulk = useBulkUpdate();
  const rescore = useRescoreQuality();

  const products = worst.data ?? [];

  const rows = useMemo(
    () => products.map((product) => ({ product, fix: primaryFixable(product) })),
    [products],
  );

  const pending = Object.entries(drafts).filter(([, entry]) => entry?.value !== undefined && entry.value !== '');

  const applyBulk = () => {
    const updates = pending
      .map(([id, entry]) => {
        const patch = patchFor(entry.path, entry.value, entry.type);
        return patch ? { id, patch } : null;
      })
      .filter(Boolean);

    if (updates.length === 0) return;

    bulk.mutate(
      { updates, reason: 'Fix queue' },
      {
        onSuccess: (result) => {
          // Only clear the rows that actually saved; failures stay on screen
          // with their value intact so the operator can correct them.
          const succeeded = new Set(
            result.results.filter((entry) => entry.status !== 'failed').map((entry) => entry.id),
          );
          setDrafts((prev) =>
            Object.fromEntries(Object.entries(prev).filter(([id]) => !succeeded.has(id))),
          );
          setSelected({});
        },
      },
    );
    setConfirmBulk(false);
  };

  const totals = overview.data?.totals;
  const needsWork = totals ? totals.products - totals.publishable : null;

  return (
    <>
      <PageHeader
        title="Fix queue"
        description="The lowest-scoring products first. The score is a work queue, not a KPI — nothing here is auto-corrected."
        action={
          <Button variant="secondary" loading={rescore.isPending} onClick={() => rescore.mutate()}>
            Rescore catalog
          </Button>
        }
      />

      {/* Queue health */}
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Needs work" value={needsWork} tone="warn" loading={overview.isLoading}
          sub={`below ${overview.data?.min_publishable ?? 70}/100`} />
        <MiniStat label="Publishable" value={totals?.publishable} tone="healthy" loading={overview.isLoading}
          sub={`of ${formatNumber(totals?.products)}`} />
        <MiniStat label="Critical issues" value={overview.data?.issues_by_severity?.critical} tone="loss"
          loading={overview.isLoading} sub="block verification" />
        <MiniStat label="SKU collisions" value={duplicates.data?.length} tone="critical"
          loading={duplicates.isLoading} sub="need a decision" />
      </section>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'queue', label: 'Fix queue', count: products.length },
          { value: 'issues', label: 'By issue' },
          { value: 'duplicates', label: 'SKU collisions', count: duplicates.data?.length },
        ]}
      />

      <div className="mt-3">
        {tab === 'queue' && (
          <Card>
            <CardHeader
              title="Lowest-scoring products"
              subtitle="Type a value to fix the highlighted field, then apply. Blank rows are left untouched."
              action={
                <div className="flex items-center gap-2">
                  <Select value={severity} onChange={(event) => setSeverity(event.target.value)} aria-label="Severity">
                    <option value="">All severities</option>
                    <option value="critical">Critical only</option>
                    <option value="high">High only</option>
                    <option value="medium">Medium only</option>
                  </Select>
                  <Select value={limit} onChange={(event) => setLimit(Number(event.target.value))} aria-label="Rows">
                    <option value={25}>25 rows</option>
                    <option value={50}>50 rows</option>
                    <option value={100}>100 rows</option>
                  </Select>
                </div>
              }
            />

            {worst.isError ? (
              <ErrorState error={worst.error} onRetry={worst.refetch} />
            ) : worst.isLoading ? (
              <TableSkeleton rows={8} columns={7} />
            ) : rows.length === 0 ? (
              <EmptyState title="Nothing in the queue" description="No products match this severity filter." />
            ) : (
              <>
                <Table>
                  <THead>
                    <TH width="2rem" />
                    <TH>Product</TH>
                    <TH align="right">Quality</TH>
                    <TH>Issues</TH>
                    <TH>Fix</TH>
                    <TH>Value</TH>
                  </THead>
                  <TBody>
                    {rows.map(({ product, fix }) => {
                      const definition = fix ? FIXABLE_ISSUES[fix.code] : null;
                      const draft = drafts[product._id];
                      const failed = bulk.data?.results?.find(
                        (entry) => entry.id === product._id && entry.status === 'failed',
                      );

                      return (
                        <TR key={product._id} selected={Boolean(draft?.value)}>
                          <TD>
                            <Checkbox
                              checked={Boolean(selected[product._id])}
                              onChange={() =>
                                setSelected((prev) => {
                                  const next = { ...prev };
                                  if (next[product._id]) delete next[product._id];
                                  else next[product._id] = true;
                                  return next;
                                })
                              }
                              aria-label={`Select ${product.name}`}
                            />
                          </TD>
                          <TD>
                            <button
                              type="button"
                              onClick={() => setDrawerId(product._id)}
                              className="block max-w-[16rem] truncate text-left font-medium hover:underline"
                              dir={dirFor(product.name)}
                            >
                              {product.name}
                            </button>
                            <span className="font-mono text-2xs text-ink-faint">
                              {product.sku ?? EM_DASH} · {product.brand ?? 'no brand'}
                            </span>
                            {failed && (
                              <p className="mt-0.5 text-2xs text-loss">{failed.message}</p>
                            )}
                          </TD>
                          <TD align="right"><QualityScore score={product.metadata?.data_quality_score} /></TD>
                          <TD><IssueChips issues={product.issues} limit={2} /></TD>
                          <TD>
                            {definition ? (
                              <span className="text-2xs text-ink-muted">{definition.label}</span>
                            ) : (
                              <Badge tone="neutral" size="xs" title="Needs a judgement call, not a typed value">
                                decision
                              </Badge>
                            )}
                          </TD>
                          <TD>
                            {definition ? (
                              <FixInput
                                product={product}
                                field={fix}
                                value={draft?.value}
                                onChange={(value) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [product._id]: value === undefined
                                      ? undefined
                                      : { value, path: definition.field, type: definition.type },
                                  }))
                                }
                              />
                            ) : (
                              <Button size="xs" variant="ghost" onClick={() => setDrawerId(product._id)}>
                                Review
                              </Button>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>

                {/* Sticky action bar appears only when there is something to apply */}
                {pending.length > 0 && (
                  <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface-raised px-4 py-3 shadow-pop">
                    <p className="text-xs text-ink-muted">
                      <span className="font-medium text-ink">{pending.length}</span> value
                      {pending.length === 1 ? '' : 's'} ready to apply
                    </p>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setDrafts({})}>Discard</Button>
                      <Button variant="primary" onClick={() => setConfirmBulk(true)} loading={bulk.isPending}>
                        Apply {pending.length} fix{pending.length === 1 ? '' : 'es'}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {tab === 'issues' && <IssueBreakdown overview={overview} />}
        {tab === 'duplicates' && <DuplicateSkus query={duplicates} onOpen={setDrawerId} />}
      </div>

      <ProductDrawer productId={drawerId} onClose={() => setDrawerId(null)} />

      <ConfirmDialog
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={applyBulk}
        title={`Apply ${pending.length} fix${pending.length === 1 ? '' : 'es'}?`}
        tone="primary"
        confirmLabel="Apply"
        loading={bulk.isPending}
        message="Each edited field will be locked against future imports and recorded in the audit trail. Any row that fails will stay on screen with its value so you can correct it."
      />
    </>
  );
}

/* ------------------------------ sub-sections ----------------------------- */

function MiniStat({ label, value, sub, tone, loading }) {
  return (
    <Card>
      <div className="p-3">
        <p className="text-2xs font-medium text-ink-muted">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-6 w-14" />
        ) : (
          <p className="mt-0.5 text-lg font-semibold tnum" style={tone ? { color: `rgb(var(--${tone}))` } : undefined}>
            {value === null || value === undefined ? EM_DASH : formatNumber(value)}
          </p>
        )}
        {sub && <p className="text-2xs text-ink-faint">{sub}</p>}
      </div>
    </Card>
  );
}

function IssueBreakdown({ overview }) {
  if (overview.isLoading) {
    return <Card><CardBody><Skeleton className="h-64" /></CardBody></Card>;
  }
  if (overview.isError) {
    return <Card><ErrorState error={overview.error} onRetry={overview.refetch} /></Card>;
  }

  const byCode = Object.entries(overview.data?.issues_by_code ?? {}).sort((a, b) => b[1] - a[1]);
  const max = byCode[0]?.[1] ?? 1;

  return (
    <Card>
      <CardHeader
        title="Issues across the catalog"
        subtitle="Fixable issues take a value; decision issues need a human call."
      />
      <CardBody>
        <ul className="space-y-2">
          {byCode.map(([code, count]) => {
            const fixable = Boolean(FIXABLE_ISSUES[code]);
            return (
              <li key={code}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-ink">{humanizeCode(code)}</span>
                    {needsDecision(code) && (
                      <Badge tone="neutral" size="xs">decision</Badge>
                    )}
                    {fixable && <Badge tone="brand" size="xs">fixable</Badge>}
                  </span>
                  <span className="shrink-0 tnum text-ink-muted">{count}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(count / max) * 100}%`,
                      backgroundColor: fixable ? 'rgb(var(--brand))' : 'rgb(var(--unknown))',
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function DuplicateSkus({ query, onOpen }) {
  if (query.isLoading) return <Card><CardBody><Skeleton className="h-48" /></CardBody></Card>;
  if (query.isError) return <Card><ErrorState error={query.error} onRetry={query.refetch} /></Card>;

  const groups = query.data ?? [];

  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState title="No SKU collisions" description="Every SKU in the catalog maps to one product." />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={`${groups.length} SKU collision${groups.length === 1 ? '' : 's'}`}
        subtitle="A shared code is flagged, never blocked — suppliers genuinely reuse model codes."
      />
      <CardBody className="space-y-3">
        {groups.map((group) => (
          <div key={group.sku_key} className="rounded border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-ink">{group.sku_key}</span>
              <Badge tone={group.kind === 'duplicate_row' ? 'loss' : 'warn'} size="xs">
                {group.kind === 'duplicate_row' ? 'True duplicate' : 'Reused model code'}
              </Badge>
            </div>
            <p className="mb-2 text-2xs text-ink-muted">
              {group.kind === 'duplicate_row'
                ? 'Same code, same product name — one of these rows should be removed.'
                : 'Same code, different products. The supplier reuses this code; confirm which one you mean before ordering.'}
            </p>
            <ul className="space-y-1">
              {group.products.map((product) => (
                <li key={product._id} className="flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onOpen(product._id)}
                    className="min-w-0 truncate text-left hover:underline"
                    dir={dirFor(product.name)}
                  >
                    {product.name}
                  </button>
                  <span className="shrink-0 text-2xs text-ink-faint">{product.source}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
