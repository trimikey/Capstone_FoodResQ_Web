'use client';

import { useMemo } from 'react';

/**
 * Thanh phân trang dùng chung.
 *
 * Các trang trước đây tự render `Array.from({ length: totalPages })` — 40 trang là
 * 40 nút, tràn ngang và không đọc được. Ở đây chỉ hiện tối đa ~7 ô: luôn có trang
 * đầu/cuối, các trang quanh trang hiện tại, phần bị lược thay bằng `…`.
 */

interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Tổng số bản ghi — có thì hiện dòng "Hiển thị a–b trên N". */
  total?: number;
  /** Số bản ghi mỗi trang, dùng để tính khoảng đang hiển thị. */
  perPage?: number;
  /** Nhãn đơn vị trong dòng tóm tắt, vd "đơn", "chiến dịch". */
  unit?: string;
  className?: string;
}

/**
 * Danh sách ô cần render: số trang hoặc `'…'`.
 * Luôn giữ trang 1, trang cuối, và cửa sổ ±1 quanh trang hiện tại.
 */
export function buildPageItems(page: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const items: Array<number | '…'> = [1];

  // Gần đầu/cuối thì đẩy cửa sổ vào trong để số ô luôn là 6–7, tránh thanh phân
  // trang co giãn nhảy múa khi bấm qua lại.
  let windowStart: number;
  let windowEnd: number;
  if (page <= 3) {
    windowStart = 2;
    windowEnd = 4;
  } else if (page >= totalPages - 2) {
    windowStart = totalPages - 3;
    windowEnd = totalPages - 1;
  } else {
    windowStart = page - 1;
    windowEnd = page + 1;
  }

  if (windowStart > 2) items.push('…');
  for (let i = windowStart; i <= windowEnd; i += 1) items.push(i);
  if (windowEnd < totalPages - 1) items.push('…');
  items.push(totalPages);
  return items;
}

export default function Pagination({
  page,
  totalPages,
  onChange,
  total,
  perPage,
  unit = 'mục',
  className = '',
}: Props) {
  const items = useMemo(() => buildPageItems(page, totalPages), [page, totalPages]);
  if (totalPages <= 1) return null;

  const from = perPage ? (page - 1) * perPage + 1 : null;
  const to = perPage && total != null ? Math.min(total, page * perPage) : null;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 pt-2 ${className}`}>
      {total != null && from != null && to != null ? (
        <span className="text-xs font-medium text-neutral-500">
          Hiển thị {from}–{to} trên {total} {unit}
        </span>
      ) : (
        <span className="text-xs font-medium text-neutral-500">
          Trang {page}/{totalPages}
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Trang trước"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>

        {items.map((it, idx) =>
          it === '…' ? (
            <span
              key={`gap-${idx}`}
              aria-hidden
              className="w-6 text-center text-sm font-bold text-neutral-400"
            >
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => onChange(it)}
              aria-current={it === page ? 'page' : undefined}
              className={`h-9 min-w-9 rounded-full px-2 text-sm font-bold transition-colors ${
                it === page
                  ? 'bg-emerald-700 text-white'
                  : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {it}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Trang sau"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </div>
    </div>
  );
}
