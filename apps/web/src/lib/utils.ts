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

function apiOriginForBrowser(): string {
  if (typeof window === 'undefined') return API_ORIGIN;

  try {
    const apiUrl = new URL(API_ORIGIN);
    const pageHost = window.location.hostname;
    const apiIsLocalhost = apiUrl.hostname === 'localhost' || apiUrl.hostname === '127.0.0.1';
    const pageIsLocalhost = pageHost === 'localhost' || pageHost === '127.0.0.1';

    // Khi mở web bằng IP LAN trên điện thoại/máy khác, localhost trong NEXT_PUBLIC_API_URL
    // sẽ trỏ về thiết bị đó. Giữ nguyên port API, chỉ đổi hostname theo trang hiện tại.
    if (apiIsLocalhost && !pageIsLocalhost) {
      apiUrl.hostname = pageHost;
      return apiUrl.origin;
    }
  } catch {
    return API_ORIGIN;
  }

  return API_ORIGIN;
}

export function mediaUrl(path: string): string {
  const value = path.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  const origin = apiOriginForBrowser();
  if (value.startsWith('/api/v1/uploads')) {
    return `${origin}${value.replace(/^\/api\/v1/, '')}`;
  }
  if (value.startsWith('api/v1/uploads')) {
    return `${origin}/${value.replace(/^api\/v1\//, '')}`;
  }
  if (value.startsWith('/uploads')) return `${origin}${value}`;
  if (value.startsWith('uploads/')) return `${origin}/${value}`;
  return value;
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
const FIELD_LABELS: Record<string, string> = {
  address: 'địa chỉ',
  lng: 'kinh độ',
  lat: 'vĩ độ',
  avatarUrl: 'ảnh đại diện',
  fullName: 'họ và tên',
  phone: 'số điện thoại',
  email: 'email',
  password: 'mật khẩu',
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? `trường "${field}"`;
}

export function translateApiMessage(message: string): string {
  const parts = message
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const translated = parts.map((part) => {
    const forbidden = /^property ([\w.]+) should not exist$/.exec(part);
    if (forbidden) return `${fieldLabel(forbidden[1])} không được hỗ trợ ở thao tác này.`;

    const minLength = /^(\w+) must be longer than or equal to (\d+) characters$/.exec(part);
    if (minLength) return `${fieldLabel(minLength[1])} phải có ít nhất ${minLength[2]} ký tự.`;

    const maxLength = /^(\w+) must be shorter than or equal to (\d+) characters$/.exec(part);
    if (maxLength) return `${fieldLabel(maxLength[1])} không được vượt quá ${maxLength[2]} ký tự.`;

    const isString = /^(\w+) must be a string$/.exec(part);
    if (isString) return `${fieldLabel(isString[1])} phải là chuỗi ký tự.`;

    const isNumber = /^(\w+) must be a number/.exec(part);
    if (isNumber) return `${fieldLabel(isNumber[1])} phải là một số hợp lệ.`;

    if (part === 'Phone must be a valid Vietnamese mobile number') {
      return 'Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam.';
    }
    if (part === 'Password must contain at least one uppercase letter and one number') {
      return 'Mật khẩu phải có ít nhất một chữ hoa và một chữ số.';
    }
    if (part === 'avatarUrl must be an http(s) URL or an uploaded /uploads path') {
      return 'Ảnh đại diện phải là URL hợp lệ hoặc ảnh đã tải lên hệ thống.';
    }
    if (part === 'Unauthorized') {
      return 'Bạn cần đăng nhập để thực hiện thao tác này.';
    }
    if (part === 'Only JPEG, PNG or WebP images are allowed') {
      return 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.';
    }
    if (part === 'File content does not match its image type') {
      return 'Nội dung file không khớp với định dạng ảnh.';
    }
    if (part === 'Cannot decode image — file may be corrupted') {
      return 'Không đọc được ảnh. File có thể đã bị lỗi.';
    }
    if (part === 'Face verification requires a JPEG or PNG photo') {
      return 'Xác minh khuôn mặt cần ảnh JPEG hoặc PNG.';
    }

    return part;
  });

  return translated.join(', ');
}

export function errMsg(e: unknown, fallback: string): string {
  const message =
    (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
  return translateApiMessage(message);
}
