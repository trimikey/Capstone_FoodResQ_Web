/**
 * Cửa sổ được phép bắt đầu chiến dịch — PHẢI khớp với `startCampaign()` của backend
 * (`CAMPAIGN_START_LEAD_HOURS`, so theo giờ Việt Nam).
 *
 * Nếu FE và BE lệch luật thì người dùng thấy nút bật nhưng bấm vào ăn lỗi, hoặc
 * ngược lại nút xám trong khi backend vẫn cho.
 */

/** Việt Nam là UTC+7 quanh năm, không có giờ mùa hè. */
const VN_UTC_OFFSET_HOURS = 7;

/** Mở được từ bao nhiêu giờ trước mốc bắt đầu — đủ cho ca đi chợ/nhận nguyên liệu rạng sáng. */
export const CAMPAIGN_START_LEAD_HOURS = 12;

/** `scheduledDate` (mốc ngày lưu ở UTC 00:00) + `HH:mm` giờ VN → epoch ms. */
export function vnDateTimeToUtc(date: string | Date, hhmm: string): number {
  const day = new Date(date);
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    (Number.isFinite(h) ? h : 0) - VN_UTC_OFFSET_HOURS,
    Number.isFinite(m) ? m : 0,
  );
}

export interface ShiftTime {
  id: string;
  startTime: string;
  endTime: string;
}

/** `"08:00"` / `"08:00:00"` → phút từ 00:00; chuỗi hỏng → null. */
export function shiftMinute(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Hai ca có chồng giờ nhau không.
 *
 * Ca liền kề (10:00–12:00 rồi 12:00–14:00) KHÔNG tính là chồng — bàn giao xong là đi
 * tiếp được. Khớp đúng `assertShiftNotOverlapping()` của backend.
 */
export function shiftsOverlap(a: ShiftTime, b: ShiftTime): boolean {
  const aStart = shiftMinute(a.startTime);
  const aEnd = shiftMinute(a.endTime);
  const bStart = shiftMinute(b.startTime);
  const bEnd = shiftMinute(b.endTime);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && bStart < aEnd;
}

/** Ca `candidate` có đụng ca nào trong `picked` không — trả về ca đụng đầu tiên. */
export function findOverlapping<T extends ShiftTime>(candidate: ShiftTime, picked: T[]): T | null {
  return picked.find((s) => s.id !== candidate.id && shiftsOverlap(candidate, s)) ?? null;
}

export type StartWindow =
  | { canStart: true; reason: null }
  | { canStart: false; reason: 'too_early' | 'too_late'; message: string; hoursUntilOpen: number };

/**
 * Chiến dịch có đang trong cửa sổ bật hay không.
 *
 * @param now truyền vào để test được; mặc định là thời điểm hiện tại.
 */
export function campaignStartWindow(
  c: {
    scheduledDate?: string | Date | null;
    startTime?: string | null;
    endDate?: string | Date | null;
  },
  now: number = Date.now(),
): StartWindow {
  // Thiếu ngày/giờ thì KHÔNG được mặc định cho bật: Date không hợp lệ sẽ cho ra NaN,
  // mà mọi phép so sánh với NaN đều false → nút hiện sáng rồi bấm vào ăn lỗi từ BE.
  if (!c.scheduledDate || !c.startTime) {
    return {
      canStart: false,
      reason: 'too_early',
      hoursUntilOpen: 0,
      message: 'Chiến dịch chưa có ngày giờ hợp lệ',
    };
  }
  const startAt = vnDateTimeToUtc(c.scheduledDate, c.startTime);
  const endOfDay = vnDateTimeToUtc(c.endDate ?? c.scheduledDate, '23:59');
  const opensAt = startAt - CAMPAIGN_START_LEAD_HOURS * 3600_000;
  if (!Number.isFinite(startAt) || !Number.isFinite(endOfDay)) {
    return {
      canStart: false,
      reason: 'too_early',
      hoursUntilOpen: 0,
      message: 'Chiến dịch chưa có ngày giờ hợp lệ',
    };
  }

  if (now < opensAt) {
    const hours = Math.ceil((opensAt - now) / 3600_000);
    return {
      canStart: false,
      reason: 'too_early',
      hoursUntilOpen: hours,
      message:
        hours >= 24
          ? `Còn ${Math.ceil(hours / 24)} ngày nữa mới mở được`
          : `Mở được sau ${hours} giờ nữa`,
    };
  }
  if (now > endOfDay) {
    return {
      canStart: false,
      reason: 'too_late',
      hoursUntilOpen: 0,
      message: 'Đã qua ngày diễn ra — hãy huỷ nếu không tổ chức được',
    };
  }
  return { canStart: true, reason: null };
}

/**
 * Mốc KẾT THÚC THẬT của chiến dịch (epoch ms) = ngày kết thúc + giờ kết thúc.
 *
 * Chiến dịch nhiều ngày lưu `endDate` riêng; ghép `endTime` vào `scheduledDate`
 * (ngày BẮT ĐẦU) sẽ ra mốc kết thúc ngay tối hôm đầu, khiến chiến dịch 3 ngày bị
 * gắn nhãn "Quá hạn" từ hôm đầu tiên.
 */
export function campaignEndAt(c: {
  scheduledDate?: string | Date | null;
  endDate?: string | Date | null;
  endTime?: string | null;
}): number {
  if (!c.scheduledDate) return NaN;
  return vnDateTimeToUtc(c.endDate ?? c.scheduledDate, c.endTime ?? '23:59');
}

/** Mốc BẮT ĐẦU thật (epoch ms) = ngày bắt đầu + giờ bắt đầu. */
export function campaignStartAt(c: {
  scheduledDate?: string | Date | null;
  startTime?: string | null;
}): number {
  if (!c.scheduledDate) return NaN;
  return vnDateTimeToUtc(c.scheduledDate, c.startTime ?? '00:00');
}

/** `2026-08-13` / Date → `13/08/2026` (giữ nguyên ngày người dùng chọn, không lệch múi giờ). */
function dmy(v: string | Date): string {
  const s = typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Chuỗi hiển thị khoảng thời gian chiến dịch.
 *
 *   1 ngày   → "13/08/2026 · 08:00–12:00"
 *   nhiều ngày → "13/08/2026 08:00 → 15/08/2026 12:00"
 */
export function formatCampaignRange(c: {
  scheduledDate?: string | Date | null;
  endDate?: string | Date | null;
  startTime?: string | null;
  endTime?: string | null;
}): string {
  if (!c.scheduledDate) return 'Chưa có ngày';
  const start = dmy(c.scheduledDate);
  const startTime = c.startTime ?? '';
  const endTime = c.endTime ?? '';
  const end = c.endDate ? dmy(c.endDate) : start;

  if (end === start) {
    return startTime && endTime ? `${start} · ${startTime}–${endTime}` : start;
  }
  return `${start} ${startTime} → ${end} ${endTime}`.replace(/\s+/g, ' ').trim();
}

/** true nếu chiến dịch kéo dài hơn một ngày. */
export function isMultiDay(c: {
  scheduledDate?: string | Date | null;
  endDate?: string | Date | null;
}): boolean {
  if (!c.scheduledDate || !c.endDate) return false;
  const s = typeof c.scheduledDate === 'string' ? c.scheduledDate.slice(0, 10) : c.scheduledDate.toISOString().slice(0, 10);
  const e = typeof c.endDate === 'string' ? c.endDate.slice(0, 10) : c.endDate.toISOString().slice(0, 10);
  return e > s;
}
