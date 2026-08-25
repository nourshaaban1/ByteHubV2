'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Card, CardHeader, CardBody, PageHeader, Button, Badge, Skeleton,
  EmptyState, ErrorState, Field, Select, Input,
} from '../../components/ui/primitives.jsx';
import { Table, THead, TH, TBody, TR, TD } from '../../components/ui/Table.jsx';
import { QualityScore, IssueChips, PriceCell, MarginCell } from '../../components/domain/indicators.jsx';
import { usePreviewImport, useRunImport, useImportRuns } from '../../lib/hooks.js';
import { formatNumber, formatDate, formatRelative, humanizeCode, dirFor, EM_DASH } from '../../lib/format.js';
import { severityOf } from '../../lib/domain.js';

const ACCEPT = '.xlsx,.xlsm,.xls,.csv,.tsv';

export default function ImportPage() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [options, setOptions] = useState({ source_catalog: '', default_currency: '', default_supplier: '' });

  const preview = usePreviewImport();
  const run = useRunImport();
  const history = useImportRuns({ limit: 10 });

  const buildForm = () => {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(options)) {
      if (value) form.append(key, value);
    }
    return form;
  };

  const choose = (selected) => {
    setFile(selected);
    preview.reset();
    run.reset();
    if (selected && !options.source_catalog) {
      setOptions((prev) => ({ ...prev, source_catalog: selected.name.replace(/\.[^.]+$/, '') }));
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) choose(dropped);
  };

  return (
    <>
      <PageHeader
        title="Import a catalog"
        description="Preview first. The parser reports what it detected, what it skipped, and what it could not map — nothing is written until you commit."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Source file" />
          <CardBody className="space-y-3">
            <div
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={clsx(
                'cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
                dragging ? 'border-brand bg-brand-soft' : 'border-line hover:border-line-strong hover:bg-surface-hover',
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(event) => choose(event.target.files?.[0] ?? null)}
                aria-label="Choose a spreadsheet"
              />
              {file ? (
                <>
                  <p className="text-xs font-medium text-ink">{file.name}</p>
                  <p className="mt-1 text-2xs text-ink-faint">
                    {(file.size / 1024).toFixed(0)} KB · click to replace
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-ink">Drop a spreadsheet here</p>
                  <p className="mt-1 text-2xs text-ink-faint">.xlsx, .xls, .csv or .tsv</p>
                </>
              )}
            </div>

            <Field label="Source catalog name" hint="Recorded on every product from this file">
              <Input
                value={options.source_catalog}
                onChange={(event) => setOptions((prev) => ({ ...prev, source_catalog: event.target.value }))}
                placeholder="e.g. joyroom-price-list"
              />
            </Field>

            <Field label="Currency fallback" hint="Only used for sheets that declare none">
              <Select
                value={options.default_currency}
                onChange={(event) => setOptions((prev) => ({ ...prev, default_currency: event.target.value }))}
              >
                <option value="">Leave unknown</option>
                <option value="EGP">EGP</option>
                <option value="USD">USD</option>
              </Select>
            </Field>

            <Field label="Supplier fallback" hint="Only used for sheets with no supplier column">
              <Input
                value={options.default_supplier}
                onChange={(event) => setOptions((prev) => ({ ...prev, default_supplier: event.target.value }))}
                placeholder="Leave blank"
              />
            </Field>

            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={!file}
                loading={preview.isPending}
                onClick={() => preview.mutate(buildForm())}
              >
                Preview
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={!file || !preview.data}
                loading={run.isPending}
                onClick={() => run.mutate(buildForm())}
                title={!preview.data ? 'Preview the file before importing' : undefined}
              >
                Import
              </Button>
            </div>

            {!preview.data && file && (
              <p className="text-2xs text-ink-faint">
                Preview is required before import — it is the only chance to see what the parser will do.
              </p>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {preview.isError && <Card><ErrorState error={preview.error} /></Card>}
          {run.isSuccess && <RunResult run={run.data} />}
          {preview.isPending && <Card><CardBody><Skeleton className="h-48" /></CardBody></Card>}
          {preview.data && !run.isSuccess && <PreviewReport report={preview.data} />}

          {!preview.data && !preview.isPending && !run.isSuccess && (
            <Card>
              <EmptyState
                title="No file previewed yet"
                description="Choose a spreadsheet and preview it. The parser discovers the header row, maps the columns, and reports every row it skips and why."
              />
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="Import history" subtitle="Every run is auditable, including dry runs" />
        {history.isLoading ? (
          <CardBody><Skeleton className="h-32" /></CardBody>
        ) : (history.data?.items ?? []).length === 0 ? (
          <EmptyState title="No imports yet" />
        ) : (
          <Table>
            <THead>
              <TH>Source</TH>
              <TH>When</TH>
              <TH align="right">Created</TH>
              <TH align="right">Updated</TH>
              <TH align="right">Skipped</TH>
              <TH align="right">Avg quality</TH>
              <TH>Status</TH>
            </THead>
            <TBody>
              {history.data.items.map((entry) => (
                <TR key={entry._id}>
                  <TD className="font-medium">{entry.source_catalog}</TD>
                  <TD className="text-ink-muted" title={formatDate(entry.createdAt, { withTime: true })}>
                    {formatRelative(entry.createdAt)}
                  </TD>
                  <TD align="right" numeric>{formatNumber(entry.totals?.products_created)}</TD>
                  <TD align="right" numeric>{formatNumber(entry.totals?.products_updated)}</TD>
                  <TD align="right" numeric className="text-ink-muted">{formatNumber(entry.totals?.rows_skipped)}</TD>
                  <TD align="right"><QualityScore score={entry.quality?.average_score} showBar={false} /></TD>
                  <TD>
                    <Badge tone={entry.status === 'completed' ? 'healthy' : entry.status === 'failed' ? 'loss' : 'warn'} size="xs">
                      {entry.dry_run ? 'dry run' : entry.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

/* ------------------------------ preview report --------------------------- */

function PreviewReport({ report }) {
  const totals = report.totals ?? {};
  const issues = Object.entries(report.quality?.issues_by_code ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <Card>
        <CardHeader
          title="Preview"
          subtitle="Nothing has been written. This is exactly what an import would do."
          action={<Badge tone="brand">{formatNumber(totals.products)} products</Badge>}
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Rows read" value={totals.rows_read} />
            <Metric label="Product rows" value={totals.rows_data} />
            <Metric
              label="Duplicates merged"
              value={totals.duplicates_in_file}
              tone={totals.duplicates_in_file > 0 ? 'warn' : undefined}
            />
            <Metric
              label="Rows skipped"
              value={totals.rows_skipped}
              tone={totals.rows_skipped > 0 ? 'warn' : undefined}
            />
          </div>
          <p className="mt-3 text-2xs text-ink-faint">
            Average quality of the parsed products: {report.quality?.average_score ?? EM_DASH}/100
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sheets" subtitle="What the parser detected in each tab" />
        <Table>
          <THead>
            <TH>Sheet</TH>
            <TH align="right">Header row</TH>
            <TH align="right">Products</TH>
            <TH>Currency</TH>
            <TH align="right">Mapping</TH>
            <TH>Unmapped columns</TH>
          </THead>
          <TBody>
            {report.sheets.map((sheet) => (
              <TR key={sheet.name} className={sheet.processed ? undefined : 'opacity-60'}>
                <TD>
                  <span className="font-medium">{sheet.name}</span>
                  {!sheet.processed && (
                    <span className="ml-2 text-2xs text-ink-faint">skipped — {sheet.skip_reason?.replace(/_/g, ' ')}</span>
                  )}
                </TD>
                <TD align="right" numeric>{sheet.header_row ?? EM_DASH}</TD>
                <TD align="right" numeric>{sheet.processed ? formatNumber(sheet.rows_data) : EM_DASH}</TD>
                <TD>{sheet.currency ?? <span className="text-warn">unknown</span>}</TD>
                <TD align="right" numeric>
                  {sheet.mapping_confidence !== null && sheet.mapping_confidence !== undefined
                    ? `${Math.round(sheet.mapping_confidence * 100)}%`
                    : EM_DASH}
                </TD>
                <TD>
                  {sheet.unmapped_columns?.length > 0 ? (
                    <span className="text-2xs text-warn" title={sheet.unmapped_columns.join(', ')}>
                      {sheet.unmapped_columns.length} kept as attributes
                    </span>
                  ) : (
                    <span className="text-2xs text-ink-faint">none</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {issues.length > 0 && (
        <Card>
          <CardHeader title="Detected issues" subtitle="Every product will carry these flags — they are not silently fixed" />
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {issues.map(([code, count]) => (
                <Badge key={code} tone={severityOf(code.startsWith('MISSING') ? 'medium' : 'high').tone} size="xs">
                  {humanizeCode(code)} <span className="tnum opacity-70">{count}</span>
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {report.skipped_rows?.length > 0 && (
        <Card>
          <CardHeader title={`Skipped rows (${report.skipped_rows.length})`} subtitle="Not products — banners, totals and section dividers" />
          <CardBody>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {report.skipped_rows.slice(0, 40).map((row, index) => (
                <li key={index} className="flex justify-between gap-2 text-2xs">
                  <span className="text-ink-muted">{row.sheet} : row {row.row}</span>
                  <span className="text-ink-faint">{row.reason?.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {report.sample?.length > 0 && (
        <Card>
          <CardHeader title="Sample products" subtitle="The first rows as the parser understood them" />
          <Table>
            <THead>
              <TH>Product</TH>
              <TH>Category</TH>
              <TH align="right">Cost</TH>
              <TH align="right">Price</TH>
              <TH align="right">Margin</TH>
              <TH align="right">Quality</TH>
              <TH>Issues</TH>
            </THead>
            <TBody>
              {report.sample.map((product, index) => (
                <TR key={index}>
                  <TD>
                    <span dir={dirFor(product.name)} className="block max-w-[14rem] truncate font-medium">
                      {product.name}
                    </span>
                    <span className="font-mono text-2xs text-ink-faint">{product.sku}</span>
                  </TD>
                  <TD className="text-ink-muted">{product.category ?? EM_DASH}</TD>
                  <TD align="right"><PriceCell value={product.pricing?.rdp} currency={product.pricing?.currency} muted /></TD>
                  <TD align="right"><PriceCell value={product.pricing?.selling_price} currency={product.pricing?.currency} /></TD>
                  <TD align="right"><MarginCell pricing={product.pricing} showBoth={false} /></TD>
                  <TD align="right"><QualityScore score={product.metadata?.data_quality_score} showBar={false} /></TD>
                  <TD><IssueChips issues={product.issues} limit={2} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

function RunResult({ run }) {
  return (
    <Card className="border-healthy/40">
      <CardHeader
        title="Import complete"
        subtitle={`${run.source_catalog} · ${run.duration_ms}ms`}
        action={<Badge tone="healthy">{run.status}</Badge>}
      />
      <CardBody>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Created" value={run.totals?.products_created} tone="healthy" />
          <Metric label="Updated" value={run.totals?.products_updated} />
          <Metric label="Duplicates merged" value={run.totals?.duplicates_in_file} />
          <Metric
            label="Manual edits preserved"
            value={run.totals?.locked_fields_preserved}
            tone={run.totals?.locked_fields_preserved > 0 ? 'brand' : undefined}
          />
        </div>
        {run.totals?.locked_fields_preserved > 0 && (
          <p className="mt-3 rounded bg-brand-soft px-2.5 py-2 text-2xs text-brand-ink">
            {run.totals.locked_fields_preserved} manually-edited field
            {run.totals.locked_fields_preserved === 1 ? ' was' : 's were'} left untouched by this import.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div>
      <p className="text-2xs text-ink-muted">{label}</p>
      <p
        className="mt-0.5 text-lg font-semibold tnum"
        style={tone ? { color: `rgb(var(--${tone}))` } : undefined}
      >
        {value === null || value === undefined ? EM_DASH : formatNumber(value)}
      </p>
    </div>
  );
}
