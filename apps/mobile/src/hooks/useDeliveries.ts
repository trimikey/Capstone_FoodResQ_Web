import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { CapturedImage } from '../services/faceCapture';

export type DeliveryStatus =
  | 'pending_assignment'
  | 'assigned'
  | 'heading_to_provider'
  | 'qc_completed'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | (string & {});

export interface DeliveryTracking {
  status: DeliveryStatus;
  distanceKm: number | null;
  listingTitle: string;
  pickupAddress: string;
  coords: unknown;
  shipper: {
    name: string;
    phone: string | null;
    location: { lng: number; lat: number } | null;
  } | null;
}

/**
 * Theo dõi đơn giao tận nơi (receiver). GET /deliveries/track/:reservationId
 * Poll mỗi 15s để cập nhật trạng thái + vị trí shipper (backend pull-based).
 */
export function useDeliveryTracking(reservationId?: string, enabled = true) {
  return useQuery({
    queryKey: ['delivery-tracking', reservationId],
    enabled: !!reservationId && enabled,
    refetchInterval: 15000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<DeliveryTracking>>(
        endpoints.deliveries.track(reservationId!)
      );
      return res.data.data;
    },
  });
}

// ── Volunteer (shipper): giao hàng ────────────────────────────────────────────

/** Toạ độ lấy/giao của 1 đơn (cột geography backend trả qua ST_X/ST_Y). */
export interface DeliveryCoords {
  pickupLng: number | null;
  pickupLat: number | null;
  deliveryLng: number | null;
  deliveryLat: number | null;
}

interface ListingBrief {
  title: string;
  pickupAddress: string;
  imageUrls: string[] | null;
}

/** Một lời mời giao hàng đang chờ (GET /deliveries/my/offers). */
export interface TaskOffer {
  id: string;
  deliveryId: string;
  status: string;
  offeredAt: string;
  expiresAt: string;
  delivery: {
    id: string;
    status: DeliveryStatus;
    distanceKm: number | null;
    reservation: {
      quantity: number;
      listing: ListingBrief;
      receiver: { address: string | null } | null;
    };
    coords: DeliveryCoords | null;
  };
}

/** Đơn đang giao của shipper (GET /deliveries/my/active). */
export interface ActiveDelivery {
  id: string;
  status: DeliveryStatus;
  distanceKm: number | null;
  qcPhotoUrl: string | null;
  deliveryProofUrl: string | null;
  reservation: {
    id: string;
    quantity: number;
    listing: ListingBrief;
    receiver: {
      address: string | null;
      user: { fullName: string; phone: string | null };
    } | null;
  };
  coords: DeliveryCoords | null;
}

/** Một chuyến trong lịch sử (GET /deliveries/my/history). */
export interface DeliveryHistoryItem {
  id: string;
  status: DeliveryStatus;
  distanceKm: number | null;
  deliveredAt: string | null;
  failedReason: string | null;
  reservation: {
    quantity: number;
    listing: ListingBrief;
    receiver: { user: { fullName: string } } | null;
  };
}

/** Bảng thành tích shipper (GET /deliveries/my/stats). */
export interface DeliveryStats {
  totalDelivered: number;
  todayDelivered: number;
  totalFailed: number;
  completionRate: number | null;
  totalKm: number;
  dedicationPoints: number;
  rank: string;
  avgRating: number | null;
}

interface Paginated<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Lời mời giao hàng đang chờ. Poll 15s để bắt offer mới. */
export function useMyOffers(enabled = true) {
  return useQuery({
    queryKey: ['deliveries', 'offers'],
    enabled,
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<TaskOffer[]>>(endpoints.deliveries.myOffers);
      return res.data.data;
    },
  });
}

/** Đơn đang giao (1 đơn tại 1 thời điểm). Poll 15s. */
export function useActiveDelivery(enabled = true) {
  return useQuery({
    queryKey: ['deliveries', 'active'],
    enabled,
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ActiveDelivery | null>>(
        endpoints.deliveries.myActive
      );
      return res.data.data;
    },
  });
}

/** Lịch sử giao hàng (đã giao / thất bại), phân trang server-side. */
export function useDeliveryHistory(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['deliveries', 'history', page, limit],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Paginated<DeliveryHistoryItem>>>(
        endpoints.deliveries.myHistory,
        { params: { page, limit } }
      );
      return res.data.data;
    },
  });
}

/** Bảng thành tích shipper. */
export function useDeliveryStats() {
  return useQuery({
    queryKey: ['deliveries', 'stats'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<DeliveryStats>>(endpoints.deliveries.myStats);
      return res.data.data;
    },
  });
}

/** Chấp nhận lời mời. POST /deliveries/:id/accept */
export function useAcceptOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: string) => {
      const res = await apiClient.post<ApiResponse<unknown>>(endpoints.deliveries.accept(deliveryId));
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteer', 'me'] });
    },
  });
}

/** Từ chối lời mời. POST /deliveries/:id/reject {reason?} */
export function useRejectOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: string; reason?: string }) => {
      const res = await apiClient.post<ApiResponse<unknown>>(
        endpoints.deliveries.reject(params.deliveryId),
        params.reason ? { reason: params.reason } : {}
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries', 'offers'] });
    },
  });
}

/** Huỷ nhận đơn TRƯỚC khi lấy hàng. POST /deliveries/:id/cancel {reason?} */
export function useCancelAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: string; reason?: string }) => {
      const res = await apiClient.post<ApiResponse<unknown>>(
        endpoints.deliveries.cancel(params.deliveryId),
        params.reason ? { reason: params.reason } : {}
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteer', 'me'] });
    },
  });
}

/** Báo giao thất bại (sau khi đã lấy hàng) — bắt buộc lý do. POST /deliveries/:id/fail */
export function useFailDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: string; reason: string }) => {
      const res = await apiClient.post<ApiResponse<unknown>>(endpoints.deliveries.fail(params.deliveryId), {
        reason: params.reason,
      });
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteer', 'me'] });
    },
  });
}

/**
 * Chuyển bước trạng thái đơn giao. PATCH /deliveries/:id/status (multipart).
 * `photo` là ảnh QC/proof (bắt buộc khi chuyển sang qc_completed) — dùng
 * faceCapture.ts để chụp, append field `photo`.
 */
export function useUpdateDeliveryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: string; status: DeliveryStatus; photo?: CapturedImage }) => {
      const form = new FormData();
      form.append('status', params.status);
      if (params.photo) form.append('photo', params.photo as unknown as Blob);
      const res = await apiClient.patch<ApiResponse<unknown>>(
        endpoints.deliveries.updateStatus(params.deliveryId),
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteer', 'me'] });
    },
  });
}
