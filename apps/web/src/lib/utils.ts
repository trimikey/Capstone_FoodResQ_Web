import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { QuantityUnit } from '@foodresq/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Ảnh upload nằm ở /uploads trên API server (cổng 3001) → ghép origin (bỏ đuôi /api/v1).
// CHỈ prefix đường dẫn /uploads — ảnh tĩnh của web (/banh-mi.png trong public/) và
// URL http(s) giữ nguyên, nếu prefix bừa sẽ 404 vì API không serve chúng.
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');
export function mediaUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) {
    try {
      const url = new URL(path);
      if (
        (url.hostname === '10.0.2.2' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
        url.pathname.startsWith('/uploads/')
      ) {
        return `${API_ORIGIN}${url.pathname}${url.search}`;
      }
    } catch {
      return path;
    }
    return path;
  }
  return path.startsWith('/uploads') ? `${API_ORIGIN}${path}` : path;
}

// Link điều hướng Google Maps tới một toạ độ
export function mapsDirUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * Link Google Maps ghim một toạ độ.
 * Dùng dạng `search/?api=1&query=` theo tài liệu chính thức — dạng cũ `?q=lat,lng`
 * hay bị Google bỏ qua và mở về vị trí hiện tại của người dùng thay vì ghim đúng điểm.
 */
export function mapsPlaceUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// Khoảng cách đường chim bay (km) giữa 2 toạ độ — Haversine
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date) {
  const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  const diff = (new Date(date).getTime() - Date.now()) / 1000;

  if (Math.abs(diff) < 60) return rtf.format(Math.round(diff), 'second');
  if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/** Trả về nhãn tiếng Việt cho đơn vị số lượng. */
export const UNIT_LABEL: Record<QuantityUnit, string> = {
  [QuantityUnit.PORTION]: 'Phần',
  [QuantityUnit.KG]: 'Kg',
  [QuantityUnit.ITEM]: 'Cái',
  [QuantityUnit.BOX]: 'Hộp',
  [QuantityUnit.LITER]: 'Lít',
};

/** Trích thông điệp lỗi từ response API (axios) — fallback nếu không có. */
export function translateApiMessage(message: string): string {
  const parts = message
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return parts
    .map((part) => {
      const forbidden = /^property ([\w.]+) should not exist$/.exec(part);
      if (forbidden) return `truong "${forbidden[1]}" khong duoc ho tro o thao tac nay.`;

      const minLength = /^(\w+) must be longer than or equal to (\d+) characters$/.exec(part);
      if (minLength) return `${minLength[1]} phai co it nhat ${minLength[2]} ky tu.`;

      const maxLength = /^(\w+) must be shorter than or equal to (\d+) characters$/.exec(part);
      if (maxLength) return `${maxLength[1]} khong duoc vuot qua ${maxLength[2]} ky tu.`;

      if (part === 'Phone must be a valid Vietnamese mobile number') {
        return 'So dien thoai khong hop le. Vui long nhap so di dong Viet Nam.';
      }
      if (part === 'Password must contain at least one uppercase letter and one number') {
        return 'Mat khau phai co it nhat mot chu hoa va mot chu so.';
      }
      if (part === 'Unauthorized') {
        return 'Ban can dang nhap de thuc hien thao tac nay.';
      }
      return part;
    })
    .join(', ');
}

export function errMsg(e: unknown, fallback: string): string {
  return (
    (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback
  );
}
