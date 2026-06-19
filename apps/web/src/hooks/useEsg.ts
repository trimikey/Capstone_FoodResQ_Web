import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProviderEsg {
  businessName: string;
  kgRescued: number;
  co2SavedKg: number;
  mealsServed: number;
  peopleHelped: number;
  totalListings: number;
  activeListings: number;
}

export interface PlatformEsg {
  kgRescued: number;
  co2SavedKg: number;
  mealsServed: number;
  providers: number;
  volunteers: number;
}

export function useProviderEsg() {
  return useQuery({
    queryKey: ['esg', 'provider'],
    queryFn: async () => (await api.get('/esg/provider/me')).data.data as ProviderEsg,
    staleTime: 60_000,
  });
}

export function usePlatformEsg() {
  return useQuery({
    queryKey: ['esg', 'platform'],
    queryFn: async () => (await api.get('/esg/platform')).data.data as PlatformEsg,
    staleTime: 5 * 60_000,
  });
}
