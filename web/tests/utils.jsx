import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Renders a component inside a fresh, retry-free React Query cache. */
export function renderWithQuery(ui, { client } = {}) {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, staleTime: 0 },
        mutations: { retry: false },
      },
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...result, queryClient };
}

/** A product fixture shaped exactly like the API's response. */
export const makeProduct = (overrides = {}) => ({
  _id: '66aa00000000000000000001',
  name: 'شاحن 45W GaN',
  sku: 'JR-TCG13',
  brand: 'Joyroom',
  category: 'Chargers',
  subcategory: 'Wall Chargers',
  pricing: {
    currency: 'EGP',
    rdp: 440,
    rrp: 750,
    selling_price: 750,
    margin_percentage: 70.45,
    gross_margin_percentage: 41.33,
    margin_value: 310,
    margin_band: 'target',
    normalized: { currency: 'EGP', rdp: 440, selling_price: 750, fx_rate: 1 },
  },
  specs: { condition: 'new', compatibility: [], features: [], attributes: {} },
  inventory: { quantity: 30, supplier: 'Joyroom' },
  status: { is_active: true, is_verified: false, is_generic: false, is_draft: false, lifecycle: 'review', procurement: 'must_buy' },
  metadata: { data_quality_score: 85, completeness: 90, locked_fields: [], source_catalog: 'master' },
  images: [],
  issues: [],
  ...overrides,
});
