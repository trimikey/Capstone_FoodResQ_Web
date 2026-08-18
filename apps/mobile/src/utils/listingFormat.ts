import type { FoodCategory, QuantityUnit } from '../hooks/useListings';

// Must match the food_category enum in Postgres.
export const CATEGORY_LABELS: Record<string, string> = {
  cooked_meal: 'Món nấu chín',
  bakery: 'Bánh',
  fresh_fruit: 'Trái cây',
  beverage: 'Đồ uống',
  vegetables: 'Rau củ',
  raw_protein: 'Thịt & hải sản sống',
  dry_goods: 'Đồ khô',
  canned_packaged: 'Đồ hộp & đóng gói',
  other: 'Khác',
};

export const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  portion: 'phần',
  item: 'cái',
  box: 'hộp',
  liter: 'lít',
};

export function categoryLabel(category: FoodCategory): string {
  return CATEGORY_LABELS[category] ?? String(category);
}

export function quantityLabel(remaining: number, unit: QuantityUnit): string {
  return `${remaining} ${UNIT_LABELS[unit] ?? unit}`;
}

export function formatDistance(distanceM?: number): string | null {
  if (distanceM == null) return null;
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1).replace('.', ',')} km`;
}

const PICKUP_TIMEZONE = 'Asia/Ho_Chi_Minh';
const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

// So sánh theo ngày dương lịch giờ VN, không phải giờ local của thiết bị —
// nếu không, thiết bị chạy múi giờ khác (vd emulator mặc định UTC) sẽ lệch ngày/giờ.
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: PICKUP_TIMEZONE });
function isSameDay(a: Date, b: Date): boolean {
  return ymd.format(a) === ymd.format(b);
}

// Mốc 00:00 giờ VN của ngày chứa `ms`, quy về UTC epoch ms — dùng để tính
// biên "hôm nay/ngày mai" mà không phụ thuộc timezone của thiết bị.
export function vnDayStartMs(ms: number): number {
  const [y, m, d] = ymd.format(new Date(ms)).split('-').map(Number);
  return Date.UTC(y, m - 1, d) - VN_UTC_OFFSET_MS;
}

const hhmm = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: PICKUP_TIMEZONE,
});
const ddmm = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  timeZone: PICKUP_TIMEZONE,
});

export function formatPickupWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (isSameDay(start, end)) {
    const prefix = isSameDay(start, now)
      ? 'Hôm nay'
      : isSameDay(start, tomorrow)
        ? 'Ngày mai'
        : ddmm.format(start);
    return `${prefix} ${hhmm.format(start)} - ${hhmm.format(end)}`;
  }

  return `${ddmm.format(start)} ${hhmm.format(start)} - ${ddmm.format(end)} ${hhmm.format(end)}`;
}
