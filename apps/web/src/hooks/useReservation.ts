import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateReservationInput } from '@/schemas/reservation.schema';

interface ReservationResult {
  reservationId: string;
  qrToken: string;
  qrExpiresAt: string;
  message: string;
}

async function createReservation(dto: CreateReservationInput): Promise<ReservationResult> {
  const { data } = await api.post<{ data: ReservationResult }>('/reservations', dto);
  return data.data;
}

async function fetchMyReservations(page = 1) {
  const { data } = await api.get('/reservations/my', { params: { page, limit: 20 } });
  return data.data as {
    items: unknown[];
    total: number;
    page: number;
    totalPages: number;
  };
}

async function cancelReservation(id: string, reason?: string) {
  const { data } = await api.patch(`/reservations/${id}/cancel`, { reason });
  return data.data as { message: string };
}

export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createReservation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['listings', 'nearby'] });
      void queryClient.invalidateQueries({ queryKey: ['reservations', 'my'] });
    },
  });
}

export function useMyReservations(page = 1) {
  return useQuery({
    queryKey: ['reservations', 'my', page],
    queryFn: () => fetchMyReservations(page),
    staleTime: 30_000,
  });
}

export function useCancelReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelReservation(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reservations', 'my'] });
      void queryClient.invalidateQueries({ queryKey: ['listings', 'nearby'] });
    },
  });
}
