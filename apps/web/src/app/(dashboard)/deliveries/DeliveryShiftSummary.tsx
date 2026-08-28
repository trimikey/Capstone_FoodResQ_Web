'use client';

import Link from 'next/link';
import { useMyDeliveryShifts } from '@/hooks/useDeliveries';

const PERIOD_LABEL: Record<string, string> = {
  midnight: 'Ca khuya 00–06h',
  morning: 'Ca sáng 06–12h',
  afternoon: 'Ca chiều 12–18h',
  evening: 'Ca tối 18–24h',
};

function vnTodayKey(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function dm(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/**
 * Tóm tắt ca giao hàng đã đăng ký — bản rút gọn của lưới bên "Lịch làm việc".
 *
 * Lưới đăng ký đã dời hẳn sang trang lịch để TNV có MỘT chỗ duy nhất xếp lịch, thay vì
 * hai bảng 7×4 giống hệt nhau ở hai trang. Ở đây chỉ cần trả lời đúng một câu: hôm nay
 * mình có ca nào, và ca kế tiếp là khi nào.
 */
export default function DeliveryShiftSummary() {
  const { data, isLoading } = useMyDeliveryShifts();

  if (isLoading || !data || !data.isShipper) return null;

  const today = vnTodayKey();
  const todaySlots = data.slots.filter((s) => s.workDate === today);
  const upcoming = data.slots.filter((s) => s.workDate > today).slice(0, 3);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-extrabold text-neutral-900">
            <span className="material-symbols-outlined text-teal-600 text-[20px]">event_available</span>
            Ca giao hàng của bạn
          </h2>
          {todaySlots.length > 0 ? (
            <p className="mt-1 text-xs text-neutral-500">
              Hôm nay bạn trực {todaySlots.length} ca. Chỉ nhận được đơn trong khung giờ đã đăng ký.
            </p>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">
              Hôm nay bạn không có ca nào — danh sách đơn bên dưới sẽ không cho nhận.
            </p>
          )}
        </div>
        <Link
          href="/campaigns/schedule"
          className="shrink-0 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-extrabold text-teal-800 hover:bg-teal-100"
        >
          Đăng ký / sửa ca →
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {todaySlots.map((s) => (
          <span
            key={`${s.workDate}:${s.period}`}
            className="rounded-full bg-teal-600 px-2.5 py-1 text-[11px] font-bold text-white"
          >
            {PERIOD_LABEL[s.period] ?? s.period}
          </span>
        ))}
        {upcoming.map((s) => (
          <span
            key={`${s.workDate}:${s.period}`}
            className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-500"
          >
            {dm(s.workDate)} · {PERIOD_LABEL[s.period] ?? s.period}
          </span>
        ))}
        {todaySlots.length === 0 && upcoming.length === 0 && (
          <span className="text-[11px] italic text-neutral-400">Chưa đăng ký ca nào.</span>
        )}
      </div>
    </section>
  );
}
