import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { ApiResponse, Paginated } from '@foodresq/types';

function socketUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return base.replace(/\/api\/v1\/?$/, '');
}

// ── Types (khớp shape BE trả về) ────────────────────────────────────────────
interface ListingBrief {
  title: string;
  category?: string;
  pickupAddress: string;
  imageUrls: string[] | null;
  /** Chỉ có ở đơn đang giao — dùng cho popup đối chiếu lúc bàn giao. */
  quantityUnit?: string;
}

export interface DeliveryCoords {
  pickupLng: number | null;
  pickupLat: number | null;
  deliveryLng: number | null;
  deliveryLat: number | null;
}

export interface CampaignTransportBrief {
  id: string;
  status: string;
  campaignId: string;
  campaignTitle: string;
  providerName: string;
  providerAddress: string | null;
  kitchenAddress: string;
  pickupStartTime: string | null;
  pickupEndTime: string | null;
}

interface DeliverySourceFields {
  source: 'reservation' | 'campaign_transport';
  campaignTransport: CampaignTransportBrief | null;
  pickup: { address: string | null; lng: number | null; lat: number | null };
  destination: { address: string | null; lng: number | null; lat: number | null };
}

export interface TaskOffer {
  id: string;
  deliveryId: string;
  status: string;
  expiresAt: string;
  offeredAt: string;
  delivery: DeliverySourceFields & {
    id: string;
    distanceKm: number | null;
    coords: DeliveryCoords | null;
    reservation: {
      quantity: number;
      listing: ListingBrief;
      receiver: { address: string | null } | null;
      /** Ảnh bằng chứng người nhận khó di chuyển — shipper xem trước khi nhận đơn. */
      deliveryEvidenceUrl?: string | null;
    } | null;
  };
}

export interface ActiveDelivery extends DeliverySourceFields {
  id: string;
  status: 'assigned' | 'heading_to_provider' | 'qc_completed' | 'in_transit';
  qcPhotoUrl: string | null;
  deliveryProofUrl: string | null;
  distanceKm: number | null;
  coords: DeliveryCoords | null;
  reservation: {
    id: string;
    quantity: number;
    listing: ListingBrief;
    receiver: {
      address: string | null;
      /** Ảnh đã đăng ký — shipper đối chiếu đúng người trước khi bàn giao. */
      faceImageUrl?: string | null;
      idCardImageUrl?: string | null;
      idCardNumber?: string | null;
      user: { fullName: string; phone: string | null };
    } | null;
    /** Ảnh bằng chứng khó di chuyển của người nhận. */
    deliveryEvidenceUrl?: string | null;
  } | null;
}

export interface DeliveryHistoryItem extends DeliverySourceFields {
  id: string;
  status: 'delivered' | 'failed';
  distanceKm: number | null;
  deliveredAt: string | null;
  deliveryProofUrl: string | null;
  failedReason: string | null;
  createdAt: string;
  coords: DeliveryCoords | null;
  // Mốc thời gian + ảnh minh chứng cho phần "Chi tiết" — BE đã trả sẵn trong
  // GET /deliveries/my/history (findMany trả toàn bộ cột của bảng deliveries).
  assignedAt: string | null;
  /** Luôn null với đơn lẻ: BE chỉ ghi mốc lấy hàng vào `qcPhotoAt`. */
  pickedUpAt: string | null;
  qcPhotoUrl: string | null;
  qcPhotoAt: string | null;
  deliveryProofAt: string | null;
  reservation: {
    quantity: number;
    listing: ListingBrief;
    receiver: { address?: string | null; user: { fullName: string } } | null;
  } | null;
}

export interface VolunteerMe {
  id: string;
  isAvailable: boolean;
  dedicationPoints: number;
  rank: string;
  vehicleType: string | null;
  vehiclePlate: string | null;
  avgRating: number | null;
  verificationStatus: string;
  isShipper: boolean;
  specializations: { specialization: 'chef' | 'waiter' | 'shipper'; isVerified: boolean }[];
  currentLocation: { lng: number; lat: number } | null;
}

// ── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchVolunteerMe(): Promise<VolunteerMe> {
  const { data } = await api.get<ApiResponse<VolunteerMe>>('/volunteers/me');
  return data.data;
}
async function fetchActiveDelivery(): Promise<ActiveDelivery | null> {
  const { data } = await api.get<ApiResponse<ActiveDelivery | null>>('/deliveries/my/active');
  return data.data;
}
export type DeliveryHistoryResult = Paginated<DeliveryHistoryItem>;
async function fetchDeliveryHistory(page: number, limit: number): Promise<DeliveryHistoryResult> {
  const { data } = await api.get<ApiResponse<DeliveryHistoryResult>>('/deliveries/my/history', { params: { page, limit } });
  return data.data;
}

// ── Queries ──────────────────────────────────────────────────────────────────
export function useVolunteerMe(enabled = true) {
  return useQuery({ queryKey: ['volunteers', 'me'], queryFn: fetchVolunteerMe, staleTime: 60_000, enabled });
}
export interface ShipperStats {
  totalDelivered: number;
  todayDelivered: number;
  totalFailed: number;
  completionRate: number | null;
  totalKm: number;
  dedicationPoints: number;
  rank: string;
  avgRating: number | null;
}
export function useShipperStats(enabled = true) {
  return useQuery({
    queryKey: ['deliveries', 'stats'],
    queryFn: async () => (await api.get<ApiResponse<ShipperStats>>('/deliveries/my/stats')).data.data,
    staleTime: 60_000,
    enabled,
  });
}

export function useDeliveryHistory(params: { page?: number; limit?: number; enabled?: boolean } = {}) {
  const { page = 1, limit = 20, enabled = true } = params;
  return useQuery({
    queryKey: ['deliveries', 'history', page, limit],
    queryFn: () => fetchDeliveryHistory(page, limit),
    staleTime: 60_000,
    enabled,
    placeholderData: (prev) => prev, // giữ trang cũ khi đang tải trang mới
  });
}
export function useActiveDelivery(enabled = true) {
  return useQuery({
    queryKey: ['deliveries', 'active'],
    queryFn: fetchActiveDelivery,
    refetchInterval: 15_000,
    enabled,
  });
}

export interface ShipperRating {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  listingTitle: string | null;
  raterName: string | null;
}

export interface ShipperRatingsPage {
  items: ShipperRating[];
  total: number;
  page: number;
  totalPages: number;
  avgRating: number | null;
  /** Số lượt theo từng mức sao, dùng vẽ biểu đồ phân bố */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/** Shipper: đánh giá đã nhận được từ người nhận. */
export function useMyRatings(page = 1, enabled = true) {
  return useQuery({
    queryKey: ['deliveries', 'my-ratings', page],
    queryFn: async () =>
      (await api.get<ApiResponse<ShipperRatingsPage>>('/deliveries/my/ratings', { params: { page } }))
        .data.data,
    enabled,
    placeholderData: (prev) => prev,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────
export function useSetAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { isAvailable: boolean; lng?: number; lat?: number }) => {
      const { data } = await api.patch('/volunteers/me/availability', input);
      return data.data as { isAvailable: boolean; message: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['volunteers', 'me'] });
    },
  });
}

export interface DeliveryTracking {
  /** ID đơn giao hàng — dùng để gọi API hủy tìm shipper */
  deliveryId: string;
  /** Trạng thái giao hàng: pending_assignment → assigned → heading_to_provider → qc_completed → in_transit → delivered/failed/cancelled */
  status: 'pending_assignment' | 'assigned' | 'heading_to_provider' | 'qc_completed' | 'in_transit' | 'delivered' | 'failed' | 'cancelled';
  /** Lý do thất bại (vd: không có tình nguyện viên nào nhận) — chỉ có khi status=failed. */
  failedReason: string | null;
  /**
   * Hạn tìm shipper TUYỆT ĐỐI (ISO), tính từ lúc tạo đơn. Đếm ngược theo mốc này
   * thay vì đếm từ lúc mở trang — nếu không, reload sẽ nhảy về 4:30. Null khi đơn
   * đã rời trạng thái pending_assignment.
   */
  searchExpiresAt: string | null;
  distanceKm: number | null;
  listingTitle: string;
  pickupAddress: string;
  coords: DeliveryCoords | null;
  shipper: { name: string; phone: string | null; location: { lng: number; lat: number } | null } | null;
}
export function useDeliveryTracking(reservationId: string, enabled: boolean) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['deliveries', 'track', reservationId],
    queryFn: async () => (await api.get<ApiResponse<DeliveryTracking>>(`/deliveries/track/${reservationId}`)).data.data,
    enabled,
    refetchInterval: 15_000, // fallback poll; real-time qua socket bên dưới
  });

  // Nghe `delivery:location` để cập nhật vị trí shipper tức thì (không chờ poll)
  useEffect(() => {
    if (!enabled || !reservationId || !accessToken) return;
    const socket: Socket = io(socketUrl(), {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
    });
    socket.on('delivery:location', (p: { reservationId: string; lng: number; lat: number }) => {
      if (p.reservationId !== reservationId) return;
      const prev = qc.getQueryData<DeliveryTracking>(['deliveries', 'track', reservationId]);
      if (prev?.shipper) {
        qc.setQueryData<DeliveryTracking>(['deliveries', 'track', reservationId], {
          ...prev,
          shipper: { ...prev.shipper, location: { lng: p.lng, lat: p.lat } },
        });
      } else {
        // Cache chưa có shipper (snapshot lúc còn pending_assignment) → refetch để lấy tên/SĐT + vị trí
        void qc.invalidateQueries({ queryKey: ['deliveries', 'track', reservationId] });
      }
    });
    // Hết 4ph30 không ai nhận → BE bắn sự kiện này; refetch ngay để hiện thông báo đặt lại
    socket.on('delivery:unassigned', (p: { reservationId: string }) => {
      if (p.reservationId !== reservationId) return;
      void qc.invalidateQueries({ queryKey: ['deliveries', 'track', reservationId] });
    });
    // Shipper vừa nhận đơn → refetch ngay để lấy tên/SĐT shipper
    socket.on('delivery:assigned', (p: { reservationId: string }) => {
      if (p.reservationId !== reservationId) return;
      void qc.invalidateQueries({ queryKey: ['deliveries', 'track', reservationId] });
    });
    return () => {
      socket.off('delivery:location');
      socket.off('delivery:unassigned');
      socket.off('delivery:assigned');
      socket.disconnect();
    };
  }, [enabled, reservationId, accessToken, qc]);

  return query;
}

// Shipper: đẩy vị trí hiện tại (theo dõi trực tiếp)
export function useUpdateMyLocation() {
  return useMutation({
    mutationFn: async (p: { lng: number; lat: number }) =>
      (await api.patch('/volunteers/me/location', p)).data.data,
  });
}

export function useCancelDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { deliveryId: string; reason?: string }) =>
      (await api.post(`/deliveries/${p.deliveryId}/cancel`, { reason: p.reason })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteers', 'me'] });
    },
  });
}

/** Người nhận hủy tìm shipper → chuyển sang tự đến lấy */
export function useCancelDeliverySearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: string }) =>
      (await api.post(`/deliveries/${params.deliveryId}/receiver-cancel`)).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries', 'track'] });
      void qc.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}

export function useFailDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { deliveryId: string; reason: string }) =>
      (await api.post(`/deliveries/${p.deliveryId}/fail`, { reason: p.reason })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteers', 'me'] });
    },
  });
}

export function useUpdateDeliveryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: string; status: string; photo?: File; qrToken?: string }) => {
      const form = new FormData();
      form.append('status', params.status);
      if (params.photo) form.append('photo', params.photo);
      if (params.qrToken) form.append('qrToken', params.qrToken);
      const { data } = await api.patch(`/deliveries/${params.deliveryId}/status`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteers', 'me'] });
    },
  });
}

// ─── Lịch rảnh hằng tuần của TNV (lưới 7 ngày × 4 ca) ────────────────────────
// Đây là KHAI BÁO Ý ĐỊNH để lọc/gợi ý ca, KHÔNG phải cam kết nhận việc:
// TNV vẫn phải tự đăng ký ca và tổ chức vẫn phải duyệt như cũ.

export type ShiftPeriod = 'midnight' | 'morning' | 'afternoon' | 'evening';

export interface AvailabilitySlot {
  /** 1 = Thứ 2 … 7 = Chủ nhật (ISO-8601). */
  dayOfWeek: number;
  period: ShiftPeriod;
}

export interface WeeklyAvailability {
  slots: AvailabilitySlot[];
  /** Lần cập nhật gần nhất — dùng nhắc TNV rà lại khi lịch đã cũ. */
  updatedAt: string | null;
}

export function useMyWeeklyAvailability(enabled = true) {
  return useQuery({
    queryKey: ['volunteers', 'weekly-availability'],
    queryFn: async () =>
      (await api.get('/volunteers/me/weekly-availability')).data.data as WeeklyAvailability,
    enabled,
    staleTime: 60_000,
  });
}

export function useSetMyWeeklyAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slots: AvailabilitySlot[]) =>
      (await api.put('/volunteers/me/weekly-availability', { slots })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['volunteers', 'weekly-availability'] });
    },
  });
}

// ─── Mô hình mới: đăng ký ca giao hàng + tự chọn đơn (thay mời tuần tự 15s) ───

export interface DeliveryShiftSlot {
  workDate: string;
  period: ShiftPeriod;
}

export interface DeliveryShiftsData {
  isShipper: boolean;
  slots: DeliveryShiftSlot[];
  window: {
    alwaysOpen: boolean;
    open: boolean;
    opensAt: string | null;
    closesAt: string | null;
    nextOpensAt: string | null;
    /** Tuần đang được phép đăng ký (YYYY-MM-DD) — null khi luôn mở. */
    editableFrom: string | null;
    editableTo: string | null;
  };
}

export function useMyDeliveryShifts(enabled = true) {
  return useQuery({
    queryKey: ['volunteers', 'delivery-shifts'],
    queryFn: async () => (await api.get('/volunteers/me/delivery-shifts')).data.data as DeliveryShiftsData,
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Ghi đè ca giao hàng trong ĐÚNG khoảng `from → to` đang hiển thị.
 *
 * Phải gửi kèm khoảng: lưới chỉ hiện một tuần, còn quyền sửa có thể trải rộng hơn —
 * thiếu khoảng thì server ghi đè toàn bộ và xoá mất ca của những tuần không nhìn thấy.
 */
export function useSetMyDeliveryShifts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { slots: DeliveryShiftSlot[]; from: string; to: string }) =>
      (await api.put('/volunteers/me/delivery-shifts', p)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['volunteers', 'delivery-shifts'] }),
  });
}

export interface NearbyDelivery {
  deliveryId: string;
  createdAt: string;
  /** Điểm lấy hàng cách vị trí hiện tại của shipper (km). */
  distanceKm: number;
  /** Quãng lấy → giao (km). */
  tripKm: number | null;
  listingTitle: string;
  pickupAddress: string;
  imageUrls: string[];
  deliveryAddress: string | null;
  deliveryScheduledAt: string | null;
  deliveryEvidenceUrl: string | null;
  /** Ca của shipper có phủ thời điểm giao đơn này không (và không bận ca chiến dịch). */
  canClaim: boolean;
  /** Khung giờ này shipper đã xác nhận một ca chiến dịch → bận, không nhận đơn lẻ. */
  busyWithCampaign?: boolean;
  claimSlot: { workDate: string; period: ShiftPeriod };
}

export function useNearbyDeliveries(coords: { lng: number; lat: number } | null) {
  return useQuery({
    queryKey: ['deliveries', 'nearby', coords],
    queryFn: async () =>
      (await api.get('/deliveries/nearby', { params: coords! })).data.data as NearbyDelivery[],
    enabled: !!coords,
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
  });
}

export function useClaimDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: string) =>
      (await api.post(`/deliveries/${deliveryId}/claim`)).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteers', 'me'] });
    },
  });
}
