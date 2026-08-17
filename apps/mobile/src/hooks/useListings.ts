import { useQuery } from '@tanstack/react-query';
import apiClient, { API_ORIGIN, ApiResponse, endpoints } from '../api/client';
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
  quantityTotal?: number;
  quantityRemaining: number;
  quantityUnit: QuantityUnit;
  weightPerUnitKg: number | null;
  pickupStartTime: string; // ISO
  pickupEndTime: string; // ISO
  /** Giờ mở/đóng nhận hàng trong ngày — phút từ 00:00 giờ VN; null = không giới hạn */
  dailyStartMinute?: number | null;
  dailyEndMinute?: number | null;
  expiryTime?: string; // ISO
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

export function normalizeImageUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;

  const uploadPath = raw.startsWith('/uploads/') ? raw : raw.startsWith('uploads/') ? `/${raw}` : null;
  if (uploadPath) return `${API_ORIGIN}${uploadPath}`;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const imageUrl = new URL(raw);
      const apiUrl = new URL(API_ORIGIN);
      if (
        (imageUrl.hostname === '10.0.2.2' || imageUrl.hostname === 'localhost' || imageUrl.hostname === '127.0.0.1') &&
        apiUrl.hostname !== imageUrl.hostname
      ) {
        imageUrl.protocol = apiUrl.protocol;
        imageUrl.hostname = apiUrl.hostname;
        imageUrl.port = apiUrl.port;
      }
      return imageUrl.toString();
    } catch {
      return raw;
    }
  }

  return raw;
}

export function normalizeListingImages<T extends Listing>(listing: T): T {
  return {
    ...listing,
    imageUrls: Array.isArray(listing.imageUrls)
      ? listing.imageUrls.map(normalizeImageUrl).filter(Boolean)
      : [],
  };
}

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
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const hasCoords = coords != null;
      const res = await apiClient.get<ApiResponse<Listing[]>>(
        endpoints.listings.search,
        {
          params: {
            ...(hasCoords ? { lat: coords.lat, lng: coords.lng, radiusKm } : {}),
            search: search || undefined,
            category: category || undefined,
            page,
            limit,
          },
        }
      );
      const items = res.data.data.map(normalizeListingImages);
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
      return normalizeListingImages(res.data.data);
    },
    enabled: !!id,
  });
}
