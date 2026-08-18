'use client';

import { useEffect, useState } from 'react';

export interface PickupWindowState {
  /** Chưa tới mốc bắt đầu nhận hàng */
  notYetOpen: boolean;
  /** Đã qua mốc hạn lấy */
  closed: boolean;
  /** Đang trong khoảng Provider đã chọn */
  isOpen: boolean;
  /** Số phút còn lại tới hạn lấy (null nếu chưa mở hoặc đã đóng) */
  minutesLeft: number | null;
}

const TICK_MS = 30_000;

/**
 * Phần thuần để giao diện và test dùng cùng quy tắc thời gian. Chỉ hai mốc tuyệt đối
 * Provider chọn (pickupStartTime → pickupEndTime) quyết định có thể đặt hay không.
 */
export function getPickupWindowState(
  pickupStartTime?: string | null,
  pickupEndTime?: string | null,
  now = Date.now(),
): PickupWindowState {
  if (!pickupStartTime || !pickupEndTime) {
    return { notYetOpen: false, closed: false, isOpen: true, minutesLeft: null };
  }

  const start = new Date(pickupStartTime).getTime();
  const end = new Date(pickupEndTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { notYetOpen: false, closed: true, isOpen: false, minutesLeft: null };
  }

  const notYetOpen = now < start;
  const closed = now >= end;
  const isOpen = !notYetOpen && !closed;

  return {
    notYetOpen,
    closed,
    isOpen,
    minutesLeft: isOpen ? Math.max(0, Math.floor((end - now) / 60_000)) : null,
  };
}

/**
 * Trạng thái khung giờ nhận hàng của một tin đăng, tự cập nhật theo thời gian.
 * Đây chỉ là lớp hiển thị — `ReservationsService.create` vẫn là nơi quyết định.
 */
export function usePickupWindow(
  pickupStartTime?: string | null,
  pickupEndTime?: string | null,
): PickupWindowState {
  // Đọc đồng hồ trong state chứ không lúc render — render phải thuần khiết.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return getPickupWindowState(pickupStartTime, pickupEndTime, now);
}
