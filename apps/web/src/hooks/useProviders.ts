import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse } from '@foodresq/types';

export interface ProviderSummary {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  providerProfile: {
    id: string;
    businessName: string;
    businessType: string;
    verificationStatus: string;
    address: string;
  } | null;
  activeListingsCount?: number;
}

/** Tin đăng của một NCC */
export interface ProviderListing {
  id: string;
  title: string;
  description: string | null;
  category: string;
  quantityRemaining: number;
  quantityUnit: string;
  pickupStartTime: string;
  pickupEndTime: string;
  pickupAddress: string;
  status: string;
  weightPerUnitKg: number | null;
}

export function useProviders() {
  return useQuery({
    queryKey: ['users', 'providers'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ProviderSummary[]>>('/users/providers');
      return data.data;
    },
  });
}

export function useProviderListings(providerProfileId: string | null) {
  return useQuery({
    queryKey: ['users', 'providers', providerProfileId, 'listings'],
    queryFn: async () => {
      if (!providerProfileId) return [];
      const { data } = await api.get<ApiResponse<ProviderListing[]>>(
        `/users/providers/${providerProfileId}/listings`,
      );
      return data.data;
    },
    enabled: !!providerProfileId,
  });
}
