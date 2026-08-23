'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useMyDeliveryShifts,
  useSetMyDeliveryShifts,
  type DeliveryShiftSlot,
  type ShiftPeriod,
} from '@/hooks/useDeliveries';
import { useDragSelect } from '@/hooks/useDragSelect';
import { errMsg } from '@/lib/utils';

/** Cùng 4 ca cố định với lưới khung giờ rảnh để hai bảng đọc chéo được. */
const PERIODS: Array<{ id: ShiftPeriod; label: string; time: string }> = [
  { id: 'midnight', label: 'Ca khuya', time: '00:00–06:00' },
  { id: 'morning', label: 'Ca sáng', time: '06:00–12:00' },
  { id: 'afternoon', label: 'Ca chiều', time: '12:00–18:00' },
  { id: 'evening', label: 'Ca tối', time: '18:00–24:00' },
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

/** Thứ 2 của tuần chứa `dateKey` — để cột luôn chạy T2 → CN như lưới khung giờ rảnh. */
function mondayOfKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const diffToMonday = (d.getUTCDay() + 6) % 7;
  return addDaysKey(dateKey, -diffToMonday);
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
 * Đặt ngay dưới lưới "Khung giờ tôi rảnh" vì TNV luôn nhầm hai bảng này với nhau. Chúng
 * KHÁC nhau về bản chất: khung giờ rảnh là lời khai lặp theo thứ, chỉ để tổ chức biết ai
 * đáng mời; còn ca giao hàng là cam kết cho NGÀY cụ thể, có ca mới nhận được đơn.
 *
 * Cửa sổ đăng ký mở mỗi Chủ nhật 12:00 trưa, kéo dài theo cấu hình admin, đăng ký cho
 * tuần kế tiếp. Ngoài cửa sổ thì lưới chỉ xem, không sửa được.
 */
export default function DeliveryShiftsGrid() {
  const { data, isLoading } = useMyDeliveryShifts();
  const save = useSetMyDeliveryShifts();
  // `draft === null` = chưa sửa gì, lưới soi thẳng dữ liệu server nên tự cập nhật khi
  // refetch. Chỉ khi người dùng chạm vào mới tách ra bản nháp riêng.
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const serverSelected = new Set(
    (data?.slots ?? []).map((s) => cellKey(s.workDate, s.period)),
  );
  const selected = draft ?? serverSelected;
  const dirty = draft !== null;

  const window_ = data?.window;
  const editable = !!window_ && (window_.alwaysOpen || window_.open);
  const todayKey = vnTodayKey();

  // Tuần gốc: có cửa sổ → đúng tuần được mở (backend đã trả về Thứ 2); luôn mở → tuần
  // chứa hôm nay. Luôn cắt về Thứ 2 để cột trùng thứ tự với lưới khung giờ rảnh.
  const baseMonday = useMemo(
    () => mondayOfKey(window_?.editableFrom ?? todayKey),
    [window_?.editableFrom, todayKey],
  );
  // Chỉ chế độ luôn mở (admin tắt cửa sổ để test) mới cho xem tuần khác — cửa sổ thật
  // chỉ đăng ký được đúng một tuần nên mũi tên sẽ chỉ gây hiểu nhầm.
  const canBrowseWeeks = !!window_?.alwaysOpen;
  const weekStart = addDaysKey(baseMonday, canBrowseWeeks ? weekOffset * 7 : 0);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i)),
    [weekStart],
  );
  const weekEnd = days[6];

  const canEditDay = (dateKey: string) => editable && dateKey >= todayKey;

  function paint(key: string, on: boolean) {
    const [dateKey] = key.split(':');
    if (!canEditDay(dateKey)) return;
    setDraft((prev) => {
      const base = prev ?? serverSelected;
      if (base.has(key) === on) return prev ?? new Set(base);
      const next = new Set(base);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const { cellProps, dragging } = useDragSelect({
    enabled: editable,
    isOn: (key) => selected.has(key),
    paint,
  });

  if (isLoading || !data) {
    return <div className="h-56 w-full animate-pulse rounded-2xl bg-neutral-100" />;
  }
  if (!data.isShipper) return null;

  const weekCount = days.reduce(
    (n, d) => n + PERIODS.filter((p) => selected.has(cellKey(d, p.id))).length,
    0,
  );

  async function onSave() {
    // Chỉ gửi ô của TUẦN đang hiện, kèm đúng khoảng ngày — ca các tuần khác giữ nguyên.
    const inRange = new Set(days);
    const slots: DeliveryShiftSlot[] = [...selected]
      .map((key) => {
        const [workDate, period] = key.split(':');
        return { workDate, period: period as ShiftPeriod };
      })
      .filter((s) => inRange.has(s.workDate) && s.workDate >= todayKey);
    try {
      await save.mutateAsync({ slots, from: days[0], to: weekEnd });
      setDraft(null);
      toast.success(
        slots.length === 0
          ? 'Đã bỏ hết ca giao hàng của tuần này.'
          : `Đã đăng ký ${slots.length} ca giao hàng. Trong ca, mở Trung tâm giao hàng để nhận đơn.`,
      );
    } catch (e) {
      toast.error(errMsg(e, 'Không lưu được ca giao hàng'));
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-extrabold text-neutral-900">
            <span className="material-symbols-outlined text-teal-600 text-[20px]">local_shipping</span>
            Ca giao hàng của tôi
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Đây là <b>cam kết</b>, khác với khung giờ rảnh ở trên: chỉ những ca tick ở đây mới
            nhận được đơn, và đơn hẹn giờ cần ca phủ đúng giờ hẹn.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!editable || !dirty || save.isPending}
          className="shrink-0 rounded-xl bg-teal-700 px-4 py-2 text-xs font-extrabold text-white transition-colors hover:bg-teal-800 disabled:opacity-40"
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

      {canBrowseWeeks && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-neutral-50 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            disabled={weekOffset <= 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 bg-white disabled:opacity-30"
            aria-label="Tuần trước"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
          <p className="text-[11px] font-bold text-neutral-700">
            {dayLabel(days[0]).dm} – {dayLabel(weekEnd).dm}
            {weekOffset === 0 ? ' · tuần này' : ''}
          </p>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 bg-white"
            aria-label="Tuần sau"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
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
              {days.map((d) => {
                const l = dayLabel(d);
                const past = d < todayKey;
                return (
                  <th
                    key={d}
                    className={`text-[11px] font-bold ${past ? 'text-neutral-300' : 'text-neutral-500'}`}
                  >
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
                  <span className="block px-1.5 text-xs font-bold text-neutral-800">{p.label}</span>
                  <span className="block px-1.5 text-[10px] font-normal text-neutral-400">
                    {p.time}
                  </span>
                </th>
                {days.map((d) => {
                  const key = cellKey(d, p.id);
                  const on = selected.has(key);
                  const usable = canEditDay(d);
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        {...cellProps(key)}
                        disabled={!usable}
                        aria-pressed={on}
                        aria-label={`${p.label} ${dayLabel(d).dm}`}
                        title={
                          d < todayKey
                            ? 'Ngày đã qua'
                            : editable
                              ? undefined
                              : 'Ngoài cửa sổ đăng ký'
                        }
                        className={`h-11 w-full rounded-lg border transition-colors disabled:cursor-not-allowed ${
                          on
                            ? 'border-teal-600 bg-teal-600 text-white disabled:border-teal-200 disabled:bg-teal-200'
                            : 'border-neutral-200 bg-white text-neutral-300 hover:border-teal-300 hover:bg-teal-50 disabled:bg-neutral-50 disabled:hover:border-neutral-200 disabled:hover:bg-neutral-50'
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
        Tuần này đã đăng ký <b>{weekCount}</b>/28 ca.
        {editable ? ' Kéo qua nhiều ô để tick một lượt.' : ' Ngoài cửa sổ đăng ký nên chỉ xem được.'}
      </p>
    </section>
  );
}
