/**
 * Ngày theo giờ Việt Nam (UTC+7) cho các ô `<input type="date">`.
 *
 * Vì sao cần: `new Date().toISOString().slice(0, 10)` trả về ngày theo **UTC**.
 * Từ 00:00 đến 07:00 giờ VN thì UTC vẫn đang ở NGÀY HÔM TRƯỚC, nên:
 *   - "ngày mai" mặc định của form tạo chiến dịch lại ra đúng HÔM NAY;
 *   - `min=` của ô chọn ngày lùi về hôm qua, cho chọn cả ngày đã qua.
 *
 * Dùng `Intl` với locale 'sv-SE' vì locale này format sẵn dạng YYYY-MM-DD —
 * đúng định dạng `<input type="date">` yêu cầu.
 */

const VN_TZ = 'Asia/Ho_Chi_Minh';
const DAY_MS = 86_400_000;

/** YYYY-MM-DD của một thời điểm, tính theo giờ VN. */
export function toVnDateString(d: Date | number = Date.now()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: VN_TZ }).format(
    typeof d === 'number' ? new Date(d) : d,
  );
}

/** Hôm nay theo giờ VN. */
export function vnToday(): string {
  return toVnDateString();
}

/** Ngày mai theo giờ VN — mặc định cho ngày tổ chức chiến dịch. */
export function vnTomorrow(): string {
  return toVnDateString(Date.now() + DAY_MS);
}

/**
 * Hiển thị một chuỗi ngày `YYYY-MM-DD` theo giờ VN.
 *
 * `new Date('2026-08-12')` được hiểu là nửa đêm UTC; đem `toLocaleDateString`
 * theo múi giờ của máy thì máy ở múi âm sẽ hiện lùi một ngày. Ghim `timeZone`
 * để mọi máy đều thấy đúng ngày người dùng đã chọn.
 */
export function formatVnDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
): string {
  if (!dateStr) return '';
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { ...options, timeZone: 'UTC' }).format(d);
}
