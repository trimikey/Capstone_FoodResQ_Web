/**
 * Khung giờ trong ngày còn nhận đặt hàng, tính bằng SỐ PHÚT TỪ 00:00 giờ Việt Nam.
 *
 * Hai tầng chồng lên nhau:
 *  - Sàn: `PLATFORM_ORDER_OPEN_MINUTE` → `PLATFORM_ORDER_CLOSE_MINUTE`, áp cho mọi tin.
 *    Không có nó thì người dùng đặt lúc 2 giờ sáng và tình nguyện viên phải đi giao.
 *  - Cửa hàng: `daily_start_minute` / `daily_end_minute` do NCC tự khai, tuỳ chọn.
 *
 * Kết quả là phần GIAO NHAU — cửa hàng chỉ được thu hẹp, không nới rộng giờ sàn.
 */
export interface OrderWindow {
  openMinute: number;
  closeMinute: number;
}

export function effectiveOrderWindow(
  platform: OrderWindow,
  listingOpen: number | null | undefined,
  listingClose: number | null | undefined,
): OrderWindow {
  return {
    openMinute: Math.max(platform.openMinute, listingOpen ?? 0),
    closeMinute: Math.min(platform.closeMinute, listingClose ?? 1440),
  };
}

/** Khung rỗng = cửa hàng khai giờ nằm ngoài giờ sàn → không lúc nào đặt được. */
export function isEmptyWindow(w: OrderWindow): boolean {
  return w.openMinute >= w.closeMinute;
}

/** 480 → "08:00". */
export function formatMinuteOfDay(min: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(min)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** Số phút từ 00:00 của một mốc thời gian, quy về múi giờ Việt Nam. */
export function minuteOfDayVN(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}
