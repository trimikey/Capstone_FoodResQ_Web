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
      {/* Chừa chỗ cho thanh header cố định (mobile 64px, desktop 104px) — header nằm ở
          z-[9999], cao hơn lớp phủ này, nên nếu không chừa thì phần đầu modal bị header
          đè lên và dính sát navbar. Padding dư ra là khoảng cách nhìn thấy được. */}
      <div className={`flex min-h-full justify-center px-4 pt-20 pb-6 md:pt-[136px] md:pb-8 ${items}`}>
        <div className={className} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
