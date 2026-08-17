'use client';

import { createPortal } from 'react-dom';
import { useEffect } from 'react';

/**
 * Popup overlay chuẩn: nằm ở 12% từ trên, có khoảng cách 2 bên,
 * bo tròn 2xl, scroll trong body, header gradient xanh brand.
 *
 * Usage:
 *   <StandardPopup open={isOpen} onClose={() => setIsOpen(false)} title="Tiêu đề">
 *     ...children
 *   </StandardPopup>
 */
export function StandardPopup({
  open,
  onClose,
  title,
  icon,
  iconBg = 'bg-emerald-600',
  children,
  footer,
  maxW = 'max-w-sm',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  iconBg?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxW?: string;
}) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 z-[9999] flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full ${maxW} max-h-[85vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0 rounded-t-2xl">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-white text-[18px]">close</span>
          </button>

          <div className="flex items-center gap-3 pr-8">
            {icon && (
              <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                <span className="material-symbols-outlined text-white text-[20px]">{icon}</span>
              </div>
            )}
            <h3 className="font-extrabold text-white text-base">{title}</h3>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="px-5 py-4 space-y-3">
            {children}
          </div>
        </div>

        {/* Footer (outside scroll) */}
        {footer && (
          <div className="shrink-0 px-5 py-3 border-t border-neutral-100">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
