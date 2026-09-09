import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';

/**
 * Hồ sơ tình nguyện viên — khớp shape GET /volunteers/me.
 * `isAvailable` còn từ API legacy; luồng nhận đơn mới dùng ca giao hàng + GPS.
 */
export interface VolunteerProfile {
  id: string;
  isAvailable: boolean;
  dedicationPoints: number;
  rank: string;
  vehicleType: string | null;
  vehiclePlate: string | null;
  avgRating: number | null;
  verificationStatus: string;
  locationUpdatedAt: string | null;
  specializations: { specialization: 'chef' | 'waiter' | 'shipper'; isVerified: boolean }[];
  isShipper: boolean;
  currentLocation: { lng: number; lat: number } | null;
}

/** Hồ sơ TNV đang đăng nhập. GET /volunteers/me */
export function useVolunteerMe() {
  return useQuery({
    queryKey: ['volunteer', 'me'],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<VolunteerProfile>>(endpoints.volunteers.me);
      return res.data.data;
    },
  });
}

/**
 * Legacy: bật/tắt sẵn sàng nhận đơn. Luồng giao hàng mới không dùng mutation này
 * để quyết định claim; giữ lại để tương thích nếu màn cũ còn gọi.
 */
export function useSetAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { isAvailable: boolean; lng?: number; lat?: number }) => {
      const res = await apiClient.patch<ApiResponse<{ isAvailable: boolean; message: string }>>(
        endpoints.volunteers.availability,
        input
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['volunteer', 'me'] });
      void qc.invalidateQueries({ queryKey: ['deliveries', 'offers'] });
    },
  });
}

/** Cập nhật vị trí hiện tại (theo dõi đơn trực tiếp). PATCH /volunteers/me/location */
export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lng: number; lat: number }) => {
      const res = await apiClient.patch<ApiResponse<{ ok: boolean }>>(
        endpoints.volunteers.location,
        input
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['volunteer', 'me'] });
    },
  });
}
