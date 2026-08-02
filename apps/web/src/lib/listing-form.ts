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
  // Use LOCAL getters so the input shows the time the user actually picked
  // (not the UTC equivalent — which would be off by the timezone offset).
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
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
  // `new Date(`${date}T${time}`)` (no Z/offset) is parsed as LOCAL time by the browser.
  // `.toISOString()` then converts that local instant to UTC correctly.
  // The previous implementation subtracted `getTimezoneOffset()` from an already-UTC timestamp,
  // producing a double-offset bug (e.g. +7h on UTC+7 machines, offset 15:03 → 22:03 in DB).
  return new Date(`${date}T${time}`).toISOString();
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
