'use client';

import { useEffect, useState } from 'react';

export interface PickupWindowState {
  /** Chưa tới giờ mở nhận hàng */
  notYetOpen: boolean;
  /** Đã quá giờ kết thúc nhận hàng */
  closed: boolean;
  /** Đang trong khung giờ — chỉ lúc này mới cho đặt */
  isOpen: boolean;
  /** Đóng vì đang ngoài giờ mở cửa trong ngày (khác với hết hạn lấy) */
  outsideDaily: boolean;
  /** Số phút còn lại tới lúc đóng (null nếu chưa mở hoặc đã đóng) */
  minutesLeft: number | null;
}

const TICK_MS = 30_000;

/**
 * Trạng thái khung giờ nhận hàng của một tin đăng, TỰ CẬP NHẬT theo thời gian.
 *
 * Chốt `Date.now()` một lần lúc mount là chưa đủ: người dùng mở trang lúc 20:55 với
 * khung đóng lúc 21:00 thì tới 21:05 nút đặt vẫn bấm được, bấm xong mới nhận lỗi từ
 * server. Tick định kỳ để giao diện khoá đúng thời điểm.
 *
 * Đây chỉ là lớp hiển thị — `ReservationsService.create` vẫn là nơi quyết định.
 */
export function usePickupWindow(
  pickupStartTime?: string | null,
  pickupEndTime?: string | null,
  /** Giờ mở/đóng trong ngày (phút từ 00:00 giờ VN). Bỏ qua nếu null. */
  dailyStartMinute?: number | null,
  dailyEndMinute?: number | null,
): PickupWindowState {
  // Đọc đồng hồ trong state chứ không lúc render — render phải thuần khiết.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  if (!pickupStartTime || !pickupEndTime) {
    return { notYetOpen: false, closed: false, isOpen: true, outsideDaily: false, minutesLeft: null };
  }

  const start = new Date(pickupStartTime).getTime();
  const end = new Date(pickupEndTime).getTime();

  // Khung giờ mở cửa trong ngày (nếu tin có khai báo). Tính theo giờ VN để khớp với
  // backend, không phụ thuộc múi giờ của trình duyệt.
  let outsideDaily = false;
  if (dailyStartMinute != null && dailyEndMinute != null) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    }).formatToParts(new Date(now));
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const minuteOfDay = h * 60 + m;
    outsideDaily = minuteOfDay < dailyStartMinute || minuteOfDay >= dailyEndMinute;
  }

  const notYetOpen = now < start;
  const closed = now > end || outsideDaily;
  const isOpen = !notYetOpen && !closed;

  return {
    notYetOpen,
    closed,
    isOpen,
    outsideDaily,
    minutesLeft: isOpen ? Math.max(0, Math.floor((end - now) / 60_000)) : null,
  };
}
