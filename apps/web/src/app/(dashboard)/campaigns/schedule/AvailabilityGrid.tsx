'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useMyWeeklyAvailability,
  useSetMyWeeklyAvailability,
  type AvailabilitySlot,
  type ShiftPeriod,
} from '@/hooks/useDeliveries';
import { useDragSelect } from '@/hooks/useDragSelect';
import { errMsg } from '@/lib/utils';

/** Đúng 4 ca cố định của chiến dịch — khai theo ca nên khớp 1-1 với ca thật. */
const PERIODS: Array<{ id: ShiftPeriod; label: string; time: string }> = [
  { id: 'midnight', label: 'Ca khuya', time: '00:00–06:00' },
  { id: 'morning', label: 'Ca sáng', time: '06:00–12:00' },
  { id: 'afternoon', label: 'Ca chiều', time: '12:00–18:00' },
  { id: 'evening', label: 'Ca tối', time: '18:00–24:00' },
];

const DAYS = [
  { dow: 1, short: 'T2' },
  { dow: 2, short: 'T3' },
  { dow: 3, short: 'T4' },
  { dow: 4, short: 'T5' },
  { dow: 5, short: 'T6' },
  { dow: 6, short: 'T7' },
  { dow: 7, short: 'CN' },
];

const cellKey = (dow: number, period: ShiftPeriod) => `${dow}:${period}`;

/** Lịch cũ hơn ngần này thì nhắc rà lại — dữ liệu khai báo rất nhanh lỗi thời. */
const STALE_AFTER_DAYS = 45;

export default function AvailabilityGrid() {
  const { data, isLoading } = useMyWeeklyAvailability();
  const save = useSetMyWeeklyAvailability();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  // Nạp lịch đã lưu vào lưới. Không ghi đè khi người dùng đang sửa dở.
  useEffect(() => {
    if (!data || dirty) return;
    setSelected(new Set(data.slots.map((s) => cellKey(s.dayOfWeek, s.period))));
  }, [data, dirty]);

  const staleDays = useMemo(() => {
    if (!data?.updatedAt) return null;
    return Math.floor((Date.now() - new Date(data.updatedAt).getTime()) / 86_400_000);
  }, [data?.updatedAt]);

  /** Bật/tắt một ô theo `on` — dùng chung cho cả bấm lẻ lẫn kéo nhiều ô. */
  function paint(key: string, on: boolean) {
    setDirty(true);
    setSelected((prev) => {
      if (prev.has(key) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const { cellProps, dragging } = useDragSelect({
    isOn: (key) => selected.has(key),
    paint,
  });

  /** Tick/bỏ tick cả hàng ca — người rảnh cố định một khung thì đỡ bấm 7 lần. */
  function toggleRow(period: ShiftPeriod) {
    setDirty(true);
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = DAYS.every((d) => next.has(cellKey(d.dow, period)));
      for (const d of DAYS) {
        if (allOn) next.delete(cellKey(d.dow, period));
        else next.add(cellKey(d.dow, period));
      }
      return next;
    });
  }

  async function onSave() {
    const slots: AvailabilitySlot[] = [...selected].map((key) => {
      const [dow, period] = key.split(':');
      return { dayOfWeek: Number(dow), period: period as ShiftPeriod };
    });
    try {
      await save.mutateAsync(slots);
      setDirty(false);
      toast.success(
        slots.length === 0
          ? 'Đã xoá lịch rảnh. Bạn vẫn đăng ký ca thủ công được như thường.'
          : `Đã lưu ${slots.length} khung giờ rảnh.`,
      );
    } catch (e) {
      toast.error(errMsg(e, 'Không lưu được lịch rảnh'));
    }
  }

  if (isLoading) {
    return <div className="h-56 w-full animate-pulse rounded-2xl bg-neutral-100" />;
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-extrabold text-neutral-900">
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">event_available</span>
            Khung giờ tôi rảnh
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Tick các ca bạn thường rảnh trong tuần. Hệ thống dùng để <b>lọc ca phù hợp</b> cho bạn và
            để tổ chức biết ai có thể mời khi ca thiếu người — <b>không tự động xếp bạn vào ca nào</b>.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={save.isPending || !dirty}
          className="shrink-0 rounded-xl bg-[#236c2a] px-4 py-2 text-xs font-extrabold text-white transition-colors hover:bg-[#1a4f1f] disabled:opacity-40"
        >
          {save.isPending ? 'Đang lưu…' : dirty ? 'Lưu thay đổi' : 'Đã lưu'}
        </button>
      </div>

      {staleDays !== null && staleDays >= STALE_AFTER_DAYS && !dirty && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-900">
          <span className="material-symbols-outlined text-[15px]">schedule</span>
          Lịch này cập nhật {staleDays} ngày trước. Nếu giờ giấc của bạn đã đổi, hãy sửa lại để tổ
          chức không mời nhầm khung bạn đang bận.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table
          className={`w-full min-w-[520px] border-separate border-spacing-1 text-center text-xs ${
            dragging ? 'select-none' : ''
          }`}
        >
          <thead>
            <tr>
              <th className="w-32 text-left text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                Ca
              </th>
              {DAYS.map((d) => (
                <th key={d.dow} className="text-[11px] font-bold text-neutral-500">{d.short}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p.id}>
                <th className="text-left">
                  <button
                    type="button"
                    onClick={() => toggleRow(p.id)}
                    title="Tick/bỏ tick cả tuần cho ca này"
                    className="w-full rounded-lg px-1.5 py-1 text-left hover:bg-neutral-50"
                  >
                    <span className="block text-xs font-bold text-neutral-800">{p.label}</span>
                    <span className="block text-[10px] font-normal text-neutral-400">{p.time}</span>
                  </button>
                </th>
                {DAYS.map((d) => {
                  const on = selected.has(cellKey(d.dow, p.id));
                  return (
                    <td key={d.dow}>
                      <button
                        type="button"
                        {...cellProps(cellKey(d.dow, p.id))}
                        aria-pressed={on}
                        aria-label={`${p.label} ${d.short}`}
                        className={`h-11 w-full rounded-lg border transition-colors ${
                          on
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-neutral-200 bg-white text-neutral-300 hover:border-emerald-300 hover:bg-emerald-50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {on ? 'check' : 'add'}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-neutral-500">
        Đã chọn <b>{selected.size}</b>/28 khung. Kéo qua nhiều ô để tick một lượt · bấm tên ca để
        tick cả tuần.
      </p>
    </section>
  );
}
