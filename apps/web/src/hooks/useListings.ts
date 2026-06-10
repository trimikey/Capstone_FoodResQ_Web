import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FoodCategory } from '@foodresq/types';

interface ListingItem {
  id: string;
  title: string;
  category: string;
  quantityRemaining: number;
  quantityUnit: string;
  pickupStartTime: string;
  pickupEndTime: string;
  pickupAddress: string;
  storageConditions: string | null;
  allergenNotes: string | null;
  maxPerReservation: number;
  imageUrls: string[];
  status: string;
  provider: { id: string; businessName: string };
  distanceM: number;
}

interface QueryParams {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  category?: FoodCategory;
  search?: string;
  page?: number;
  limit?: number;
}

async function fetchListings(params: QueryParams): Promise<ListingItem[]> {
  const { data } = await api.get<{ data: ListingItem[] }>('/listings', { params });
  return data.data;
}

async function fetchListingById(id: string) {
  const { data } = await api.get<{ data: ListingItem & { lng: number; lat: number } }>(
    `/listings/${id}`,
  );
  return data.data;
}

export function useListings(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['listings', 'nearby', params],
    queryFn: () => fetchListings(params),
    staleTime: 30_000,
  });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listings', id],
    queryFn: () => fetchListingById(id),
    staleTime: 60_000,
    enabled: !!id,
  });
}
