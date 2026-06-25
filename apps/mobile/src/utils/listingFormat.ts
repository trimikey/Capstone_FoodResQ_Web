import type { FoodCategory, QuantityUnit } from '../hooks/useListings';

// Phải khớp enum food_category trong Postgres (9 giá trị). Gửi category
// ngoài danh sách → backend trả 400 (làm filter "không hoạt động").
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

/** Nhãn category vi-VN; fallback về chính chuỗi nếu chưa có nhãn. */
export function categoryLabel(category: FoodCategory): string {
  return CATEGORY_LABELS[category] ?? String(category);
}

/** Badge số lượng còn lại, vd "38 kg", "5 phần". */
export function quantityLabel(remaining: number, unit: QuantityUnit): string {
  return `${remaining} ${UNIT_LABELS[unit] ?? unit}`;
}

/** Khoảng cách: undefined → null (ẩn); <1km → "m"; ngược lại "km" (vi-VN). */
export function formatDistance(distanceM?: number): string | null {
  if (distanceM == null) return null;
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1).replace('.', ',')} km`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const hhmm = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });
const ddmm = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' });

/**
 * Khung giờ nhận hàng. Cùng ngày → "Hôm nay 14:00 - 17:00",
 * ngày mai → "Ngày mai ...", khác → "22/06 14:00 → 23/06 10:00".
 */
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
  return `${ddmm.format(start)} ${hhmm.format(start)} → ${ddmm.format(end)} ${hhmm.format(end)}`;
}
