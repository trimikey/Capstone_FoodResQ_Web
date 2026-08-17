'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SHIFT_TEMPLATES,
  SCHEDULE_TEMPLATES,
  SUPPLY_TEMPLATES,
  buildScaledTemplates,
  buildMatchedMenuTemplates,
  getServingsTier,
  type ShiftTemplate,
  type ScheduleTemplate,
  type SupplyTemplate,
  type MenuTemplate,
} from './create-campaign-templates';

// ─── Shared helpers ──────────────────────────────────────────────────────────

interface BaseSuggestionsProps {
  /** Số suất ăn dự kiến — dùng để scale slots/quantity. */
  expectedServings: number;
}

function useClickOutside(open: boolean, onClose: () => void) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return wrapRef;
}

/**
 * Reset `inserted` tracker khi form submit (window event do parent bắn).
 * Trả về [inserted, trackInsert, reset]
 */
function useInsertedTracker() {
  const [inserted, setInserted] = useState<Set<string>>(new Set());
  useEffect(() => {
    function onDone() {
      setInserted(new Set());
    }
    window.addEventListener('cm:form-reset', onDone);
    return () => window.removeEventListener('cm:form-reset', onDone);
  }, []);
  const track = (id: string) =>
    setInserted((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  const trackAll = (ids: string[]) =>
    setInserted((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  const untrack = (id: string) =>
    setInserted((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  return { inserted, track, trackAll, untrack };
}

function fireInsert(
  kind: 'shift' | 'schedule' | 'supply' | 'menu',
  payload: unknown,
) {
  window.dispatchEvent(
    new CustomEvent('cm:insert-template', { detail: { kind, payload } }),
  );
}

/** Gỡ một mẫu đã chèn — form lắng nghe và xoá dòng tương ứng. */
function fireRemove(
  kind: 'shift' | 'schedule' | 'supply' | 'menu',
  payload: unknown,
) {
  window.dispatchEvent(
    new CustomEvent('cm:remove-template', { detail: { kind, payload } }),
  );
}

const TONE_STYLES = {
  emerald:
    'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
  sky: 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100',
  amber:
    'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  teal: 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100',
} as const;

const TIER_LABEL: Record<ReturnType<typeof getServingsTier>, string> = {
  small: '≤ 50',
  medium: '50–200',
  large: '> 200',
};

// ─── Dropdown cho Ca trực ────────────────────────────────────────────────────

export function ShiftSuggestions({
  expectedServings,
}: BaseSuggestionsProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useClickOutside(open, () => setOpen(false));
  const { inserted, track, trackAll, untrack } = useInsertedTracker();

  const shifts = useMemo(
    () => buildScaledTemplates(expectedServings).shifts,
    [expectedServings],
  );
  const tier = getServingsTier(expectedServings || 0);

  const remaining = shifts.filter((s) => !inserted.has(s.id)).length;

  return (
    <div className="block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${TONE_STYLES.emerald}`}
      >
        <span className="material-symbols-outlined text-[16px]">
          {open ? 'close' : 'lightbulb'}
        </span>
        {open ? 'Đóng gợi ý' : 'Gợi ý ca trực'}
      </button>

      {open && (
        <SuggestionPanel
          tier={tier}
          title="Mẫu ca trực cho tình nguyện viên"
          subtitle={`Số slot đã scale theo số suất ăn (${expectedServings || 0} suất — tier ${TIER_LABEL[tier]}).`}
          tone="emerald"
          remainingCount={remaining}
          onInsertAll={() => {
            const pending = shifts.filter((s) => !inserted.has(s.id));
            pending.forEach((s) => fireInsert('shift', s));
            trackAll(pending.map((s) => s.id));
            setTimeout(() => setOpen(false), 250);
          }}
        >
          <ul className="space-y-1.5">
            {shifts.map((s) => {
              const used = inserted.has(s.id);
              return (
                <ShiftRow
                  key={s.id}
                  shift={s}
                  used={used}
                  onToggle={() => {
                    if (used) {
                      fireRemove('shift', s);
                      untrack(s.id);
                    } else {
                      fireInsert('shift', s);
                      track(s.id);
                    }
                  }}
                />
              );
            })}
          </ul>
        </SuggestionPanel>
      )}
    </div>
  );
}

function ShiftRow({
  shift,
  used,
  onToggle,
}: {
  shift: ShiftTemplate;
  used: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      {/* Bấm lại để GỠ: trước đây chèn xong là nút bị disable, chọn nhầm một mẫu
          thì phải cuộn xuống danh sách ca để xoá tay. */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={used}
        title={used ? 'Bấm để bỏ ca này' : 'Bấm để thêm ca này'}
        className={`group w-full text-left rounded-xl border px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
          used
            ? 'border-emerald-300 bg-emerald-50 hover:border-rose-300 hover:bg-rose-50/60'
            : 'border-neutral-200 hover:border-emerald-300 hover:bg-emerald-50/40'
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-neutral-900 truncate">{shift.label}</p>
          <p className="text-[11px] text-neutral-500 inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-[12px]">group</span>
            {shift.slotsNeeded} người
          </p>
        </div>
        <RoleBadge role={shift.role} />
        <span
          className={`material-symbols-outlined text-[18px] ${
            used ? 'text-emerald-600 group-hover:text-rose-600' : 'text-emerald-600'
          }`}
        >
          {used ? 'check_circle' : 'add_circle'}
        </span>
      </button>
    </li>
  );
}

function RoleBadge({ role }: { role?: 'chef' | 'waiter' | 'shipper' }) {
  const tone =
    role === 'chef'
      ? 'bg-amber-100 text-amber-800'
      : role === 'waiter'
        ? 'bg-sky-100 text-sky-800'
        : role === 'shipper'
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-neutral-100 text-neutral-700';
  const icon =
    role === 'chef'
      ? 'skillet'
      : role === 'waiter'
        ? 'room_service'
        : role === 'shipper'
          ? 'local_shipping'
          : 'group';
  const label =
    role === 'chef'
      ? 'Đầu bếp'
      : role === 'waiter'
        ? 'Phục vụ'
        : role === 'shipper'
          ? 'Giao hàng'
          : 'Mọi vai trò';
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold ${tone}`}
    >
      <span className="material-symbols-outlined text-[12px]">{icon}</span>
      {label}
    </span>
  );
}

// ─── Dropdown cho Lịch trình ────────────────────────────────────────────────

export function ScheduleSuggestions({
  expectedServings,
}: BaseSuggestionsProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useClickOutside(open, () => setOpen(false));
  const { inserted, track, trackAll } = useInsertedTracker();

  // Lịch trình không scale, nhưng vẫn nhận prop để giúp "nhắc" tier cho UX
  // (lịch trình có thể khác nhau giữa quy mô nhỏ và lớn — vd bếp lớn
  // cần thêm mốc "kiểm tra số suất" và "họp tổng kết").
  const schedule = useMemo(() => {
    const items = [...SCHEDULE_TEMPLATES];
    const tier = getServingsTier(expectedServings || 0);
    if (tier === 'large') {
      // Bếp lớn cần thêm mốc "kiểm đếm suất từng đợt"
      if (!items.some((s) => s.id === 'sch-extra-count-1')) {
        items.splice(items.length - 1, 0, {
          id: 'sch-extra-count-1',
          time: '12:30',
          label: 'Kiểm đếm số suất đã phát, cập nhật dashboard',
        });
      }
    }
    return items;
  }, [expectedServings]);

  const remaining = schedule.filter((s) => !inserted.has(s.id)).length;

  return (
    <div className="block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${TONE_STYLES.sky}`}
      >
        <span className="material-symbols-outlined text-[16px]">
          {open ? 'close' : 'lightbulb'}
        </span>
        {open ? 'Đóng gợi ý' : 'Gợi ý lịch trình'}
      </button>

      {open && (
        <SuggestionPanel
          tone="sky"
          title="Mẫu lịch trình hoạt động"
          subtitle="Mốc thời gian gợi ý — có thể bỏ qua hoặc chỉnh lại giờ cho phù hợp."
          remainingCount={remaining}
          onInsertAll={() => {
            const pending = schedule.filter((s) => !inserted.has(s.id));
            pending.forEach((s) => fireInsert('schedule', s));
            trackAll(pending.map((s) => s.id));
            setTimeout(() => setOpen(false), 250);
          }}
        >
          <ol className="space-y-1.5">
            {schedule.map((s) => {
              const used = inserted.has(s.id);
              return (
                <ScheduleRow
                  key={s.id}
                  item={s}
                  used={used}
                  onInsert={() => {
                    fireInsert('schedule', s);
                    track(s.id);
                  }}
                />
              );
            })}
          </ol>
        </SuggestionPanel>
      )}
    </div>
  );
}

function ScheduleRow({
  item,
  used,
  onInsert,
}: {
  item: ScheduleTemplate;
  used: boolean;
  onInsert: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={used}
        onClick={onInsert}
        className={`w-full text-left rounded-xl border px-3 py-2 flex items-center gap-3 transition-colors ${
          used
            ? 'border-sky-200 bg-sky-50 opacity-60 cursor-default'
            : 'border-neutral-200 hover:border-sky-300 hover:bg-sky-50/40'
        }`}
      >
        <span className="shrink-0 min-w-[60px] text-xs font-extrabold text-neutral-700 bg-neutral-100 rounded-lg px-2 py-1 text-center">
          {item.time}
        </span>
        <p className="flex-1 text-sm text-neutral-700">{item.label}</p>
        <span className="material-symbols-outlined text-[18px] text-sky-600">
          {used ? 'check_circle' : 'add_circle'}
        </span>
      </button>
    </li>
  );
}

// ─── Dropdown cho Vật phẩm ──────────────────────────────────────────────────

export function SupplySuggestions({
  expectedServings,
}: BaseSuggestionsProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useClickOutside(open, () => setOpen(false));
  const { inserted, track, trackAll } = useInsertedTracker();

  const supplies = useMemo(
    () => buildScaledTemplates(expectedServings).supplies,
    [expectedServings],
  );
  const tier = getServingsTier(expectedServings || 0);

  const remaining = supplies.filter((s) => !inserted.has(s.id)).length;

  return (
    <div className="block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${TONE_STYLES.amber}`}
      >
        <span className="material-symbols-outlined text-[16px]">
          {open ? 'close' : 'lightbulb'}
        </span>
        {open ? 'Đóng gợi ý' : 'Gợi ý vật phẩm'}
      </button>

      {open && (
        <SuggestionPanel
          tier={tier}
          title="Mẫu vật phẩm cần thiết"
          subtitle={`Số lượng đã scale theo số suất (${expectedServings || 0} — tier ${TIER_LABEL[tier]}). Vật dụng cố định giữ nguyên.`}
          tone="amber"
          remainingCount={remaining}
          onInsertAll={() => {
            const pending = supplies.filter((s) => !inserted.has(s.id));
            pending.forEach((s) => fireInsert('supply', s));
            trackAll(pending.map((s) => s.id));
            setTimeout(() => setOpen(false), 250);
          }}
        >
          <ul className="space-y-1.5">
            {supplies.map((s) => {
              const used = inserted.has(s.id);
              return (
                <SupplyRow
                  key={s.id}
                  item={s}
                  used={used}
                  onInsert={() => {
                    fireInsert('supply', s);
                    track(s.id);
                  }}
                />
              );
            })}
          </ul>
        </SuggestionPanel>
      )}
    </div>
  );
}

function SupplyRow({
  item,
  used,
  onInsert,
}: {
  item: SupplyTemplate;
  used: boolean;
  onInsert: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={used}
        onClick={onInsert}
        className={`w-full text-left rounded-xl border px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
          used
            ? 'border-amber-200 bg-amber-50 opacity-60 cursor-default'
            : 'border-neutral-200 hover:border-amber-300 hover:bg-amber-50/40'
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-neutral-900 truncate">{item.name}</p>
          <p className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">scale</span>
            {item.quantity ?? '—'} {item.unit ?? ''}
          </p>
        </div>
        <span className="material-symbols-outlined text-[18px] text-amber-600">
          {used ? 'check_circle' : 'add_circle'}
        </span>
      </button>
    </li>
  );
}

// ─── Shared panel wrapper ───────────────────────────────────────────────────

function SuggestionPanel({
  title,
  subtitle,
  tone,
  tier,
  remainingCount,
  onInsertAll,
  children,
}: {
  title: string;
  subtitle: string;
  tone: 'emerald' | 'sky' | 'amber' | 'teal';
  tier?: ReturnType<typeof getServingsTier>;
  remainingCount: number;
  onInsertAll: () => void;
  children: React.ReactNode;
}) {
  const headerBg =
    tone === 'emerald'
      ? 'from-emerald-50 via-sky-50 to-amber-50'
      : tone === 'sky'
        ? 'from-sky-50 via-blue-50 to-emerald-50'
        : tone === 'amber'
          ? 'from-amber-50 via-orange-50 to-yellow-50'
          : 'from-teal-50 via-emerald-50 to-sky-50';
  const allBtnColor =
    tone === 'emerald'
      ? 'text-emerald-700 hover:text-emerald-900'
      : tone === 'sky'
        ? 'text-sky-700 hover:text-sky-900'
        : tone === 'amber'
          ? 'text-amber-700 hover:text-amber-900'
          : 'text-teal-700 hover:text-teal-900';
  const allBtnIcon =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'sky'
        ? 'text-sky-700'
        : tone === 'amber'
          ? 'text-amber-700'
          : 'text-teal-700';

  return (
    <div
      role="dialog"
      aria-label={title}
      className="z-30 mt-2 w-full rounded-2xl border-2 border-neutral-200 bg-white shadow-xl overflow-hidden"
    >
      <div className={`px-4 py-3 bg-gradient-to-r ${headerBg} border-b border-neutral-200`}>
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500">
          Mẫu có sẵn
        </p>
        <p className="text-sm font-bold text-neutral-900">{title}</p>
        {subtitle && (
          <p className="text-[11px] text-neutral-500 mt-0.5">{subtitle}</p>
        )}
        {tier && (
          <span
            className={`mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              tier === 'small'
                ? 'bg-emerald-100 text-emerald-800'
                : tier === 'medium'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-amber-100 text-amber-800'
            }`}
          >
            <span className="material-symbols-outlined text-[12px]">
              {tier === 'small' ? 'eco' : tier === 'medium' ? 'balance' : 'group'}
            </span>
            Quy mô {TIER_LABEL[tier]}
          </span>
        )}
      </div>

      <div className="max-h-[360px] overflow-y-auto p-3">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={onInsertAll}
            disabled={remainingCount === 0}
            className={`text-[11px] font-extrabold disabled:text-neutral-300 inline-flex items-center gap-1 ${allBtnColor}`}
          >
            <span className={`material-symbols-outlined text-[14px] ${allBtnIcon}`}>
              library_add
            </span>
            Thêm tất cả ({remainingCount})
          </button>
        </div>
        {children}
      </div>

      <div className="px-3 py-2 bg-neutral-50 border-t border-neutral-200">
        <p className="text-[10px] text-neutral-500">
          Bấm vào từng mẫu để chèn — có thể sửa lại sau.
        </p>
      </div>
    </div>
  );
}

// ─── Dropdown cho Thực đơn ────────────────────────────────────────────────

export function MenuSuggestions({
  supplies,
  expectedServings,
  currentMenuCount = 0,
}: {
  /** Danh sách vật phẩm user đã nhập — dùng để match gợi ý món ăn. */
  supplies: Array<{ name: string }>;
  expectedServings: number;
  /** Số món đã có trong thực đơn — để ước tính suất mỗi món sau khi thêm. */
  currentMenuCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useClickOutside(open, () => setOpen(false));
  const { inserted, track, trackAll } = useInsertedTracker();

  const matched = useMemo(
    () => buildMatchedMenuTemplates(supplies, expectedServings, currentMenuCount),
    [supplies, expectedServings, currentMenuCount],
  );

  // Nếu chưa nhập vật phẩm → không cho mở, hiển thị nút disabled kèm gợi ý.
  const disabled = supplies.length === 0;

  const remaining = matched.filter((m) => !inserted.has(m.id)).length;

  return (
    <div className="block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={
          disabled
            ? 'Thêm vật phẩm trước để nhận gợi ý món ăn phù hợp'
            : undefined
        }
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${TONE_STYLES.teal} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="material-symbols-outlined text-[16px]">
          {open ? 'close' : 'lightbulb'}
        </span>
        {open
          ? 'Đóng gợi ý'
          : disabled
            ? 'Gợi ý món ăn (thêm vật phẩm trước)'
            : `Gợi ý món ăn (${matched.length})`}
      </button>

      {open && !disabled && (
        <SuggestionPanel
          tone="teal"
          title="Mẫu món ăn phù hợp với vật phẩm của bạn"
          subtitle={`Dựa trên ${supplies.length} vật phẩm đã nhập — ${expectedServings} suất của chiến dịch sẽ được chia đều cho các món trong thực đơn.`}
          remainingCount={remaining}
          onInsertAll={() => {
            const pending = matched.filter((m) => !inserted.has(m.id));
            pending.forEach((m) => fireInsert('menu', m));
            trackAll(pending.map((m) => m.id));
            setTimeout(() => setOpen(false), 250);
          }}
        >
          {matched.length === 0 ? (
            <p className="text-[11px] text-neutral-500 italic px-2 py-3 text-center">
              Vật phẩm hiện tại chưa đủ để gợi ý món nào. Hãy bổ sung thêm
              gạo, rau, thịt, cá, trứng…
            </p>
          ) : (
            <ul className="space-y-1.5">
              {matched.map((m) => {
                const used = inserted.has(m.id);
                return (
                  <MenuRow
                    key={m.id}
                    item={m}
                    used={used}
                    onInsert={() => {
                      fireInsert('menu', m);
                      track(m.id);
                    }}
                  />
                );
              })}
            </ul>
          )}
        </SuggestionPanel>
      )}
    </div>
  );
}

const MEAL_TYPE_LABEL: Record<MenuTemplate['type'], string> = {
  breakfast: 'Bữa sáng',
  lunch: 'Bữa trưa',
  dinner: 'Bữa tối',
};

const MEAL_TYPE_TONE: Record<MenuTemplate['type'], string> = {
  breakfast: 'bg-yellow-100 text-yellow-800',
  lunch: 'bg-orange-100 text-orange-800',
  dinner: 'bg-indigo-100 text-indigo-800',
};

function MenuRow({
  item,
  used,
  onInsert,
}: {
  item: MenuTemplate;
  used: boolean;
  onInsert: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={used}
        onClick={onInsert}
        className={`w-full text-left rounded-xl border px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
          used
            ? 'border-teal-200 bg-teal-50 opacity-60 cursor-default'
            : 'border-neutral-200 hover:border-teal-300 hover:bg-teal-50/40'
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-neutral-900 truncate">
            {item.name}
          </p>
          <p className="text-[11px] text-neutral-500 inline-flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[12px]">
              restaurant
            </span>
            {item.plannedServings ? `~${item.plannedServings} suất` : '—'}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold ${MEAL_TYPE_TONE[item.type]}`}
        >
          {MEAL_TYPE_LABEL[item.type]}
        </span>
        <span className="material-symbols-outlined text-[18px] text-teal-600">
          {used ? 'check_circle' : 'add_circle'}
        </span>
      </button>
    </li>
  );
}

// ─── Backward-compat default export (nếu code cũ còn import) ──────────────
/**
 * @deprecated Tách thành 3 dropdown riêng để "đúng gợi ý cho từng field":
 * - <ShiftSuggestions />
 * - <ScheduleSuggestions />
 * - <SupplySuggestions />
 *
 * Default export giữ lại 1 lúc để không vỡ import ngoài ý muốn; trả về
 * panel trống. Có thể xoá sau khi đã sửa hết các import.
 */
export default function CreateCampaignSuggestions() {
  return null;
}