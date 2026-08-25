'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, PageHeader, Button, ErrorState, EmptyState, Badge } from '../../components/ui/primitives.jsx';
import { Table, THead, TH, TBody, TR, TD, TableSkeleton, Pagination } from '../../components/ui/Table.jsx';
import ProductFilters from '../../components/domain/ProductFilters.jsx';
import ProductDrawer from '../../components/domain/ProductDrawer.jsx';
import {
  MarginCell, QualityScore, VerificationBadge, IssueChips, PriceCell,
} from '../../components/domain/indicators.jsx';
import { useProducts, useInventoryValue } from '../../lib/hooks.js';
import { formatNumber, dirFor, EM_DASH } from '../../lib/format.js';

const SORTS = {
  name: 'name', brand: 'brand', sku: 'sku', price: 'price',
  cost: 'cost', margin: 'margin', quality: 'quality', quantity: 'quantity',
};

function ProductsView() {
  const router = useRouter();
  const params = useSearchParams();
  const [drawerId, setDrawerId] = useState(null);

  // The URL is the filter state, so any view is shareable and survives reload.
  const filters = useMemo(() => {
    const entries = Object.fromEntries(params.entries());
    return {
      page: Number(entries.page ?? 1),
      limit: Number(entries.limit ?? 25),
      sort: entries.sort ?? '-quality',
      ...Object.fromEntries(
        Object.entries(entries).filter(([key]) => !['page', 'limit', 'sort'].includes(key)),
      ),
    };
  }, [params]);

  const setFilters = (next) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === null || value === '') continue;
      search.set(key, String(value));
    }
    router.push(`/products?${search.toString()}`, { scroll: false });
  };

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useProducts(filters);
  const categoryFacets = useInventoryValue('category');
  const brandFacets = useInventoryValue('brand');

  const facets = {
    categories: (categoryFacets.data?.groups ?? []).map((group) => group.key).filter((key) => key !== '(unassigned)'),
    brands: (brandFacets.data?.groups ?? []).map((group) => group.key).filter((key) => key !== '(unassigned)'),
  };

  const items = data?.items ?? [];
  const meta = data?.meta;

  const sortBy = (field) => {
    const current = filters.sort ?? '';
    const descending = current === field;
    setFilters({ ...filters, sort: descending ? `-${field}` : field, page: 1 });
  };

  const sortState = (field) => {
    if (filters.sort === field) return 'asc';
    if (filters.sort === `-${field}`) return 'desc';
    return null;
  };

  return (
    <>
      <PageHeader
        title="Products"
        description="Every product the catalogs produced, with what it costs, what it earns, and what is wrong with it."
        action={
          meta && (
            <Badge tone="neutral">
              {formatNumber(meta.total)} product{meta.total === 1 ? '' : 's'}
            </Badge>
          )
        }
      />

      <Card>
        <div className="border-b border-line p-3">
          <ProductFilters filters={filters} onChange={setFilters} facets={facets} />
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <TableSkeleton rows={10} columns={8} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No products match these filters"
            description="Try clearing a filter, or import a catalog to populate the database."
            action={
              <Button onClick={() => setFilters({ page: 1, limit: filters.limit, sort: filters.sort })}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <Table>
              <THead>
                <TH sortable sorted={sortState('name')} onSort={() => sortBy('name')}>Product</TH>
                <TH sortable sorted={sortState('brand')} onSort={() => sortBy('brand')}>Brand</TH>
                <TH>Category</TH>
                <TH align="right" sortable sorted={sortState('cost')} onSort={() => sortBy('cost')}>Cost</TH>
                <TH align="right" sortable sorted={sortState('price')} onSort={() => sortBy('price')}>Price</TH>
                <TH align="right" sortable sorted={sortState('margin')} onSort={() => sortBy('margin')}>
                  Margin
                </TH>
                <TH align="right" sortable sorted={sortState('quantity')} onSort={() => sortBy('quantity')}>Qty</TH>
                <TH align="right" sortable sorted={sortState('quality')} onSort={() => sortBy('quality')}>Quality</TH>
                <TH>Issues</TH>
                <TH>Status</TH>
              </THead>
              <TBody>
                {items.map((product) => (
                  <TR key={product._id} onClick={() => setDrawerId(product._id)}>
                    <TD>
                      <div className="flex items-center gap-2">
                        {product.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.images[0].url ?? `/${product.images[0].path}`}
                            alt=""
                            loading="lazy"
                            className="h-7 w-7 shrink-0 rounded border border-line object-cover"
                          />
                        ) : (
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded border border-dashed border-line text-2xs text-ink-faint">
                            —
                          </span>
                        )}
                        <div className="min-w-0">
                          <span
                            dir={dirFor(product.name)}
                            className="block max-w-[18rem] truncate font-medium"
                            title={product.name}
                          >
                            {product.name}
                          </span>
                          <span className="font-mono text-2xs text-ink-faint">
                            {product.sku ?? EM_DASH}
                          </span>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-ink-muted">{product.brand ?? EM_DASH}</TD>
                    <TD className="text-ink-muted">
                      <span className="block max-w-[10rem] truncate">{product.category ?? EM_DASH}</span>
                    </TD>
                    <TD align="right">
                      <PriceCell value={product.pricing?.rdp} currency={product.pricing?.currency} muted />
                    </TD>
                    <TD align="right">
                      <PriceCell value={product.pricing?.selling_price} currency={product.pricing?.currency} />
                    </TD>
                    <TD align="right"><MarginCell pricing={product.pricing} /></TD>
                    <TD align="right" numeric className={product.inventory?.quantity ? undefined : 'text-ink-faint'}>
                      {formatNumber(product.inventory?.quantity)}
                    </TD>
                    <TD align="right"><QualityScore score={product.metadata?.data_quality_score} /></TD>
                    <TD><IssueChips issues={product.issues} limit={2} /></TD>
                    <TD><VerificationBadge status={product.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={meta} onPage={(page) => setFilters({ ...filters, page })} />
          </div>
        )}
      </Card>

      <ProductDrawer productId={drawerId} onClose={() => setDrawerId(null)} />
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={10} columns={8} />}>
      <ProductsView />
    </Suspense>
  );
}
