/**
 * Lưu bản nháp của form dài vào localStorage.
 *
 * Form tạo chiến dịch có 5 bước với hàng chục ô nhập; bấm nhầm ra ngoài, bấm Escape hay
 * lỡ tải lại trang là mất sạch, phải gõ lại từ đầu. Nháp giữ ở máy người dùng nên không
 * tốn gì của server và cũng không lộ dữ liệu chưa gửi đi đâu cả.
 *
 * Mọi hàm đều nuốt lỗi: chế độ ẩn danh hoặc trình duyệt chặn site data sẽ ném khi đụng
 * vào localStorage, mà mất nháp thì không đáng để cả form sập.
 */

/** Nháp cũ hơn ngần này thì bỏ — kế hoạch tuần trước gần như chắc chắn đã lỗi thời. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Envelope<T> {
  savedAt: number;
  value: T;
}

export function loadDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

/** Nhận sẵn chuỗi JSON để nơi gọi so sánh được và chỉ ghi khi thật sự có thay đổi. */
export function saveDraftJson(key: string, valueJson: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), value: JSON.parse(valueJson) }),
    );
  } catch {
    /* hết dung lượng hoặc bị chặn — bỏ qua, nháp chỉ là tiện ích */
  }
}

export function clearDraft(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* bỏ qua */
  }
}
