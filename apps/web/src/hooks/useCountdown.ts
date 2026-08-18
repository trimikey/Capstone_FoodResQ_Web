'use client';

import { useEffect, useState } from 'react';

export interface CountdownState {
  /** Số giây còn lại; null khi chưa có mốc hết hạn hợp lệ. */
  remainingSeconds: number | null;
  /** Đã đến hoặc qua chính xác mốc hết hạn do server cấp. */
  expired: boolean;
}

export function getCountdownState(expiresAt?: string | null, now = Date.now()): CountdownState {
  if (!expiresAt) return { remainingSeconds: null, expired: false };

  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return { remainingSeconds: null, expired: false };

  const remainingMs = Math.max(0, expiresAtMs - now);
  return {
    remainingSeconds: Math.ceil(remainingMs / 1_000),
    expired: remainingMs === 0,
  };
}

export function formatCountdown(seconds: number): string {
  const normalized = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(normalized / 3_600);
  const minutes = Math.floor((normalized % 3_600) / 60);
  const remainingSeconds = normalized % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * Đếm theo timestamp ISO do API trả về, không suy ra từ cấu hình hoặc thời điểm FE mở trang.
 */
export function useCountdown(expiresAt?: string | null): CountdownState {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt || !Number.isFinite(new Date(expiresAt).getTime())) return;

    const update = () => {
      const current = Date.now();
      setNow(current);
      return getCountdownState(expiresAt, current).expired;
    };

    if (update()) return;

    const interval = setInterval(() => {
      if (update()) clearInterval(interval);
    }, 1_000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return getCountdownState(expiresAt, now);
}
