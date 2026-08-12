'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Card, CardHeader, CardBody, PageHeader, Button, Badge, Input, Select,
  Skeleton, ErrorState, EmptyState, Tabs,
} from '../../components/ui/primitives.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import {
  useImageOverview, useLinkImages, useUnlinkImages, useAutoLinkImages, useProducts,
} from '../../lib/hooks.js';
import { formatNumber, dirFor, truncate, EM_DASH } from '../../lib/format.js';

export default function ImagesPage() {
  const [tab, setTab] = useState('unlinked');
  const [search, setSearch] = useState('');
  const [threshold, setThreshold] = useState(0.55);
  const [autoPreview, setAutoPreview] = useState(null);

  const overview = useImageOverview({ threshold });
  const link = useLinkImages();
  const unlink = useUnlinkImages();
  const autoLink = useAutoLinkImages();

  const folders = overview.data?.folders ?? [];
  const totals = overview.data?.totals;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return folders
      .filter((folder) => (tab === 'linked' ? folder.linked_product : !folder.linked_product))
      .filter((folder) => !term || folder.id.toLowerCase().includes(term));
  }, [folders, tab, search]);

  return (
    <>
      <PageHeader
        title="Product images"
        description="Folder names are a second source of product identity. Matching is suggested with a confidence score — the link itself is always your decision."
        action={
          <div className="flex items-center gap-2">
            <Select
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
              aria-label="Confidence threshold"
            >
              <option value={0.45}>Loose (45%)</option>
              <option value={0.55}>Balanced (55%)</option>
              <option value={0.7}>Strict (70%)</option>
              <option value={0.85}>Very strict (85%)</option>
            </Select>
            <Button
              variant="secondary"
              loading={autoLink.isPending}
              onClick={() =>
                autoLink.mutate({ threshold, dry_run: true }, { onSuccess: setAutoPreview })
              }
            >
              Preview auto-link
            </Button>
          </div>
        }
      />

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Image folders" value={totals?.folders} loading={overview.isLoading} />
        <Stat label="Linked" value={totals?.linked} tone="healthy" loading={overview.isLoading} />
        <Stat label="Unlinked" value={totals?.unlinked} tone="warn" loading={overview.isLoading} />
        <Stat
          label="Products with no image"
          value={totals?.products_without_images}
          loading={overview.isLoading}
        />
      </section>

      {autoPreview && (
        <Card className="mb-4 border-brand/40">
          <CardHeader
            title={`Auto-link would link ${autoPreview.linked} folders (${autoPreview.images} images)`}
            subtitle={`At ${Math.round(autoPreview.threshold * 100)}% confidence, one folder per product. Nothing has been written.`}
            action={
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setAutoPreview(null)}>Dismiss</Button>
                <Button
                  variant="primary"
                  loading={autoLink.isPending}
                  onClick={() =>
                    autoLink.mutate(
                      { threshold, dry_run: false },
                      { onSuccess: () => setAutoPreview(null) },
                    )
                  }
                >
                  Apply
                </Button>
              </div>
            }
          />
          <CardBody>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {autoPreview.matches.map((match) => (
                <li key={match.folder} className="flex items-center justify-between gap-3 text-2xs">
                  <span className="min-w-0 flex-1 truncate text-ink-muted">{match.folder}</span>
                  <span aria-hidden className="text-ink-faint">→</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{match.product.name}</span>
                  <Confidence score={match.score} />
                </li>
              ))}
            </ul>
            {autoPreview.unmatched.length > 0 && (
              <p className="mt-3 text-2xs text-ink-faint">
                {autoPreview.unmatched.length} folders stay unlinked — no product scored above the
                threshold. They are listed below for manual linking.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'unlinked', label: 'Unlinked', count: totals?.unlinked },
          { value: 'linked', label: 'Linked', count: totals?.linked },
        ]}
      />

      <div className="mt-3">
        <Card>
          <CardHeader
            title={tab === 'linked' ? 'Linked folders' : 'Folders awaiting a link'}
            action={
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter folders…"
                className="w-48"
                aria-label="Filter folders"
              />
            }
          />

          {overview.isError ? (
            <ErrorState error={overview.error} onRetry={overview.refetch} />
          ) : overview.isLoading ? (
            <CardBody><Skeleton className="h-64" /></CardBody>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={tab === 'linked' ? 'No folders linked yet' : 'Every folder is linked'}
              description={
                tab === 'linked'
                  ? 'Link a folder from the Unlinked tab, or run the auto-link preview.'
                  : 'All image folders are attached to a product.'
              }
            />
          ) : (
            <CardBody className="space-y-3">
              {filtered.map((folder) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  onLink={(productId) => link.mutate({ folder: folder.id, productId })}
                  onUnlink={() => unlink.mutate(folder.linked_product._id)}
                  busy={link.isPending || unlink.isPending}
                />
              ))}
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}

/* -------------------------------- folder row ------------------------------ */

function FolderRow({ folder, onLink, onUnlink, busy }) {
  const [manual, setManual] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-start gap-3">
        {/* Thumbnails */}
        <div className="flex gap-1.5">
          {folder.images.slice(0, 3).map((path, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={index}
              src={`/${path}`}
              alt=""
              loading="lazy"
              className="h-14 w-14 rounded border border-line object-cover"
            />
          ))}
          {folder.image_count > 3 && (
            <span className="grid h-14 w-14 place-items-center rounded border border-dashed border-line text-2xs text-ink-faint">
              +{folder.image_count - 3}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink" title={folder.id}>
            {folder.folder}
          </p>
          <p className="mt-0.5 text-2xs text-ink-faint">
            {folder.category_folder} · {folder.image_count} image{folder.image_count === 1 ? '' : 's'}
            {folder.category && ` · maps to ${folder.category}`}
          </p>

          {folder.linked_product ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs">
              <Badge tone="healthy" size="xs">Linked</Badge>
              <span dir={dirFor(folder.linked_product.name)} className="truncate text-ink">
                {folder.linked_product.name}
              </span>
              <span className="font-mono text-ink-faint">{folder.linked_product.sku}</span>
            </p>
          ) : folder.suggestions.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {folder.suggestions.map((suggestion) => (
                <li key={suggestion._id} className="flex items-center gap-2">
                  <Confidence score={suggestion.score} />
                  <span
                    dir={dirFor(suggestion.name)}
                    className="min-w-0 flex-1 truncate text-2xs text-ink"
                    title={suggestion.name}
                  >
                    {truncate(suggestion.name, 52)}
                  </span>
                  <span className="hidden shrink-0 font-mono text-2xs text-ink-faint sm:inline">
                    {suggestion.sku}
                  </span>
                  <Button size="xs" variant={suggestion.above_threshold ? 'subtle' : 'ghost'} disabled={busy}
                    onClick={() => onLink(suggestion._id)}>
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-2xs text-ink-faint">
              No product resembles this folder. Link it by hand, or it may name a product no catalog carries.
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {folder.linked_product ? (
            <Button size="xs" variant="ghost" onClick={() => setConfirmUnlink(true)} disabled={busy}>
              Unlink
            </Button>
          ) : (
            <Button size="xs" variant="secondary" onClick={() => setManual((open) => !open)}>
              {manual ? 'Cancel' : 'Search…'}
            </Button>
          )}
        </div>
      </div>

      {manual && !folder.linked_product && (
        <ManualLink onPick={(productId) => { onLink(productId); setManual(false); }} busy={busy} />
      )}

      <ConfirmDialog
        open={confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        onConfirm={() => { onUnlink(); setConfirmUnlink(false); }}
        title="Unlink these images?"
        confirmLabel="Unlink"
        message={`Removes all ${folder.image_count} images from ${folder.linked_product?.name}. The files stay on disk.`}
      />
    </div>
  );
}

/** Free search across the catalog for folders the matcher could not place. */
function ManualLink({ onPick, busy }) {
  const [term, setTerm] = useState('');
  const { data, isLoading } = useProducts(term.length >= 2 ? { search: term, limit: 8 } : { limit: 8 });

  return (
    <div className="mt-3 border-t border-line pt-3">
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search products by name or SKU…"
        aria-label="Search products to link"
        autoFocus
      />
      {isLoading ? (
        <Skeleton className="mt-2 h-16" />
      ) : (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {(data?.items ?? []).map((product) => (
            <li key={product._id} className="flex items-center gap-2">
              <span dir={dirFor(product.name)} className="min-w-0 flex-1 truncate text-2xs text-ink">
                {product.name}
              </span>
              <span className="shrink-0 font-mono text-2xs text-ink-faint">{product.sku ?? EM_DASH}</span>
              <Button size="xs" variant="subtle" disabled={busy} onClick={() => onPick(product._id)}>
                Link
              </Button>
            </li>
          ))}
          {(data?.items ?? []).length === 0 && (
            <li className="text-2xs text-ink-faint">No products match.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function Confidence({ score }) {
  const percent = Math.round(score * 100);
  const tone = percent >= 80 ? 'healthy' : percent >= 55 ? 'warn' : 'unknown';
  return (
    <span
      className="w-9 shrink-0 text-right text-2xs font-medium tnum"
      style={{ color: `rgb(var(--${tone}))` }}
      title={`${percent}% match confidence`}
    >
      {percent}%
    </span>
  );
}

function Stat({ label, value, tone, loading }) {
  return (
    <Card>
      <div className="p-3">
        <p className="text-2xs font-medium text-ink-muted">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-6 w-12" />
        ) : (
          <p
            className="mt-0.5 text-lg font-semibold tnum"
            style={tone ? { color: `rgb(var(--${tone}))` } : undefined}
          >
            {value === null || value === undefined ? EM_DASH : formatNumber(value)}
          </p>
        )}
      </div>
    </Card>
  );
}
