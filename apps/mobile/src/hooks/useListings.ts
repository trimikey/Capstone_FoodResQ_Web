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

function uploadPathFromPathname(pathname: string): string | null {
  if (pathname.startsWith('/api/v1/uploads/')) return pathname.replace(/^\/api\/v1/, '');
  if (pathname.startsWith('/uploads/')) return pathname;
  return null;
}

function listingImageValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(listingImageValues);
  }

  if (typeof value !== 'string') return [];

  const raw = value.trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  return [raw];
}

export function normalizeImageUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;

  const normalizedRaw = raw.startsWith('api/v1/uploads/')
    ? `/${raw}`
    : raw.startsWith('uploads/')
      ? `/${raw}`
      : raw;
  const uploadPath = uploadPathFromPathname(normalizedRaw);
  if (uploadPath) return `${API_ORIGIN}${uploadPath}`;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const imageUrl = new URL(raw);
      const absoluteUploadPath = uploadPathFromPathname(imageUrl.pathname);
      if (absoluteUploadPath) return `${API_ORIGIN}${absoluteUploadPath}${imageUrl.search}`;
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
    imageUrls: listingImageValues(listing.imageUrls).map(normalizeImageUrl).filter(Boolean),
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
