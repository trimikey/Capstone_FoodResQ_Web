'use client';

import { useEffect, useRef, useState } from 'react';
import {
  SHIFT_TEMPLATES,
  SCHEDULE_TEMPLATES,
  SUPPLY_TEMPLATES,
  type ShiftTemplate,
  type ScheduleTemplate,
  type SupplyTemplate,
} from './create-campaign-templates';

interface SuggestionDropdownProps {
  /** Nhãn hiển thị trên trigger. */
  label?: string;
  /** Màu tone để phân biệt. */
  tone?: 'emerald' | 'sky' | 'amber';
}

/**
 * Bộ gợi ý gắn liền với form Tạo chiến dịch — 3 tab tương ứng 3 phần:
 *  - Ca trực
 *  - Lịch trình hoạt động
 *  - Vật phẩm cần thiết
 *
 * Mỗi mẫu có thể chèn 1 lần hoặc chèn tất cả (nút "Thêm tất cả").
 */
export default function CreateCampaignSuggestions({
  label = 'Gợi ý mẫu',
  tone = 'emerald',
}: SuggestionDropdownProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'shifts' | 'schedule' | 'supplies'>('shifts');
  const [insertedIds, setInsertedIds] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Đóng dropdown khi user submit (window event do parent bắn).
  useEffect(() => {
    function onDone() {
      setOpen(false);
      // Reset tracker sau khi form đóng — lần mở form sau sẽ lại chèn được.
      setInsertedIds(new Set());
    }
    window.addEventListener('cm:form-reset', onDone);
    return () => window.removeEventListener('cm:form-reset', onDone);
  }, []);

  function dispatchInsert(kind: 'shift' | 'schedule' | 'supply', payload: unknown, id: string) {
    window.dispatchEvent(
      new CustomEvent('cm:insert-template', {
        detail: { kind, payload },
      }),
    );
    setInsertedIds((prev) => new Set(prev).add(id));
  }

  function dispatchInsertAll(items: Array<{ kind: 'shift' | 'schedule' | 'supply'; payload: unknown; id: string }>) {
    items.forEach((it) => {
      window.dispatchEvent(
        new CustomEvent('cm:insert-template', { detail: { kind: it.kind, payload: it.payload } }),
      );
    });
    setInsertedIds((prev) => {
      const next = new Set(prev);
      items.forEach((it) => next.add(it.id));
      return next;
    });
    // Đóng sau khi chèn tất cả để user thấy form đầy đủ.
    setTimeout(() => setOpen(false), 250);
  }

  const TONE_STYLES: Record<NonNullable<SuggestionDropdownProps['tone']>, string> = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    sky: 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  };
  const TAB_ACTIVE: Record<typeof tab, string> = {
    shifts: 'bg-emerald-600 text-white border-emerald-600',
    schedule: 'bg-sky-600 text-white border-sky-600',
    supplies: 'bg-amber-600 text-white border-amber-600',
  };

  return (
    <div className="block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${TONE_STYLES[tone]}`}
      >
        <span className="material-symbols-outlined text-[16px]">
          {open ? 'close' : 'lightbulb'}
        </span>
        {open ? 'Đóng gợi ý' : label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Gợi ý mẫu cho chiến dịch"
          // Panel trải full width trong block, không tràn ngang ra ngoài form.
          // Khi header block ở dạng flex-wrap, panel sẽ tự xuống dòng dưới trigger.
          className="z-30 mt-2 w-full rounded-2xl border-2 border-neutral-200 bg-white shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 via-sky-50 to-amber-50 border-b border-neutral-200">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500">
              Mẫu có sẵn
            </p>
            <p className="text-sm font-bold text-neutral-900">
              Chèn nhanh vào form đang điền
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-neutral-200">
            {(
              [
                { key: 'shifts' as const, label: 'Ca trực', count: SHIFT_TEMPLATES.length, icon: 'event' },
                { key: 'schedule' as const, label: 'Lịch trình', count: SCHEDULE_TEMPLATES.length, icon: 'schedule' },
                { key: 'supplies' as const, label: 'Vật phẩm', count: SUPPLY_TEMPLATES.length, icon: 'inventory_2' },
              ]
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex-1 px-3 py-2.5 text-xs font-bold border-b-2 inline-flex items-center justify-center gap-1.5 transition-colors ${
                  tab === t.key
                    ? `${TAB_ACTIVE[t.key]} border-transparent`
                    : 'text-neutral-600 border-transparent hover:bg-neutral-50'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
                {t.label}
                <span className={`text-[10px] px-1.5 rounded-full ${tab === t.key ? 'bg-white/25' : 'bg-neutral-100 text-neutral-500'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="max-h-[360px] overflow-y-auto p-3">
            {tab === 'shifts' && (
              <ShiftsBody
                inserted={insertedIds}
                onInsertOne={(t) => dispatchInsert('shift', t, t.id)}
                onInsertAll={() =>
                  dispatchInsertAll(
                    SHIFT_TEMPLATES.filter((t) => !insertedIds.has(t.id)).map((t) => ({
                      kind: 'shift',
                      payload: t,
                      id: t.id,
                    })),
                  )
                }
              />
            )}
            {tab === 'schedule' && (
              <ScheduleBody
                inserted={insertedIds}
                onInsertOne={(t) => dispatchInsert('schedule', t, t.id)}
                onInsertAll={() =>
                  dispatchInsertAll(
                    SCHEDULE_TEMPLATES.filter((t) => !insertedIds.has(t.id)).map((t) => ({
                      kind: 'schedule',
                      payload: t,
                      id: t.id,
                    })),
                  )
                }
              />
            )}
            {tab === 'supplies' && (
              <SuppliesBody
                inserted={insertedIds}
                onInsertOne={(t) => dispatchInsert('supply', t, t.id)}
                onInsertAll={() =>
                  dispatchInsertAll(
                    SUPPLY_TEMPLATES.filter((t) => !insertedIds.has(t.id)).map((t) => ({
                      kind: 'supply',
                      payload: t,
                      id: t.id,
                    })),
                  )
                }
              />
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between gap-2">
            <p className="text-[10px] text-neutral-500">
              Bấm vào từng mẫu để chèn — có thể sửa lại sau.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] font-bold text-neutral-600 hover:text-neutral-900"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bodies ───────────────────────────────────────────────────────────────

function ShiftsBody({
  inserted,
  onInsertOne,
  onInsertAll,
}: {
  inserted: Set<string>;
  onInsertOne: (t: ShiftTemplate) => void;
  onInsertAll: () => void;
}) {
  const remaining = SHIFT_TEMPLATES.filter((t) => !inserted.has(t.id)).length;
  return (
    <>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={onInsertAll}
          disabled={remaining === 0}
          className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-900 disabled:text-neutral-300 inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">library_add</span>
          Thêm tất cả ({remaining})
        </button>
      </div>
      <ul className="space-y-1.5">
        {SHIFT_TEMPLATES.map((s) => {
          const used = inserted.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={used}
                onClick={() => onInsertOne(s)}
                className={`w-full text-left rounded-xl border px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                  used
                    ? 'border-emerald-200 bg-emerald-50 opacity-60 cursor-default'
                    : 'border-neutral-200 hover:border-emerald-300 hover:bg-emerald-50/40'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-neutral-900 truncate">{s.label}</p>
                  <p className="text-[11px] text-neutral-500 inline-flex items-center gap-2">
                    <span className="material-symbols-outlined text-[12px]">schedule</span>
                    {s.startTime}–{s.endTime}
                    <span className="material-symbols-outlined text-[12px]">group</span>
                    {s.slotsNeeded} người
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold ${
                    s.role === 'chef'
                      ? 'bg-amber-100 text-amber-800'
                      : s.role === 'waiter'
                      ? 'bg-sky-100 text-sky-800'
                      : s.role === 'shipper'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-[12px]">
                    {s.role === 'chef' ? 'skillet' : s.role === 'waiter' ? 'room_service' : s.role === 'shipper' ? 'local_shipping' : 'group'}
                  </span>
                  {s.role === 'chef' ? 'Đầu bếp' : s.role === 'waiter' ? 'Phục vụ' : s.role === 'shipper' ? 'Giao hàng' : 'Mọi vai trò'}
                </span>
                <span className="material-symbols-outlined text-[18px] text-emerald-600">
                  {used ? 'check_circle' : 'add_circle'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ScheduleBody({
  inserted,
  onInsertOne,
  onInsertAll,
}: {
  inserted: Set<string>;
  onInsertOne: (t: ScheduleTemplate) => void;
  onInsertAll: () => void;
}) {
  const remaining = SCHEDULE_TEMPLATES.filter((t) => !inserted.has(t.id)).length;
  return (
    <>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={onInsertAll}
          disabled={remaining === 0}
          className="text-[11px] font-extrabold text-sky-700 hover:text-sky-900 disabled:text-neutral-300 inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">library_add</span>
          Thêm tất cả ({remaining})
        </button>
      </div>
      <ol className="space-y-1.5">
        {SCHEDULE_TEMPLATES.map((s) => {
          const used = inserted.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={used}
                onClick={() => onInsertOne(s)}
                className={`w-full text-left rounded-xl border px-3 py-2 flex items-center gap-3 transition-colors ${
                  used
                    ? 'border-sky-200 bg-sky-50 opacity-60 cursor-default'
                    : 'border-neutral-200 hover:border-sky-300 hover:bg-sky-50/40'
                }`}
              >
                <span className="shrink-0 min-w-[60px] text-xs font-extrabold text-neutral-700 bg-neutral-100 rounded-lg px-2 py-1 text-center">
                  {s.time}
                </span>
                <p className="flex-1 text-sm text-neutral-700">{s.label}</p>
                <span className="material-symbols-outlined text-[18px] text-sky-600">
                  {used ? 'check_circle' : 'add_circle'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function SuppliesBody({
  inserted,
  onInsertOne,
  onInsertAll,
}: {
  inserted: Set<string>;
  onInsertOne: (t: SupplyTemplate) => void;
  onInsertAll: () => void;
}) {
  const remaining = SUPPLY_TEMPLATES.filter((t) => !inserted.has(t.id)).length;
  return (
    <>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={onInsertAll}
          disabled={remaining === 0}
          className="text-[11px] font-extrabold text-amber-700 hover:text-amber-900 disabled:text-neutral-300 inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">library_add</span>
          Thêm tất cả ({remaining})
        </button>
      </div>
      <ul className="space-y-1.5">
        {SUPPLY_TEMPLATES.map((s) => {
          const used = inserted.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={used}
                onClick={() => onInsertOne(s)}
                className={`w-full text-left rounded-xl border px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                  used
                    ? 'border-amber-200 bg-amber-50 opacity-60 cursor-default'
                    : 'border-neutral-200 hover:border-amber-300 hover:bg-amber-50/40'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-neutral-900 truncate">{s.name}</p>
                  <p className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">scale</span>
                    {s.quantity ?? '—'} {s.unit ?? ''}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[18px] text-amber-600">
                  {used ? 'check_circle' : 'add_circle'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}