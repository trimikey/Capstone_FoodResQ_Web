import type { ProviderListing } from '@/hooks/useProviderListings';

export interface ListingForm {
  title: string;
  description: string;
  category: string;
  quantityTotal: number;
  quantityUnit: string;
  weightPerUnitKg: string | number;
  pickupStartDate: string;
  pickupStartTime: string;
  pickupEndDate: string;
  pickupEndTime: string;
  expiryDate: string;
  expiryTime: string;
  /** Giờ mở nhận trong ngày, dạng "HH:mm" — khác với mốc bắt đầu/hạn lấy ở trên */
  dailyStart: string;
  /** Giờ đóng nhận trong ngày, dạng "HH:mm" */
  dailyEnd: string;
  pickupAddress: string;
  lng: number;
  lat: number;
  storageConditions: string;
  allergenNotes: string;
  maxPerReservation: number;
  imageUrl: string;
}

const FALLBACK_LNG = 106.6297;
const FALLBACK_LAT = 10.8231;

/** "07:00" → 420. Trả null nếu chuỗi rỗng/không hợp lệ. */
export function hhmmToMinute(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 420 → "07:00" */
export function minuteToHHmm(v?: number | null): string | null {
  if (v == null) return null;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

export function localDateTime(offsetH = 0): string {
  const d = new Date(Date.now() + offsetH * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toLocalInput(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const now = localDateTime(0).split('T');
    return { date: now[0], time: now[1] };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  // Use UTC getters to get the correct local date/time components
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

export function toLocalInputSingle(iso: string): string {
  const { date, time } = toLocalInput(iso);
  return `${date}T${time}`;
}

export function toIso(local: string): string {
  return new Date(local).toISOString();
}

export function combineToIso(date: string, time: string): string {
  if (!date || !time) return new Date().toISOString();
  // Parse as local time, then convert to UTC ISO string
  const localDateTime = new Date(`${date}T${time}`);
  // Get the local offset and apply it to get UTC time
  const utcDateTime = new Date(localDateTime.getTime() - localDateTime.getTimezoneOffset() * 60_000);
  return utcDateTime.toISOString();
}

export function buildForm(
  provider: { address?: string | null; lng?: number | null; lat?: number | null } | null | undefined,
  source?: ProviderListing | null,
): ListingForm {
  const hasProviderLocation = !!(provider && provider.lng != null && provider.lat != null);

  if (source) {
    const start = toLocalInput(source.pickupStartTime);
    const end = toLocalInput(source.pickupEndTime);
    const expiry = toLocalInput(source.expiryTime);
    return {
      title: source.title ?? '',
      description: source.description ?? '',
      category: source.category ?? 'cooked_meal',
      quantityTotal: Number(source.quantityTotal) || 1,
      quantityUnit: source.quantityUnit ?? 'portion',
      weightPerUnitKg: source.weightPerUnitKg ?? '',
      pickupStartDate: start.date,
      pickupStartTime: start.time,
      pickupEndDate: end.date,
      pickupEndTime: end.time,
      expiryDate: expiry.date,
      expiryTime: expiry.time,
      dailyStart: minuteToHHmm(source.dailyStartMinute) ?? '07:00',
      dailyEnd: minuteToHHmm(source.dailyEndMinute) ?? '21:00',
      pickupAddress: source.pickupAddress ?? '',
      lng: source.lng ?? (hasProviderLocation ? (provider!.lng as number) : FALLBACK_LNG),
      lat: source.lat ?? (hasProviderLocation ? (provider!.lat as number) : FALLBACK_LAT),
      storageConditions: source.storageConditions ?? '',
      allergenNotes: source.allergenNotes ?? '',
      maxPerReservation: source.maxPerReservation ?? 1,
      imageUrl: source.imageUrls?.[0] ?? '',
    };
  }

  const now = localDateTime(0).split('T');
  const in24h = localDateTime(24).split('T');
  const in48h = localDateTime(48).split('T');

  return {
    title: '',
    description: '',
    category: 'cooked_meal',
    quantityTotal: 10,
    quantityUnit: 'portion',
    weightPerUnitKg: '',
    pickupStartDate: now[0],
    pickupStartTime: now[1],
    pickupEndDate: in24h[0],
    pickupEndTime: in24h[1],
    expiryDate: in48h[0],
    expiryTime: in48h[1],
    // Mặc định giờ hành chính mở rộng — hợp với đa số cửa hàng ăn uống
    dailyStart: '07:00',
    dailyEnd: '21:00',
    pickupAddress: provider?.address ?? '',
    lng: hasProviderLocation ? (provider!.lng as number) : FALLBACK_LNG,
    lat: hasProviderLocation ? (provider!.lat as number) : FALLBACK_LAT,
    storageConditions: '',
    allergenNotes: '',
    maxPerReservation: 3,
    imageUrl: '',
  };
}

export const DEFAULT_CATEGORIES = [
  { value: 'cooked_meal', label: 'Suất ăn sẵn', icon: 'restaurant' },
  { value: 'bakery', label: 'Bánh ngọt & Tráng miệng', icon: 'bakery_dining' },
  { value: 'fresh_fruit', label: 'Trái cây tươi', icon: 'nutrition' },
  { value: 'beverage', label: 'Đồ uống', icon: 'local_drink' },
  { value: 'vegetables', label: 'Rau củ quả', icon: 'eco' },
  { value: 'raw_protein', label: 'Thịt, cá, trứng', icon: 'set_meal' },
  { value: 'dry_goods', label: 'Đồ khô', icon: 'inventory_2' },
  { value: 'canned_packaged', label: 'Đồ hộp / đóng gói', icon: 'inventory' },
  { value: 'other', label: 'Khác', icon: 'category' },
] as const;

export const DEFAULT_UNITS = [
  { value: 'portion', label: 'Phần' },
  { value: 'kg', label: 'Kg' },
  { value: 'item', label: 'Cái' },
  { value: 'box', label: 'Hộp' },
  { value: 'liter', label: 'Lít' },
] as const;
