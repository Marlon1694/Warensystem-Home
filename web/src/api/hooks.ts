import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';
import { api } from './client';
import type {
  ActivitySeries,
  BarcodeLookup,
  Category,
  ExpiringBatch,
  Meta,
  Overview,
  Product,
  ProductDetail,
  RecentMovement,
  Settings,
  ShoppingItem,
  StockBatch,
  StorageLocation,
  TopItems,
  WasteReport,
} from '../types';

export const keys = {
  locations: ['locations'] as const,
  categories: ['categories'] as const,
  products: (filter: ProductFilter = {}) => ['products', filter] as const,
  product: (id: number) => ['product', id] as const,
  batches: (filter: BatchFilter = {}) => ['batches', filter] as const,
  expiring: (days?: number) => ['expiring', days ?? null] as const,
  shopping: ['shopping'] as const,
  overview: ['overview'] as const,
  activity: (days: number) => ['activity', days] as const,
  top: (type: string, days: number) => ['top', type, days] as const,
  waste: (days: number) => ['waste', days] as const,
  recent: (limit: number) => ['recent', limit] as const,
  settings: ['settings'] as const,
  meta: ['meta'] as const,
};

export interface ProductFilter {
  location?: number | null;
  category?: number | null;
  search?: string;
  inStock?: boolean;
  archived?: boolean;
}

export interface BatchFilter {
  location?: number | null;
  product?: number | null;
}

/* ----------------------------------------------------------------------- */
/* Lesen                                                                    */
/* ----------------------------------------------------------------------- */

export function useLocations() {
  return useQuery({
    queryKey: keys.locations,
    queryFn: () => api.get<StorageLocation[]>('/locations'),
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: () => api.get<Category[]>('/categories'),
    staleTime: 60_000,
  });
}

export function useMeta() {
  return useQuery({
    queryKey: keys.meta,
    queryFn: () => api.get<Meta>('/settings/meta'),
    staleTime: 10 * 60_000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => api.get<Settings>('/settings'),
    staleTime: 60_000,
  });
}

export function useProducts(filter: ProductFilter = {}) {
  return useQuery({
    queryKey: keys.products(filter),
    queryFn: () => api.get<Product[]>('/products', {
      location: filter.location ?? undefined,
      category: filter.category ?? undefined,
      search: filter.search || undefined,
      inStock: filter.inStock ? '1' : undefined,
      archived: filter.archived ? '1' : undefined,
    }),
  });
}

export function useProduct(id: number | null) {
  return useQuery({
    queryKey: keys.product(id ?? 0),
    queryFn: () => api.get<ProductDetail>(`/products/${id}`),
    enabled: id !== null,
  });
}

export function useBatches(filter: BatchFilter = {}) {
  return useQuery({
    queryKey: keys.batches(filter),
    queryFn: () => api.get<StockBatch[]>('/stock/batches', {
      location: filter.location ?? undefined,
      product: filter.product ?? undefined,
    }),
  });
}

export function useExpiring(days?: number) {
  return useQuery({
    queryKey: keys.expiring(days),
    queryFn: () => api.get<ExpiringBatch[]>('/stock/expiring', { days }),
  });
}

export function useShoppingList() {
  return useQuery({
    queryKey: keys.shopping,
    queryFn: () => api.get<ShoppingItem[]>('/shopping'),
  });
}

export function useOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: () => api.get<Overview>('/stats/overview'),
  });
}

export function useActivity(days: number) {
  return useQuery({
    queryKey: keys.activity(days),
    queryFn: () => api.get<ActivitySeries>('/stats/activity', { days }),
  });
}

export function useTopItems(type: 'consume' | 'waste', days: number) {
  return useQuery({
    queryKey: keys.top(type, days),
    queryFn: () => api.get<TopItems>('/stats/top', { type, days, limit: 8 }),
  });
}

export function useRecentMovements(limit: number) {
  return useQuery({
    queryKey: keys.recent(limit),
    queryFn: () => api.get<RecentMovement[]>('/stats/recent', { limit }),
  });
}

export function useWasteReport(days: number) {
  return useQuery({
    queryKey: keys.waste(days),
    queryFn: () => api.get<WasteReport>('/stats/waste', { days }),
  });
}

/* ----------------------------------------------------------------------- */
/* Schreiben                                                                */
/* ----------------------------------------------------------------------- */

/**
 * Nach einer Buchung ändern sich Bestand, Warnungen, Einkaufsliste und
 * Kennzahlen gleichzeitig. Statt einzelne Schlüssel zu pflegen, werden alle
 * betroffenen Bereiche verworfen – bei Datenmengen eines Haushalts ist das
 * unmerklich und verhindert veraltete Anzeigen.
 */
function useInvalidateStock() {
  const client = useQueryClient();

  return () => {
    for (const key of ['products', 'product', 'batches', 'expiring', 'shopping', 'overview', 'activity', 'top', 'waste', 'recent', 'locations', 'settings']) {
      void client.invalidateQueries({ queryKey: [key] });
    }
  };
}

type MutationConfig<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationFn'
>;

function useStockMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: MutationConfig<TData, TVariables> = {},
) {
  const invalidate = useInvalidateStock();

  return useMutation<TData, Error, TVariables>({
    mutationFn,
    ...options,
    // Argumente durchreichen statt einzeln benennen – so bleibt der Aufruf
    // unabhängig davon, wie viele Parameter die Bibliothek weitergibt.
    onSuccess: (...args) => {
      invalidate();
      options.onSuccess?.(...args);
    },
  });
}

export interface PurchaseInput {
  product_id: number;
  quantity: number;
  location_id?: number | null;
  best_before?: string | null;
  price?: number | null;
  note?: string | null;
  opened?: boolean;
}

export function usePurchase() {
  return useStockMutation((input: PurchaseInput) => api.post('/stock/purchase', input));
}

export interface ConsumeInput {
  product_id: number;
  quantity: number;
  type?: 'consume' | 'waste';
  location_id?: number | null;
  stock_item_id?: number | null;
  note?: string | null;
}

export function useConsume() {
  return useStockMutation((input: ConsumeInput) => api.post('/stock/consume', input));
}

export function useMoveBatch() {
  return useStockMutation((input: { stock_item_id: number; to_location_id: number; quantity?: number }) =>
    api.post('/stock/move', input));
}

export function useUpdateBatch() {
  return useStockMutation(({ id, ...patch }: { id: number } & Record<string, unknown>) =>
    api.patch(`/stock/batches/${id}`, patch));
}

export function useDeleteBatch() {
  return useStockMutation((id: number) => api.del(`/stock/batches/${id}`));
}

export function useCreateProduct() {
  return useStockMutation((input: Record<string, unknown>) => api.post<Product>('/products', input));
}

export function useUpdateProduct() {
  return useStockMutation(({ id, ...patch }: { id: number } & Record<string, unknown>) =>
    api.patch<Product>(`/products/${id}`, patch));
}

export function useDeleteProduct() {
  return useStockMutation((id: number) => api.del(`/products/${id}`));
}

export function useAddShoppingItem() {
  return useStockMutation((input: Record<string, unknown>) => api.post('/shopping', input));
}

export function useUpdateShoppingItem() {
  return useStockMutation(({ id, ...patch }: { id: number } & Record<string, unknown>) =>
    api.patch(`/shopping/${id}`, patch));
}

export function useDeleteShoppingItem() {
  return useStockMutation((id: number) => api.del(`/shopping/${id}`));
}

export function usePurchaseShoppingItem() {
  return useStockMutation(({ id, ...input }: { id: number } & Record<string, unknown>) =>
    api.post(`/shopping/${id}/purchase`, input));
}

export function useClearDoneShoppingItems() {
  return useStockMutation(() => api.post('/shopping/clear-done'));
}

export function useSaveLocation() {
  return useStockMutation(({ id, ...input }: { id?: number } & Record<string, unknown>) =>
    id ? api.patch(`/locations/${id}`, input) : api.post('/locations', input));
}

export function useDeleteLocation() {
  return useStockMutation(({ id, force }: { id: number; force?: boolean }) =>
    api.del(`/locations/${id}`, { force: force ? '1' : undefined }));
}

export function useSaveCategory() {
  return useStockMutation(({ id, ...input }: { id?: number } & Record<string, unknown>) =>
    id ? api.patch(`/categories/${id}`, input) : api.post('/categories', input));
}

export function useDeleteCategory() {
  return useStockMutation((id: number) => api.del(`/categories/${id}`));
}

export function useSaveSettings() {
  return useStockMutation((input: Partial<Settings>) => api.put<Settings>('/settings', input));
}

export function useImportBackup() {
  return useStockMutation((snapshot: unknown) => api.post('/backup/import', snapshot));
}

/** Barcode auflösen: erst der eigene Bestand, dann Open Food Facts. */
export function useBarcodeLookup() {
  return useMutation<BarcodeLookup, Error, string>({
    mutationFn: (code: string) => api.get<BarcodeLookup>(`/barcode/${code}`),
  });
}
