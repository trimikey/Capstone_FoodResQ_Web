import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { Coords } from '../services/geolocation';

/**
 * Category lấy theo data thật trên backend (enum food_category có thể rộng hơn
 * enum local). Dùng union mở rộng + fallback string để không vỡ khi gặp giá trị lạ.
 */
export type FoodCategory =
  | 'prepared_meal'
  | 'raw_ingredients'
  | 'bakery'
  | 'beverage'
  | 'vegetables'
  | 'fruits'
  | 'dairy'
  | 'meat'
  | 'seafood'
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
}

const PAGE_SIZE = 20;

/**
 * Danh sách listing geospatial (infinite scroll). Endpoint: GET /listings
 * Response là mảng phẳng không có meta → suy trang sau từ độ dài trang hiện tại.
 */
export function useListings({ coords, search, category, radiusKm = 5 }: ListingQuery) {
  return useInfiniteQuery({
    queryKey: ['listings', coords, search ?? '', category ?? null, radiusKm],
    initialPageParam: 1,
    enabled: coords != null,
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.get<ApiResponse<Listing[]>>(
        endpoints.listings.search,
        {
          params: {
            lat: coords!.lat,
            lng: coords!.lng,
            radiusKm,
            search: search || undefined,
            category: category || undefined,
            page: pageParam,
            limit: PAGE_SIZE,
          },
        }
      );
      return res.data.data;
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length + 1 : undefined,
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
