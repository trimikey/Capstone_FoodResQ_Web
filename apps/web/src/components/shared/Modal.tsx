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
    <div
      className={`fixed inset-0 z-50 flex justify-center ${items} bg-black/55 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in-up`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div className={className} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
