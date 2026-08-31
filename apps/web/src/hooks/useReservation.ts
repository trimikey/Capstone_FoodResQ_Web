import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse } from '@foodresq/types';
import type { CreateReservationInput } from '@/schemas/reservation.schema';

interface ReservationResult {
  reservationId: string;
  qrToken: string;
  qrExpiresAt: string;
  message: string;
}

async function createReservation(dto: CreateReservationInput): Promise<ReservationResult> {
  const { data } = await api.post<ApiResponse<ReservationResult>>('/reservations', dto);
  return data.data;
}

async function fetchMyReservations(page = 1, group?: 'active' | 'history', limit = 20) {
  const { data } = await api.get('/reservations/my', { params: { page, limit, group } });
  return data.data as {
    items: unknown[];
    total: number;
    page: number;
    totalPages: number;
    /** Đếm trên TOÀN BỘ đơn (không phụ thuộc trang) — dùng cho nhãn tab và thống kê */
    counts: {
      active: number;
      history: number;
      /** Tổng số đơn từ trước tới nay (active + history). */
      allOrders: number;
      completed: number;
      cancelled: number;
      noShow: number;
      portionsSaved: number;
    };
  };
}

async function cancelReservation(id: string, reason?: string) {
  const { data } = await api.patch(`/reservations/${id}/cancel`, { reason });
  return data.data as { message: string };
}

interface PickupProofResult {
  reservationId: string;
  status: string;
  pickupProofUrl: string;
  verificationType: 'face' | 'id_card';
  message: string;
}

async function submitPickupProof(params: {
  id: string;
  verificationType: 'face' | 'id_card';
  photo: File;
}): Promise<PickupProofResult> {
  const formData = new FormData();
  formData.append('photo', params.photo);
  formData.append('verificationType', params.verificationType);
  const { data } = await api.post<ApiResponse<PickupProofResult>>(
    `/reservations/${params.id}/pickup-proof`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
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

// ── Chat theo đơn: người nhận ↔ cửa hàng ─────────────────────────────────────
export interface ReservationChatMessage {
  id: string;
  senderUserId: string;
  content: string;
  createdAt: string;
}
export interface ReservationChatParticipant {
  userId: string;
  role: 'receiver' | 'provider' | 'shipper';
  name: string;
  phone: string | null;
}
export interface ReservationChatData {
  messages: ReservationChatMessage[];
  me: string;
  /** Bên đang đối thoại trong luồng 1-1 này. */
  partner: ReservationChatParticipant;
  /** Các bên của đơn: người nhận + cửa hàng (+ shipper khi đơn có chuyến giao). */
  participants: ReservationChatParticipant[];
}

/** Hội thoại 1-1 theo đơn với một bên cụ thể; partnerId null = bên mặc định theo vai. */
export function useReservationMessages(
  reservationId: string | null,
  partnerId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['reservations', 'chat', reservationId, partnerId ?? 'default'],
    queryFn: async () =>
      (
        await api.get(`/reservations/${reservationId}/messages`, {
          params: partnerId ? { with: partnerId } : {},
        })
      ).data.data as ReservationChatData,
    enabled: enabled && !!reservationId,
    // Poll 5s khi panel đang mở — đơn giản, đủ "gần realtime" cho chat theo đơn
    refetchInterval: 5_000,
  });
}

export function useSendReservationMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p: { reservationId: string; content: string; toUserId: string }) =>
      (
        await api.post(`/reservations/${p.reservationId}/messages`, {
          content: p.content,
          toUserId: p.toUserId,
        })
      ).data.data as ReservationChatMessage,
    onSuccess: (_d, p) => {
      void queryClient.invalidateQueries({ queryKey: ['reservations', 'chat', p.reservationId] });
    },
  });
}

export function useMyReservations(page = 1, group?: 'active' | 'history', limit = 20, enabled = true) {
  return useQuery({
    queryKey: ['reservations', 'my', page, group, limit],
    queryFn: () => fetchMyReservations(page, group, limit),
    staleTime: 30_000,
    enabled,
    // Giữ dữ liệu trang cũ khi đang tải trang mới → không nhấp nháy khi phân trang
    placeholderData: (prev) => prev,
  });
}

async function rateReservation(params: {
  id: string;
  score: number;
  comment?: string;
  /** Đánh giá cửa hàng (mặc định) hay tình nguyện viên đã giao */
  target?: 'provider' | 'shipper';
}) {
  const { data } = await api.post(`/reservations/${params.id}/rating`, {
    score: params.score,
    comment: params.comment,
    target: params.target,
  });
  return data.data as { id: string; score: number; target: string; message: string };
}

export function useRateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rateReservation,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['reservations', 'my'] });
      // Trang chi tiết đọc `ratedScore` để biết đã đánh giá chưa — không làm mới thì
      // popup đánh giá sẽ hiện lại khi quay lại trang.
      void queryClient.invalidateQueries({ queryKey: ['reservations', 'detail', variables.id] });
    },
  });
}

export function useSubmitPickupProof() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitPickupProof,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reservations', 'my'] });
    },
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

async function fetchReservationDetails(id: string) {
  const { data } = await api.get(`/reservations/${id}`);
  return data.data;
}

export function useReservationDetails(id: string) {
  return useQuery({
    queryKey: ['reservations', 'detail', id],
    queryFn: () => fetchReservationDetails(id),
    enabled: !!id,
    staleTime: 10_000,
    // Tự làm mới khi đơn còn đang xử lý để bắt thời điểm NCC/TNV quét QR (confirmed → picked_up → completed)
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status;
      return status === 'confirmed' || status === 'picked_up' ? 5_000 : false;
    },
  });
}
