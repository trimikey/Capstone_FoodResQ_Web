'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useMyDeliveryShifts,
  useSetMyDeliveryShifts,
  type DeliveryShiftSlot,
  type ShiftPeriod,
} from '@/hooks/useDeliveries';
import { errMsg } from '@/lib/utils';

const PERIODS: Array<{ id: ShiftPeriod; label: string; time: string }> = [
  { id: 'midnight', label: 'Ca khuya', time: '00–06h' },
  { id: 'morning', label: 'Ca sáng', time: '06–12h' },
  { id: 'afternoon', label: 'Ca chiều', time: '12–18h' },
  { id: 'evening', label: 'Ca tối', time: '18–24h' },
];

const cellKey = (d: string, p: string) => `${d}:${p}`;

function vnTodayKey(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(dateKey: string): { dow: string; dm: string } {
  // dateKey đã là ngày theo lịch VN — parse ở mốc UTC để giữ nguyên ngày/thứ.
  const d = new Date(`${dateKey}T00:00:00Z`);
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return {
    dow: names[d.getUTCDay()] ?? '',
    dm: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
  };
}

function fmtVn(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * Đăng ký CA GIAO HÀNG — điều kiện để nhận đơn (thay nút bật/tắt sẵn sàng cũ).
 *
 * Cửa sổ đăng ký mở mỗi Chủ nhật 12:00 trưa, kéo dài theo cấu hình admin, đăng ký
 * cho tuần kế tiếp. Ngoài cửa sổ thì lưới chỉ xem, không sửa được.
 */
export default function DeliveryShiftPanel() {
  const { data, isLoading } = useMyDeliveryShifts();
  const save = useSetMyDeliveryShifts();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const window_ = data?.window;
  const editable = !!window_ && (window_.alwaysOpen || window_.open);

  // Dải ngày hiển thị: tuần được phép đăng ký; luôn-mở thì 7 ngày kể từ hôm nay.
  const days = useMemo(() => {
    const from = window_?.editableFrom ?? vnTodayKey();
    return Array.from({ length: 7 }, (_, i) => addDaysKey(from, i));
  }, [window_?.editableFrom]);

  useEffect(() => {
    if (!data || dirty) return;
    setSelected(new Set(data.slots.map((s) => cellKey(s.workDate, s.period))));
  }, [data, dirty]);

  if (isLoading || !data) {
    return <div className="h-40 w-full animate-pulse rounded-3xl bg-neutral-100" />;
  }
  if (!data.isShipper) return null;

  function toggle(dateKey: string, period: ShiftPeriod) {
    if (!editable) return;
    setDirty(true);
    setSelected((prev) => {
      const next = new Set(prev);
      const key = cellKey(dateKey, period);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onSave() {
    // Chỉ gửi các ô thuộc dải ngày đang sửa — ca tuần đang chạy backend giữ nguyên.
    const inRange = new Set(days);
    const slots: DeliveryShiftSlot[] = [...selected]
      .map((key) => {
        const [workDate, period] = key.split(':');
        return { workDate, period: period as ShiftPeriod };
      })
      .filter((s) => inRange.has(s.workDate));
    try {
      await save.mutateAsync(slots);
      setDirty(false);
      toast.success(
        slots.length === 0
          ? 'Đã bỏ hết ca giao hàng tuần này.'
          : `Đã đăng ký ${slots.length} ca giao hàng. Trong ca, mở trang này để nhận đơn.`,
      );
    } catch (e) {
      toast.error(errMsg(e, 'Không lưu được ca giao hàng'));
    }
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-neutral-900">
            <span className="material-symbols-outlined text-emerald-600">event_available</span>
            Ca giao hàng của tôi
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Bạn chỉ nhận được đơn trong các ca đã đăng ký. Đơn hẹn giờ cần ca phủ đúng giờ hẹn.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!editable || !dirty || save.isPending}
          className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:opacity-40"
        >
          {save.isPending ? 'Đang lưu…' : dirty ? 'Lưu ca' : 'Đã lưu'}
        </button>
      </div>

      {/* Trạng thái cửa sổ đăng ký */}
      {window_ && !window_.alwaysOpen && (
        <p
          className={`mt-3 flex items-start gap-1.5 rounded-xl p-2.5 text-[11px] font-semibold ${
            window_.open ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">
            {window_.open ? 'lock_open' : 'lock'}
          </span>
          {window_.open
            ? `Đang mở đăng ký cho tuần ${window_.editableFrom} → ${window_.editableTo}. Đóng lúc ${fmtVn(window_.closesAt)}.`
            : `Ngoài giờ đăng ký — cửa sổ kế tiếp mở ${fmtVn(window_.nextOpensAt)} (Chủ nhật 12:00 trưa).`}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-1 text-center text-xs">
          <thead>
            <tr>
              <th className="w-24 text-left text-[11px] font-bold uppercase tracking-wide text-neutral-400">Ca</th>
              {days.map((d) => {
                const l = dayLabel(d);
                return (
                  <th key={d} className="text-[11px] font-bold text-neutral-500">
                    {l.dow}
                    <span className="block text-[10px] font-normal text-neutral-400">{l.dm}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p.id}>
                <th className="text-left">
                  <span className="block text-xs font-bold text-neutral-800">{p.label}</span>
                  <span className="block text-[10px] font-normal text-neutral-400">{p.time}</span>
                </th>
                {days.map((d) => {
                  const on = selected.has(cellKey(d, p.id));
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        onClick={() => toggle(d, p.id)}
                        disabled={!editable}
                        aria-pressed={on}
                        aria-label={`${p.label} ${d}`}
                        className={`h-10 w-full rounded-lg border transition-colors disabled:cursor-not-allowed ${
                          on
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-neutral-200 bg-white text-neutral-300 hover:border-emerald-300 hover:bg-emerald-50 disabled:hover:border-neutral-200 disabled:hover:bg-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">{on ? 'check' : 'add'}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
