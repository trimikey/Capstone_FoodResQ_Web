export * from './enums';

import type { BulkRunStatus } from './enums';

// ── API response wrappers ──────────────────────────────────────────────────────

/**
 * Vỏ thành công — khớp apps/api TransformInterceptor: { success: true, data }.
 * LƯU Ý: backend KHÔNG trả `meta` ngang hàng với `data`. Với danh sách phân trang,
 * `data` chính là `Paginated<T>` / `PaginatedFlat<T>` (meta nằm bên trong).
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
}

/** Vỏ thất bại — khớp apps/api GlobalExceptionFilter. */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Danh sách phân trang — shape MỚI (khuyến nghị): admin, deliveries, recipes. */
export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Danh sách phân trang — shape CŨ (phẳng): listings, reservations.
 * ⚠️ Tồn tại song song với `Paginated<T>`; nên hợp nhất dần về `Paginated<T>`.
 */
export interface PaginatedFlat<T> extends PaginationMeta {
  items: T[];
}

/** Cặp token trả từ /auth/login, /auth/register, /auth/refresh, /auth/google. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ── Geo helpers ────────────────────────────────────────────────────────────────

export interface GeoPoint {
  lng: number;
  lat: number;
}

// ── Trust Score config (mirrors system_configs.TRUST_SCORE_RULES) ─────────────

export interface TrustScoreRules {
  late_cancellation: number;
  no_show: number;
  food_safety_violation: number;
  successful_rescue: number;
  high_rating_received: number;
  ban_threshold: number;
  restrict_threshold: number;
}

// ── WebSocket event names ──────────────────────────────────────────────────────

export const WS_EVENTS = {
  RESERVATION_CONFIRMED: 'reservation:confirmed',
  RESERVATION_EXPIRING: 'reservation:expiring',
  TASK_OFFER_RECEIVED: 'task:offer:received',
  TASK_OFFER_EXPIRED: 'task:offer:expired',
  NOTIFICATION_NEW: 'notification:new',
  TRUST_SCORE_CHANGED: 'trust_score:changed',
} as const;

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

// ── Bulk run contracts ───────────────────────────────────────────────────────

export interface BulkRunStop {
  id: string;
  label: string;
  address: string | null;
  plannedQty: number | null;
  servedQty: number;
  photoUrl: string | null;
  note: string | null;
  createdBy: 'provider' | 'shipper' | (string & {});
  orderIndex: number;
  servedAt: string | null;
  coords: GeoPoint | null;
  reservation?: {
    qrToken: string;
    qrExpiresAt: string;
  } | null;
}

export interface BulkRun {
  id: string;
  listingId: string;
  quantity: number;
  quantityDistributed: number;
  status: BulkRunStatus;
  note: string | null;
  rejectReason: string | null;
  qcPhotoUrl: string | null;
  createdAt: string;
  approvedAt: string | null;
  pickedUpAt: string | null;
  completedAt: string | null;
  pickupCoords: GeoPoint | null;
  /**
   * Hạn chót của giai đoạn hiện tại (ISO): chờ duyệt → hạn duyệt; đã duyệt → hạn đến
   * lấy hàng; đã lấy hàng → hạn phát xong. Null khi chuyến đã kết thúc.
   */
  deadlineAt?: string | null;
  listing: {
    title: string;
    pickupAddress: string;
    imageUrls?: string[] | null;
    /** Đơn vị của tin gốc (phần/kg/cái/lít…) — để chi tiết chuyến không ghi bừa "phần" */
    quantityUnit?: string;
  };
  provider?: {
    businessName: string;
    contactPhone: string | null;
  };
  shipper?: {
    id?: string;
    rank: string;
    dedicationPoints: number;
    /** Điểm đánh giá trung bình do người nhận chấm (null nếu chưa có lượt nào) */
    avgRating?: number | null;
    user: {
      fullName: string;
      phone: string | null;
      /** Điểm uy tín hiện tại — cơ sở để NCC quyết định duyệt hay từ chối */
      trustScore?: number;
    };
  };
  /** Thành tích của shipper, chỉ trả về ở API phía nhà cung cấp */
  shipperStats?: {
    completedRuns: number;
    deliveredOrders: number;
    failedOrders: number;
  } | null;
  stops: BulkRunStop[];
}
