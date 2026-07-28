import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { Listing, FoodCategory, QuantityUnit } from './useListings';

/** Tin của provider — như Listing nhưng luôn kèm status (mọi trạng thái). */
export type ProviderListing = Listing;

/** Body POST /listings (khớp CreateListingDto backend). */
export interface CreateListingInput {
  title: string;
  category: FoodCategory;
  quantityTotal: number;
  quantityUnit: QuantityUnit;
  pickupStartTime: string; // ISO
  pickupEndTime: string; // ISO, > pickupStartTime
  expiryTime: string; // ISO, >= pickupEndTime
  pickupAddress: string;
  lat: number;
  lng: number;
  maxPerReservation: number; // 1..10
  description?: string;
  weightPerUnitKg?: number;
  storageConditions?: string;
  allergenNotes?: string;
  imageUrls?: string[];
}

export type UpdateListingInput = Partial<CreateListingInput>;

/** Response phân trang của GET /listings/provider/my. */
interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Danh sách tin của provider đang đăng nhập. GET /listings/provider/my */
export function useProviderListings() {
  return useQuery({
    queryKey: ['provider-listings'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Paginated<ProviderListing>>>(
        endpoints.listings.providerMy,
        { params: { page: 1, limit: 50 } }
      );
      return res.data.data.items;
    },
  });
}

/** Tạo tin mới (status = draft). POST /listings */
export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateListingInput) => {
      const res = await apiClient.post<ApiResponse<ProviderListing>>(
        endpoints.listings.create,
        input
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-listings'] });
    },
  });
}

/** Sửa tin provider. Draft sửa đủ field; active/fully_reserved do UI giới hạn field phụ. PATCH /listings/:id */
export function useUpdateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateListingInput }) => {
      const res = await apiClient.patch<ApiResponse<ProviderListing>>(
        endpoints.listings.update(id),
        input
      );
      return res.data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['provider-listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

/** Công khai tin: draft → active. PATCH /listings/:id/publish */
export function usePublishListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.patch<ApiResponse<ProviderListing>>(
        endpoints.listings.publish(id)
      );
      return res.data.data;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['provider-listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
    },
  });
}

/** Huỷ tin (kèm lý do). PATCH /listings/:id/cancel */
export function useCancelListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await apiClient.patch<ApiResponse<ProviderListing>>(
        endpoints.listings.cancel(id),
        reason ? { reason } : {}
      );
      return res.data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['provider-listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
    },
  });
}

export interface ProviderEsg {
  businessName: string;
  kgRescued: number;
  co2SavedKg: number;
  mealsServed: number;
  peopleHelped: number;
  totalListings: number;
  activeListings: number;
}

/** Tác động ESG của provider đang đăng nhập. Không bắt buộc để render màn chính. */
export function useProviderEsg() {
  return useQuery({
    queryKey: ['provider-esg'],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ProviderEsg>>(endpoints.esg.providerMe);
      return res.data.data;
    },
  });
}
