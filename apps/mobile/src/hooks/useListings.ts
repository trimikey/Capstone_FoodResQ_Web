import { useQuery } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { Coords } from '../services/geolocation';

/**
 * Category lấy theo data thật trên backend (enum food_category có thể rộng hơn
 * enum local). Dùng union mở rộng + fallback string để không vỡ khi gặp giá trị lạ.
 */
export type FoodCategory =
  | 'cooked_meal'
  | 'bakery'
  | 'fresh_fruit'
  | 'beverage'
  | 'vegetables'
  | 'raw_protein'
  | 'dry_goods'
  | 'canned_packaged'
  | 'other'
  | (string & {});

export type QuantityUnit = 'kg' | 'portion' | 'item' | 'box' | 'liter' | (string & {});

export interface ListingProvider {
  id: string;
  businessName: string;
}

export interface Listing {
  id: string;
  title: string;
  category: FoodCategory;
  quantityRemaining: number;
  quantityUnit: QuantityUnit;
  weightPerUnitKg: number | null;
  pickupStartTime: string; // ISO
  pickupEndTime: string; // ISO
  pickupAddress: string;
  storageConditions?: string | null;
  allergenNotes?: string | null;
  maxPerReservation: number;
  imageUrls: string[];
  status: string;
  provider: ListingProvider;
  /** chỉ có khi truyền lat/lng */
  distanceM?: number;
  lat: number;
  lng: number;
}

export interface ListingDetail extends Listing {
  description?: string | null;
}

export interface ListingQuery {
  coords: Coords | null;
  /** đã debounce ở container */
  search?: string;
  category?: FoodCategory | null;
  radiusKm?: number;
  page?: number;
  limit?: number;
}

export const LISTING_PAGE_SIZE = 6;

/**
 * Danh sách listing geospatial có phân trang rõ ràng. Endpoint: GET /listings.
 * Backend hiện trả mảng phẳng không có total → suy có trang sau từ độ dài trang hiện tại.
 */
export function useListings({
  coords,
  search,
  category,
  radiusKm = 5,
  page = 1,
  limit = LISTING_PAGE_SIZE,
}: ListingQuery) {
  return useQuery({
    queryKey: ['listings', coords, search ?? '', category ?? null, radiusKm, page, limit],
    enabled: coords != null,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Listing[]>>(
        endpoints.listings.search,
        {
          params: {
            lat: coords!.lat,
            lng: coords!.lng,
            radiusKm,
            search: search || undefined,
            category: category || undefined,
            page,
            limit,
          },
        }
      );
      const items = res.data.data;
      return {
        items,
        page,
        pageSize: limit,
        hasNextPage: items.length === limit,
      };
    },
  });
}

/** Chi tiết 1 listing. Endpoint: GET /listings/:id */
export function useListingDetail(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ListingDetail>>(
        endpoints.listings.detail(id)
      );
      return res.data.data;
    },
    enabled: !!id,
  });
}
