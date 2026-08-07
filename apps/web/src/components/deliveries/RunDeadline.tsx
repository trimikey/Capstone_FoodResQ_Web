'use client';

import { useEffect, useState } from 'react';

/**
 * Đếm ngược tới hạn chót của chuyến giao sỉ.
 * Mốc do server tính (`deadlineAt`) nên reload trang không làm đồng hồ nhảy lại.
 */
export default function RunDeadline({
  deadlineAt,
  label,
}: {
  deadlineAt?: string | null;
  /** Ví dụ: "để duyệt", "để đến lấy hàng", "để phát xong" */
  label: string;
}) {
  // Chốt mốc "bây giờ" ở state rồi tick mỗi 30s — đọc đồng hồ lúc render là không thuần khiết.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!deadlineAt) return null;

  const msLeft = new Date(deadlineAt).getTime() - now;
  const overdue = msLeft <= 0;
  const mins = Math.max(0, Math.floor(msLeft / 60_000));
  const hours = Math.floor(mins / 60);

  const text = overdue
    ? 'Đã quá hạn — hệ thống sẽ tự đóng'
    : hours > 0
      ? `Còn ${hours} giờ ${mins % 60} phút ${label}`
      : `Còn ${mins} phút ${label}`;

  // Dưới 1 tiếng là mốc đáng chú ý; quá hạn thì cảnh báo đỏ
  const tone = overdue
    ? 'bg-rose-50 border-rose-200 text-rose-700'
    : hours < 1
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-neutral-50 border-neutral-200 text-neutral-600';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-bold ${tone}`}>
      <span className="material-symbols-outlined text-[13px]">schedule</span>
      {text}
    </span>
  );
}
