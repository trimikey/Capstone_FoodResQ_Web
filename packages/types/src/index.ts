export * from './enums';

// ── API response wrappers ──────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

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
