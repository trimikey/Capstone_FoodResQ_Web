import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';

/**
 * TODO [T3.1]: bổ sung field theo response thật (listing lồng, quantity,
 * pickupCode, expiresAt, createdAt...).
 */
export interface Reservation {
  id: string;
  status: string;
  qrToken?: string;
  [key: string]: unknown;
}

/** Body POST /reservations (đã verify DTO backend). */
export interface CreateReservationInput {
  listingId: string;
  quantity: number;
  notes?: string;
}

/** Danh sách đơn của tôi. Endpoint: GET /reservations/my */
export function useMyReservations() {
  return useQuery({
    queryKey: ['reservations'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Reservation[]>>(
        endpoints.reservations.list
      );
      return res.data.data;
    },
  });
}

/** Tạo đơn đặt chỗ. Endpoint: POST /reservations -> trả reservation kèm qrToken. */
export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReservationInput) => {
      const res = await apiClient.post<ApiResponse<Reservation>>(
        endpoints.reservations.create,
        input
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}
