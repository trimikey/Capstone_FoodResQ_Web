'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tự lưu bản nháp form "Tạo chiến dịch" vào localStorage.
 *
 * Form này dài 3 bước (thông tin → ca trực/nhân sự → thực đơn/vật phẩm); lỡ tay đóng
 * modal, F5 hay mất mạng là mất sạch. Nháp giữ ở TRÌNH DUYỆT chứ không đẩy lên DB:
 * dữ liệu chưa gửi thì chưa phải là chiến dịch, tạo bản ghi `draft` trên server sẽ
 * đụng nghiệp vụ duyệt chiến dịch đang dùng chính trạng thái đó.
 */

const STORAGE_KEY = 'foodresq:campaign-draft';
/** Tăng số này khi đổi shape nháp — nháp phiên bản cũ sẽ bị bỏ qua thay vì crash form. */
const SCHEMA_VERSION = 1;
/** Nháp quá cũ thì bỏ, tránh khôi phục nhầm chiến dịch của tuần trước. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 600;

interface DraftEnvelope<T> {
  version: number;
  savedAt: number;
  data: T;
}

function readDraft<T>(): { data: T; savedAt: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (parsed?.version !== SCHEMA_VERSION) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return { data: parsed.data, savedAt: parsed.savedAt };
  } catch {
    // localStorage bị chặn (private mode) hoặc JSON hỏng → coi như chưa có nháp.
    return null;
  }
}

export interface CampaignDraftApi<T> {
  /** Nháp đọc được lúc mount; null nếu không có / đã hết hạn / sai phiên bản. */
  restored: { data: T; savedAt: number } | null;
  /** Ghi nháp (debounce). Gọi thoải mái mỗi lần state đổi. */
  save: (data: T) => void;
  /** Xoá nháp — gọi sau khi tạo thành công hoặc khi người dùng bấm "Xoá nháp". */
  clear: () => void;
  /** Đã khôi phục nháp trong phiên này chưa (để hiện banner). */
  hasRestored: boolean;
  /** Ẩn banner mà KHÔNG xoá nháp. */
  dismissBanner: () => void;
}

export function useCampaignDraft<T>(enabled = true): CampaignDraftApi<T> {
  // Đọc một lần lúc mount: nếu đọc trong render sau này sẽ nhặt phải chính nháp
  // mà mình vừa ghi, thành vòng lặp.
  const [restored] = useState(() => (enabled ? readDraft<T>() : null));
  const [hasRestored, setHasRestored] = useState(!!restored);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHasRestored(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // không ghi được thì cũng không có gì để dọn
    }
  }, []);

  const save = useCallback(
    (data: T) => {
      if (!enabled) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          const envelope: DraftEnvelope<T> = {
            version: SCHEMA_VERSION,
            savedAt: Date.now(),
            data,
          };
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
        } catch {
          // Hết quota hoặc private mode → bỏ qua, không làm phiền người dùng.
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [enabled],
  );

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    restored,
    save,
    clear,
    hasRestored,
    dismissBanner: () => setHasRestored(false),
  };
}
