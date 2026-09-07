'use client';

import { useState, useEffect } from 'react';

// Dùng chung giữa MapTab và DonationsTab
export const RES_STATUS_META: Record<string, { label: string; cls: string; icon: string }> = {
  confirmed: { label: 'Đã xác nhận', cls: 'bg-sky-100 text-sky-700', icon: 'task_alt' },
  picked_up: { label: 'Chờ bàn giao', cls: 'bg-honey-100 text-honey-800', icon: 'hourglass_top' },
  completed: { label: 'Hoàn tất', cls: 'bg-emerald-100 text-emerald-800', icon: 'check_circle' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-neutral-100 text-neutral-600', icon: 'cancel' },
  no_show: { label: 'Không đến', cls: 'bg-rose-100 text-rose-700', icon: 'person_off' },
  expired: { label: 'Hết hạn', cls: 'bg-neutral-100 text-neutral-600', icon: 'schedule' },
};

// Phân trang client-side dùng chung cho mọi danh sách admin.
// resetKey: đổi (vd khi tìm kiếm / lọc) thì về trang 1.
export function usePaged<T>(items: T[], perPage: number, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const cur = Math.min(page, totalPages);
  const slice = items.slice((cur - 1) * perPage, cur * perPage);
  return { page: cur, setPage, totalPages, total: items.length, perPage, slice };
}

export function Pagination({ page, totalPages, total, perPage, onChange }: {
  page: number; totalPages: number; total: number; perPage: number; onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="p-4 flex flex-wrap items-center justify-center gap-3 sm:justify-between text-xs text-neutral-500 font-medium border-t border-neutral-100">
      <span className="hidden sm:inline">Hiển thị {from}–{to} trên {total}</span>
      <div className="flex gap-1 items-center">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 disabled:opacity-30 transition-colors"><span className="material-symbols-outlined text-[16px]">chevron_left</span></button>
        {start > 1 && <span className="w-6 text-center">…</span>}
        {pages.map((p) => (
          <button key={p} onClick={() => onChange(p)} className={`w-8 h-8 rounded-full text-sm font-bold transition-colors ${p === page ? 'bg-[#166534] text-white' : 'border border-neutral-200 hover:bg-neutral-50'}`}>{p}</button>
        ))}
        {end < totalPages && <span className="w-6 text-center">…</span>}
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 disabled:opacity-30 transition-colors"><span className="material-symbols-outlined text-[16px]">chevron_right</span></button>
      </div>
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => <div key={i} className="h-24 bg-neutral-100 animate-pulse rounded-3xl" />)}
    </div>
  );
}

export function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-neutral-200 shadow-sm">
      <div className="w-24 h-24 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
        <span className="material-symbols-outlined text-emerald-600 text-[48px]">{icon}</span>
      </div>
      <p className="font-bold text-neutral-600 mt-6">{text}</p>
    </div>
  );
}
