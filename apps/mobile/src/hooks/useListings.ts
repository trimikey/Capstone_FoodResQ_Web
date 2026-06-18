import { useQuery } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { Coords } from '../services/geolocation';

/**
 * TODO [T2.2]: bổ sung field theo response thật của GET /listings
 * (title, imageUrl, providerName, distanceKm, expiresAt, quantity...).
 */
export interface Listing {
  id: string;
  title?: string;
  [key: string]: unknown;
}

export interface ListingQuery extends Partial<Coords> {
  radiusKm?: number;
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
}

/**
 * Danh sách listing geospatial. Endpoint: GET /listings
 * query: lat, lng, radiusKm, category, search, page, limit (đã verify với backend).
 */
export function useListings(params: ListingQuery) {
  return useQuery({
    queryKey: ['listings', params],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Listing[]>>(
        endpoints.listings.search,
        { params }
      );
      return res.data.data;
    },
    enabled: params.lat != null && params.lng != null,
  });
}

/** Chi tiết 1 listing. Endpoint: GET /listings/:id */
export function useListingDetail(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Listing>>(
        endpoints.listings.detail(id)
      );
      return res.data.data;
    },
    enabled: !!id,
  });
}
