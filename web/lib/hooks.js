'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from './api.js';
import { useToast } from './store.js';

export const keys = {
  products: (params) => ['products', params],
  product: (id) => ['product', id],
  dashboard: () => ['analytics', 'dashboard'],
  analytics: (name, params) => ['analytics', name, params],
  quality: (name, params) => ['quality', name, params],
  qualityExplain: (id) => ['quality', 'explain', id],
  pricing: (name, params) => ['pricing', name, params],
  catalog: (name, params) => ['catalog', name, params],
};

/* --------------------------------- reads -------------------------------- */

export const useProducts = (params) =>
  useQuery({
    queryKey: keys.products(params),
    queryFn: () => api.products.list(params),
    // Keeps the previous page visible while the next loads, so the table does
    // not collapse to a spinner on every filter keystroke.
    placeholderData: keepPreviousData,
  });

export const useProduct = (id) =>
  useQuery({ queryKey: keys.product(id), queryFn: () => api.products.get(id), enabled: Boolean(id) });

export const useDashboard = () =>
  useQuery({ queryKey: keys.dashboard(), queryFn: api.analytics.dashboard });

export const useInventoryValue = (groupBy) =>
  useQuery({
    queryKey: keys.analytics('inventory-value', groupBy),
    queryFn: () => api.analytics.inventoryValue(groupBy),
    placeholderData: keepPreviousData,
  });

export const useMarginBands = () =>
  useQuery({ queryKey: keys.analytics('margin-bands'), queryFn: api.analytics.marginBands });

export const useTopProfitable = (params) =>
  useQuery({
    queryKey: keys.analytics('top-profitable', params),
    queryFn: () => api.analytics.topProfitable(params),
    placeholderData: keepPreviousData,
  });

export const useSuppliers = () =>
  useQuery({ queryKey: keys.analytics('suppliers'), queryFn: api.analytics.suppliers });

export const useProcurement = () =>
  useQuery({ queryKey: keys.analytics('procurement'), queryFn: api.analytics.procurement });

export const useQualityOverview = () =>
  useQuery({ queryKey: keys.quality('overview'), queryFn: api.quality.overview });

export const useQualityRubric = () =>
  useQuery({ queryKey: keys.quality('rubric'), queryFn: api.quality.rubric, staleTime: Infinity });

export const useWorstProducts = (params) =>
  useQuery({
    queryKey: keys.quality('worst', params),
    queryFn: () => api.quality.worst(params),
    placeholderData: keepPreviousData,
  });

export const useQualityExplain = (id) =>
  useQuery({
    queryKey: keys.qualityExplain(id),
    queryFn: () => api.quality.explain(id),
    enabled: Boolean(id),
  });

export const useDuplicateSkus = () =>
  useQuery({ queryKey: keys.quality('duplicates-sku'), queryFn: api.quality.duplicateSkus });

export const usePricingPolicy = () =>
  useQuery({ queryKey: keys.pricing('policy'), queryFn: api.pricing.policy, staleTime: Infinity });

export const usePricingAlerts = (params) =>
  useQuery({
    queryKey: keys.pricing('alerts', params),
    queryFn: () => api.pricing.alerts(params),
    placeholderData: keepPreviousData,
  });

export const useLossMakers = (params) =>
  useQuery({ queryKey: keys.pricing('loss-makers', params), queryFn: () => api.pricing.lossMakers(params) });

export const usePriceSuggestion = (id, targetMargin) =>
  useQuery({
    queryKey: keys.pricing('suggest', { id, targetMargin }),
    queryFn: () => api.pricing.suggest(id, targetMargin),
    enabled: Boolean(id),
  });

export const useImportRuns = (params) =>
  useQuery({ queryKey: keys.catalog('imports', params), queryFn: () => api.catalog.imports(params) });

export const useImageOverview = (params) =>
  useQuery({
    queryKey: keys.catalog('images', params),
    queryFn: () => api.catalog.images(params),
    placeholderData: keepPreviousData,
  });

/* -------------------------------- writes -------------------------------- */

/**
 * Every mutation invalidates the aggregate views as well as the product it
 * touched: changing one price moves the dashboard's average margin, the
 * quality distribution and the low-margin alert list. Leaving those stale is
 * how a UI starts lying about the state of the business.
 */
function useInvalidateAfterWrite() {
  const client = useQueryClient();
  return (productId) => {
    if (productId) client.invalidateQueries({ queryKey: keys.product(productId) });
    client.invalidateQueries({ queryKey: ['products'] });
    client.invalidateQueries({ queryKey: ['analytics'] });
    client.invalidateQueries({ queryKey: ['quality'] });
    client.invalidateQueries({ queryKey: ['pricing'] });
  };
}

export function useUpdateProduct() {
  const invalidate = useInvalidateAfterWrite();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, patch }) => api.products.update(id, patch),
    onSuccess: (response, variables) => {
      invalidate(variables.id);
      const changed = response?.meta?.changed ?? [];
      toast.success(
        changed.length > 0 ? `Updated ${changed.join(', ')}` : 'No change — the values were identical',
      );
    },
    onError: (error) => toast.error(error.message, error.details),
  });
}

export function useUpdatePrice() {
  const invalidate = useInvalidateAfterWrite();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, patch }) => api.products.updatePrice(id, patch),
    onSuccess: (response, variables) => {
      invalidate(variables.id);
      const band = response?.data?.pricing?.margin_band;
      if (band === 'loss') {
        toast.warn('Saved — but this product now sells below cost');
      } else {
        toast.success('Price updated, margins recalculated');
      }
    },
    onError: (error) => toast.error(error.message, error.details),
  });
}

export function useVerifyProduct() {
  const invalidate = useInvalidateAfterWrite();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, isVerified, reason }) =>
      api.products.verify(id, { is_verified: isVerified, reason }),
    onSuccess: (product, variables) => {
      invalidate(variables.id);
      toast.success(variables.isVerified ? 'Product verified' : 'Verification removed');
    },
    // A refusal to verify is information, not a failure: it lists what blocks it.
    onError: (error) =>
      toast.error(
        error.message,
        error.details?.issues?.map((issue) => ({ path: issue.code, message: issue.message })),
      ),
  });
}

export function useUnlockFields() {
  const invalidate = useInvalidateAfterWrite();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, fields }) => api.products.unlock(id, fields),
    onSuccess: (_result, variables) => {
      invalidate(variables.id);
      toast.info('Field released — the next import may overwrite it');
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useDeleteProduct() {
  const invalidate = useInvalidateAfterWrite();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, hard }) => api.products.remove(id, hard),
    onSuccess: (_result, variables) => {
      invalidate(variables.id);
      toast.success(variables.hard ? 'Product deleted' : 'Product archived');
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useBulkUpdate() {
  const invalidate = useInvalidateAfterWrite();
  const toast = useToast();

  return useMutation({
    mutationFn: (body) => api.products.bulk(body),
    onSuccess: (result) => {
      invalidate();
      // Partial success is reported honestly rather than shown as a win.
      if (result.failed > 0) {
        toast.warn(
          `${result.updated} updated, ${result.failed} failed`,
          result.results
            .filter((entry) => entry.status === 'failed')
            .map((entry) => ({ path: entry.id, message: entry.message })),
        );
      } else {
        toast.success(`${result.updated} product${result.updated === 1 ? '' : 's'} updated`);
      }
    },
    onError: (error) => toast.error(error.message, error.details),
  });
}

export function useRescoreQuality() {
  const invalidate = useInvalidateAfterWrite();
  const toast = useToast();

  return useMutation({
    mutationFn: () => api.quality.rescore(),
    onSuccess: (result) => {
      invalidate();
      toast.success(
        `${result.examined} products rescored — ${result.improved} improved, ${result.degraded} degraded`,
      );
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useRecalculatePricing() {
  const invalidate = useInvalidateAfterWrite();
  const toast = useToast();

  return useMutation({
    mutationFn: () => api.pricing.recalculate(),
    onSuccess: (result) => {
      invalidate();
      toast.success(`${result.examined} products recalculated, ${result.changed} changed`);
    },
    onError: (error) => toast.error(error.message),
  });
}

export function usePreviewImport() {
  const toast = useToast();
  return useMutation({
    mutationFn: (formData) => api.catalog.preview(formData),
    onError: (error) => toast.error(error.message, error.details),
  });
}

export function useRunImport() {
  const client = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (formData) => api.catalog.import(formData),
    onSuccess: (run) => {
      client.invalidateQueries();
      toast.success(
        `Imported: ${run.totals.products_created} created, ${run.totals.products_updated} updated`,
      );
    },
    onError: (error) => toast.error(error.message, error.details),
  });
}

export function useLinkImages() {
  const client = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ folder, productId }) => api.catalog.linkImages(folder, productId),
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: ['catalog'] });
      client.invalidateQueries({ queryKey: ['products'] });
      toast.success(`${result.images_linked} images linked to ${result.product.name}`);
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useUnlinkImages() {
  const client = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (productId) => api.catalog.unlinkImages(productId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['catalog'] });
      client.invalidateQueries({ queryKey: ['products'] });
      toast.info('Images unlinked');
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useAutoLinkImages() {
  const client = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body) => api.catalog.autoLinkImages(body),
    onSuccess: (result) => {
      if (!result.dry_run) {
        client.invalidateQueries({ queryKey: ['catalog'] });
        client.invalidateQueries({ queryKey: ['products'] });
        toast.success(`${result.linked} folders linked (${result.images} images)`);
      }
    },
    onError: (error) => toast.error(error.message),
  });
}
