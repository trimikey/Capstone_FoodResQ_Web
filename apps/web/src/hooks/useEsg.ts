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

/** Một mốc tháng trong chuỗi thời gian báo cáo CSR. */
export interface EsgMonthlyPoint {
  /** `YYYY-MM` theo giờ VN */
  month: string;
  kg: number;
  co2: number;
  meals: number;
  people: number;
}

export interface ProviderEsgReport extends ProviderEsg {
  rangeMonths: number;
  /** Hệ số quy đổi kg thực phẩm → kg CO2e, để chú thích phương pháp tính trên báo cáo */
  co2PerKg: number;
  monthly: EsgMonthlyPoint[];
  byCategory: { category: string; kg: number; meals: number }[];
  fulfillment: { status: string; count: number }[];
  topListings: { title: string; kg: number; meals: number }[];
}

export function useProviderEsgReport(months = 6) {
  return useQuery({
    queryKey: ['esg', 'provider', 'report', months],
    queryFn: async () =>
      (await api.get('/esg/provider/me/report', { params: { months } })).data
        .data as ProviderEsgReport,
    staleTime: 60_000,
    // Giữ dữ liệu kỳ trước khi đổi 6→12 tháng để biểu đồ không nháy về trạng thái rỗng.
    placeholderData: (prev) => prev,
  });
}

export function usePlatformEsg() {
  return useQuery({
    queryKey: ['esg', 'platform'],
    queryFn: async () => (await api.get('/esg/platform')).data.data as PlatformEsg,
    staleTime: 5 * 60_000,
  });
}
