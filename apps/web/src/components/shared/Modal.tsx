'use client';

import { createPortal } from 'react-dom';

/**
 * Lớp nền + hộp modal dùng chung (portal ra body, bấm nền để đóng).
 * Nội dung truyền qua children; header/footer tự do trong children.
 */
export function Modal({
  onClose,
  children,
  align = 'center',
  className = '',
  closeOnBackdrop = true,
}: {
  onClose: () => void;
  children: React.ReactNode;
  align?: 'center' | 'top';
  className?: string;
  closeOnBackdrop?: boolean;
}) {
  if (typeof document === 'undefined') return null;
  const items = align === 'top' ? 'items-start' : 'items-center';
  return createPortal(
    // Thanh cuộn nằm ở LỚP PHỦ, khung căn giữa dùng `min-h-full`.
    // Nếu đặt cả `flex items-center` lẫn `overflow-y-auto` trên cùng một thẻ, nội dung
    // cao hơn màn hình sẽ bị đẩy tràn lên trên và không cuộn ngược lại được — mất phần đầu.
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm overflow-y-auto animate-fade-in-up"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div className={`flex min-h-full justify-center p-4 ${items}`}>
        <div className={className} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
