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

/** Mọi thời gian của tin đăng đều là giờ Việt Nam, không phụ thuộc múi giờ máy người dùng. */
export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1_000;

type DateValue = string | number | Date;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function asDate(value: DateValue): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Tách ngày/giờ Việt Nam từ một timestamp UTC. */
function vietnamParts(value: DateValue): { date: string; time: string } | null {
  const instant = asDate(value);
  if (Number.isNaN(instant.getTime())) return null;

  // Việt Nam không có DST, nên dịch timestamp cố định +07:00 rồi đọc bằng UTC
  // để kết quả nhất quán trên máy người dùng, SSR và API server.
  const vietnam = new Date(instant.getTime() + VIETNAM_UTC_OFFSET_MS);
  return {
    date: `${vietnam.getUTCFullYear()}-${pad(vietnam.getUTCMonth() + 1)}-${pad(vietnam.getUTCDate())}`,
    time: `${pad(vietnam.getUTCHours())}:${pad(vietnam.getUTCMinutes())}`,
  };
}

/** Chuyển ngày + giờ Provider chọn (giờ VN) thành timestamp UTC để gửi API. */
export function combineToIso(date: string, time: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match || !timeMatch) return new Date().toISOString();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return new Date().toISOString();
  }

  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute)).toISOString();
}

export function localDateTime(offsetH = 0): string {
  const parts = vietnamParts(Date.now() + offsetH * 3_600_000)!;
  return `${parts.date}T${parts.time}`;
}

/** Trả về ngày + giờ Việt Nam để điền lại vào form Provider. */
export function toLocalInput(iso: string): { date: string; time: string } {
  const parts = vietnamParts(iso);
  if (parts) return parts;

  const [date, time] = localDateTime().split('T');
  return { date, time };
}

export function toLocalInputSingle(iso: string): string {
  const { date, time } = toLocalInput(iso);
  return `${date}T${time}`;
}

/** Chuyển giá trị của input datetime-local (được hiểu là giờ VN) sang UTC. */
export function toIso(local: string): string {
  const [date, time = ''] = local.split('T');
  return combineToIso(date, time.slice(0, 5));
}

/** Định dạng giờ cố định theo múi giờ Việt Nam cho mọi màn hình listing. */
export function formatVietnamTime(value: DateValue): string {
  return vietnamParts(value)?.time ?? '—';
}

export function formatVietnamDate(value: DateValue): string {
  const date = vietnamParts(value)?.date;
  if (!date) return '—';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function formatVietnamDateTime(value: DateValue): string {
  const parts = vietnamParts(value);
  if (!parts) return '—';
  const [year, month, day] = parts.date.split('-');
  return `${day}/${month}/${year} ${parts.time}`;
}

export function isSameVietnamDate(first: DateValue, second: DateValue): boolean {
  const firstDate = vietnamParts(first)?.date;
  return firstDate != null && firstDate === vietnamParts(second)?.date;
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
      pickupAddress: source.pickupAddress ?? '',
      lng: source.lng ?? (hasProviderLocation ? (provider!.lng as number) : FALLBACK_LNG),
      lat: source.lat ?? (hasProviderLocation ? (provider!.lat as number) : FALLBACK_LAT),
      storageConditions: source.storageConditions ?? '',
      allergenNotes: source.allergenNotes ?? '',
      maxPerReservation: source.maxPerReservation ?? 1,
      imageUrl: source.imageUrls?.[0] ?? '',
    };
  }

  return {
    title: '',
    description: '',
    category: 'cooked_meal',
    quantityTotal: 10,
    quantityUnit: 'portion',
    weightPerUnitKg: '',
    pickupStartDate: '',
    pickupStartTime: '',
    pickupEndDate: '',
    pickupEndTime: '',
    expiryDate: '',
    expiryTime: '',
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
