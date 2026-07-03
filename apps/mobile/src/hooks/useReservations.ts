import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { ReservationStatus } from './useProviderReservations';
import type { CapturedImage } from '../services/faceCapture';

export type { ReservationStatus };

/** Một đơn trong danh sách "Đơn của tôi" (GET /reservations/my → items[]). */
export interface MyReservation {
  id: string;
  status: ReservationStatus;
  quantity: number;
  qrToken: string | null;
  qrExpiresAt: string | null;
  receiverNotes: string | null;
  createdAt: string;
  ratedScore: number | null;
  listing: {
    title: string;
    pickupAddress: string;
    imageUrls: string[] | null;
    category: string;
    quantityUnit: string;
    weightPerUnitKg: number | null;
    provider: { id: string; businessName: string; userId: string };
  };
  delivery: { id: string; status: string } | null;
}

/** Chi tiết 1 đơn (GET /reservations/:id) — kèm thông tin liên hệ provider + delivery. */
export interface ReservationDetail {
  id: string;
  listingId: string;
  status: ReservationStatus;
  quantity: number;
  qrToken: string | null;
  qrExpiresAt: string | null;
  receiverNotes: string | null;
  createdAt: string;
  ratedScore: number | null;
  listing: {
    title: string;
    pickupAddress: string;
    imageUrls: string[] | null;
    category: string;
    quantityUnit: string;
    pickupStartTime: string;
    pickupEndTime: string;
    provider: {
      id: string;
      businessName: string;
      address: string | null;
      contactPhone: string | null;
      avgRating: number | null;
    };
  };
  delivery: {
    id: string;
    status: string;
    shipper: {
      user: { fullName: string; avatarUrl: string | null; phone: string | null };
    } | null;
  } | null;
}

/** Body POST /reservations (đã verify CreateReservationDto backend). */
export interface CreateReservationInput {
  listingId: string;
  quantity: number;
  receiverNotes?: string;
  requestDelivery?: boolean;
}

/** Kết quả POST /reservations — KHÔNG phải full reservation. */
export interface CreateReservationResult {
  reservationId: string;
  qrToken: string;
  qrExpiresAt: string;
  message: string;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Danh sách đơn của tôi. GET /reservations/my (phân trang, lấy gộp 50). */
export function useMyReservations() {
  return useQuery({
    queryKey: ['reservations'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Paginated<MyReservation>>>(
        endpoints.reservations.list,
        { params: { page: 1, limit: 50 } }
      );
      return res.data.data.items;
    },
  });
}

/** Chi tiết 1 đơn. GET /reservations/:id */
export function useReservationDetail(id?: string) {
  return useQuery({
    queryKey: ['reservation', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ReservationDetail>>(
        endpoints.reservations.detail(id!)
      );
      return res.data.data;
    },
  });
}

/** Tạo đơn đặt chỗ. POST /reservations → trả { reservationId, qrToken, qrExpiresAt }. */
export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReservationInput) => {
      const res = await apiClient.post<ApiResponse<CreateReservationResult>>(
        endpoints.reservations.create,
        input
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

/** Body POST /reservations/:id/rating (score 1-5, comment tuỳ chọn). */
export interface RateReservationInput {
  id: string;
  score: number;
  comment?: string;
}

/** Đánh giá nhà cung cấp sau khi nhận hàng. POST /reservations/:id/rating */
export function useRateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, score, comment }: RateReservationInput) => {
      const res = await apiClient.post<ApiResponse<{ id: string; score: number; message: string }>>(
        endpoints.reservations.rating(id),
        { score, ...(comment ? { comment } : {}) }
      );
      return res.data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
    },
  });
}

/** Body POST /reservations/:id/pickup-proof (multipart). */
export interface SubmitPickupProofInput {
  id: string;
  verificationType: 'face' | 'id_card';
  photo: CapturedImage;
}

/**
 * Nộp ảnh xác minh nhận hàng. POST /reservations/:id/pickup-proof
 * Chỉ hợp lệ khi đơn ở trạng thái picked_up và đã đăng ký khuôn mặt trước.
 * Backend so khớp khuôn mặt → chuyển đơn sang completed nếu khớp.
 */
export function useSubmitPickupProof() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, verificationType, photo }: SubmitPickupProofInput) => {
      const form = new FormData();
      form.append('photo', photo as unknown as Blob);
      form.append('verificationType', verificationType);
      const res = await apiClient.post<
        ApiResponse<{ reservationId: string; status: string; message: string }>
      >(endpoints.reservations.pickupProof(id), form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
    },
  });
}

/** Huỷ đơn đã đặt. PATCH /reservations/:id/cancel */
export function useCancelReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await apiClient.patch<ApiResponse<unknown>>(
        endpoints.reservations.cancel(id),
        { reason }
      );
      return res.data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}
