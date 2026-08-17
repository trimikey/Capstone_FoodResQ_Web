'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useManageContext } from '../../../_components/ManageShell';
import ShiftFormModal from '../../../_components/ShiftFormModal';
import { useDeleteShift, type CampaignShift } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

type ColumnKey = 'prep' | 'cook' | 'ship';

const COLUMNS: Array<{ key: ColumnKey; label: string; icon: string; tone: string }> = [
  { key: 'prep', label: 'Sơ chế', icon: 'content_cut', tone: 'honey' },
  { key: 'cook', label: 'Nấu nướng', icon: 'soup_kitchen', tone: 'ember' },
  { key: 'ship', label: 'Vận chuyển', icon: 'local_shipping', tone: 'emerald' },
];

/** Ca không được sửa / xoá / thêm khi chiến dịch đã chạy */
function isReadOnly(status?: string) {
  return status === 'in_progress' || status === 'completed';
}

const SHIFT_KEYWORDS: Record<ColumnKey, string[]> = {
  prep: ['sơ chế', 'prep', 'rửa', 'cắt', 'vo gạo', 'chuẩn bị'],
  cook: ['nấu', 'nấu nướng', 'nau', 'cook', 'chế biến', 'xào', 'chiên', 'hấp', 'luộc'],
  ship: ['giao', 'vận chuyển', 'ship', 'phát', 'phân phát', 'giao hàng'],
};

function classifyColumn(label: string): ColumnKey {
  const lower = label.toLowerCase();
  for (const key of ['prep', 'cook', 'ship'] as ColumnKey[]) {
    if (SHIFT_KEYWORDS[key].some((kw) => lower.includes(kw))) return key;
  }
  return 'cook';
}

export default function SchedulePage() {
  const { campaign: c } = useManageContext();
  const [shiftForm, setShiftForm] = useState<{ open: boolean; shift?: CampaignShift }>({ open: false });
  const [menuFor, setMenuFor] = useState<string | null>(null); // shiftId đang mở popover
  const deleteShift = useDeleteShift();
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click ngoài → đóng popover
  useEffect(() => {
    if (!menuFor) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuFor(null);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuFor]);

  const items = useMemo(() => {
    type Item = {
      id: string;
      time: string;
      label: string;
      column: ColumnKey;
      raw: CampaignShift | undefined;
    };
    // Ưu tiên lấy từ c.shifts (bảng thật); fallback c.scheduleItems (jsonb cũ).
    if (c?.shifts && c.shifts.length > 0) {
      return c.shifts.map<Item>((s) => ({
        id: s.id,
        time: `${s.startTime}–${s.endTime}`,
        label: s.label,
        column: classifyColumn(s.label + ' ' + (s.role ?? '')) as ColumnKey,
        raw: s,
      }));
    }
    const raw = c?.scheduleItems ?? [];
    return raw.map<Item>((it, idx) => ({
      id: `sc-${idx}`,
      time: it.time,
      label: it.label,
      column: classifyColumn(it.label),
      raw: undefined,
    }));
  }, [c?.shifts, c?.scheduleItems]);

  const grouped = useMemo(() => {
    const map: Record<ColumnKey, Array<{
      id: string; time: string; label: string; column: ColumnKey; raw: CampaignShift | undefined;
    }>> = { prep: [], cook: [], ship: [] };
    for (const it of items) map[it.column].push(it);
    return map;
  }, [items]);

  const campaignStatus = c?.status;
  const readOnly = isReadOnly(campaignStatus);

  async function onDelete(shiftId: string, label: string) {
    if (!confirm(`Xoá ca "${label}"? Hành động không thể hoàn tác.`)) return;
    try {
      await deleteShift.mutateAsync({ campaignId: c!.id, shiftId });
      toast.success('Đã xoá ca trực');
    } catch (e) {
      toast.error(errMsg(e, 'Xoá ca thất bại'));
    } finally {
      setMenuFor(null);
    }
  }

  // Header title lấy từ c.title (không hardcode "Tuần 42")
  const headerTitle = c?.title ?? 'Lịch trình chiến dịch';
  const scheduledDate = c?.scheduledDate ? new Date(c.scheduledDate) : null;
  const dateRangeLabel = scheduledDate
    ? scheduledDate.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'Chưa có ngày';

  if (!c) return null;

  return (
    <div className="cm-schedule-page">
      {/* Header */}
      <section className="cm-manage-card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="cm-manage-card-title !mb-1">
              <span className="material-symbols-outlined">event</span>
              {headerTitle}
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Lịch trình các ca — phân theo sơ chế, nấu nướng, vận chuyển
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-700">{dateRangeLabel}</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setShiftForm({ open: true })}
                className="cm-manage-cta-primary inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Thêm ca
              </button>
            )}
          </div>
        </div>
      </section>

      {items.length === 0 ? (
          <div className="cm-manage-card mt-4">
          <div className="cm-mini-empty">
            <span className="material-symbols-outlined text-[32px]">event_busy</span>
            <p className="mt-2">Chưa có lịch trình cho chiến dịch này.</p>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setShiftForm({ open: true })}
                className="cm-manage-cta-primary mt-4 inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Thêm ca đầu tiên
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Kanban board */
        <div className="cm-kanban mt-4">
          {COLUMNS.map((col) => {
            const list = grouped[col.key];
            return (
              <div key={col.key} className="cm-kanban-col">
                <div className="cm-kanban-col-head">
                  <span className={`cm-kanban-col-icon cm-kanban-col-icon--${col.tone}`}>
                    <span className="material-symbols-outlined text-[18px]">{col.icon}</span>
                  </span>
                  <h3 className="cm-kanban-col-title">{col.label}</h3>
                  <span className="cm-kanban-col-count">{list.length}</span>
                </div>
                <div className="cm-kanban-list">
                  {list.length === 0 ? (
                    <div className="cm-kanban-empty">
                      <span className="material-symbols-outlined text-[28px]">inbox</span>
                      <p className="text-xs text-neutral-400 mt-1">Không có ca</p>
                    </div>
                  ) : (
                    list.map((t) => (
                      <ShiftCard
                        key={t.id}
                        id={t.id}
                        time={t.time}
                        label={t.label}
                        slotsFilled={t.raw?.slotsFilled}
                        slotsNeeded={t.raw?.slotsNeeded}
                        canEdit={!!t.raw}
                        readOnly={readOnly}
                        onEdit={() => t.raw && setShiftForm({ open: true, shift: t.raw })}
                        onDelete={() => t.raw && onDelete(t.raw.id, t.raw.label)}
                        menuOpen={menuFor === t.id}
                        onToggleMenu={() => setMenuFor(menuFor === t.id ? null : t.id)}
                        menuRef={menuRef}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {shiftForm.open && (
        <ShiftFormModal
          campaignId={c!.id}
          shift={shiftForm.shift}
          readOnly={readOnly}
          onClose={() => setShiftForm({ open: false })}
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ShiftCard({
  id,
  time,
  label,
  slotsFilled,
  slotsNeeded,
  canEdit,
  readOnly,
  onEdit,
  onDelete,
  menuOpen,
  onToggleMenu,
  menuRef,
}: {
  id: string;
  time: string;
  label: string;
  slotsFilled?: number;
  slotsNeeded?: number;
  canEdit: boolean;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="cm-kanban-card">
      <div className="flex items-start justify-between gap-2">
        <h4 className="cm-kanban-card-title">{label}</h4>
        {canEdit && !readOnly && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={onToggleMenu}
              className="cm-kanban-card-menu"
              aria-label="Tuỳ chọn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="material-symbols-outlined text-[14px]">more_horiz</span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-xl border border-neutral-200 bg-white shadow-lg overflow-hidden"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={onEdit}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 inline-flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  Sửa ca
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={onDelete}
                  className="w-full text-left px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 inline-flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  Xoá ca
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2 text-[11px] font-bold text-neutral-600">
        <span className="material-symbols-outlined text-[14px]">schedule</span>
        <span>{time}</span>
      </div>
      {slotsNeeded != null && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-neutral-500">
          <span className="material-symbols-outlined text-[12px]">group</span>
          <span>
            {slotsFilled ?? 0}/{slotsNeeded} người
          </span>
        </div>
      )}
    </div>
  );
}
