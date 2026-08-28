/**
 * Luật điểm uy tín khi huỷ đơn (CLAUDE.md §8/§9 — mặc định của system_configs).
 *
 * Đặt ở một chỗ vì có HAI màn hình cùng cảnh báo trước khi huỷ: danh sách đơn và trang
 * theo dõi đơn. Hai bản sao sẽ lệch nhau ngay lần đầu ai đó chỉnh một bên, và người
 * dùng sẽ thấy hai con số phạt khác nhau cho cùng một hành động.
 */

/** Huỷ khi còn < 30 phút trước giờ kết thúc nhận. */
export const LATE_CANCEL_PENALTY = 10;
/** Không đến nhận trước khi QR hết hạn. */
export const NO_SHOW_PENALTY = 20;
/** Khoảng "huỷ trễ" tính ngược từ giờ kết thúc nhận. */
export const LATE_WINDOW_MS = 30 * 60 * 1000;

const BAN_THRESHOLD = 30; // ≤ 30 điểm → khoá tài khoản
const RESTRICT_THRESHOLD = 60; // ≤ 60 điểm → hạn chế (1 đơn/ngày)

/**
 * Huỷ lúc này có bị tính là huỷ trễ không.
 *
 * `waitingForShipper` = đơn giao còn đang tìm người nhận. Lúc đó huỷ KHÔNG bao giờ bị
 * phạt: chưa ai chịu thiệt, và nếu cứ để đó thì hệ thống tự huỷ khi hết hạn cũng không
 * phạt. Phải khớp đúng `ReservationsService.cancel` của backend, nếu không người dùng
 * đọc một đằng còn bị trừ điểm một nẻo.
 */
export function isLateCancel(
  pickupEndTime: string | Date,
  waitingForShipper = false,
  now = Date.now(),
): boolean {
  if (waitingForShipper) return false;
  return new Date(pickupEndTime).getTime() - now < LATE_WINDOW_MS;
}

/** Cảnh báo hậu quả sau khi bị trừ điểm: khoá / hạn chế / an toàn. */
export function penaltyOutcome(scoreAfter: number): { text: string; severe: boolean } | null {
  if (scoreAfter <= BAN_THRESHOLD)
    return { text: `Điểm sẽ còn ${scoreAfter} (≤ ${BAN_THRESHOLD}) — tài khoản sẽ bị KHOÁ.`, severe: true };
  if (scoreAfter <= RESTRICT_THRESHOLD)
    return { text: `Điểm sẽ còn ${scoreAfter} (≤ ${RESTRICT_THRESHOLD}) — tài khoản sẽ bị hạn chế (tối đa 1 đơn/ngày).`, severe: false };
  return null;
}

/** Điểm còn lại sau khi bị trừ vì huỷ trễ (null khi chưa biết điểm hiện tại). */
export function scoreAfterLateCancel(score: number | null | undefined): number | null {
  return score != null ? Math.max(0, score - LATE_CANCEL_PENALTY) : null;
}
