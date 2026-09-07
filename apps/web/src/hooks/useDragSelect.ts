'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface DragSelectOptions {
  /** Lưới chỉ xem thì tắt hẳn, không bắt sự kiện gì. */
  enabled?: boolean;
  isOn: (key: string) => boolean;
  paint: (key: string, on: boolean) => void;
}

/**
 * Kéo để tick/bỏ tick nhiều ô cùng lúc trong lưới ca (như bôi vùng ở bảng tính).
 *
 * Ô đầu tiên quyết định CHIỀU của cả lượt kéo: bắt đầu từ ô trống thì cả vệt là tick,
 * bắt đầu từ ô đã tick thì cả vệt là bỏ tick. Nhờ vậy kéo qua vùng lẫn lộn cũng ra kết
 * quả đoán trước được, thay vì đảo trạng thái từng ô.
 *
 * Dò ô bằng `elementFromPoint` chứ không dùng `onPointerEnter`: khi chạm bằng ngón tay,
 * trình duyệt khoá pointer vào phần tử bắt đầu chạm nên các ô khác không hề nhận enter —
 * kéo trên điện thoại sẽ chỉ đổi được đúng một ô.
 */
export function useDragSelect(options: DragSelectOptions) {
  const { enabled = true } = options;
  // Giữ callback trong ref để listener toàn cục không cần gắn/gỡ mỗi lần state đổi.
  // Cập nhật trong effect (không phải giữa render) vì render có thể bị React bỏ dở.
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const modeRef = useRef<boolean | null>(null);
  const [dragging, setDragging] = useState(false);

  const paintAt = useCallback((x: number, y: number) => {
    const mode = modeRef.current;
    if (mode === null) return;
    const el = document.elementFromPoint(x, y);
    const key = el?.closest('[data-slot-key]')?.getAttribute('data-slot-key');
    if (!key) return;
    const { isOn, paint } = optsRef.current;
    if (isOn(key) !== mode) paint(key, mode);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      paintAt(e.clientX, e.clientY);
    };
    const stop = () => {
      modeRef.current = null;
      setDragging(false);
    };
    // Nghe ở window: thả chuột ngoài bảng vẫn phải kết thúc lượt kéo, nếu không lưới
    // sẽ dính trạng thái "đang bôi" và tự đổi ô khi người dùng rê chuột qua sau đó.
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, paintAt]);

  /** Spread vào từng ô của lưới. */
  const cellProps = useCallback(
    (key: string) => {
      if (!enabled) return { 'data-slot-key': key };
      return {
        'data-slot-key': key,
        // `touch-action: none` để chạm-kéo trên ô không bị hiểu thành cuộn trang.
        style: { touchAction: 'none' as const },
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          const { isOn, paint } = optsRef.current;
          const mode = !isOn(key);
          modeRef.current = mode;
          paint(key, mode);
          setDragging(true);
        },
        // Chuột và cảm ứng đã xử lý xong ở pointerdown. Giữ onClick chỉ để phục vụ bàn
        // phím (Enter/Space cho `detail === 0`), nếu không mỗi lần bấm sẽ đảo hai lần.
        onClick: (e: React.MouseEvent) => {
          if (e.detail !== 0) return;
          const { isOn, paint } = optsRef.current;
          paint(key, !isOn(key));
        },
      };
    },
    [enabled],
  );

  return { cellProps, dragging };
}
