'use client';

import '../../campaigns/campaign-tokens.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, createContext, useContext, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useCampaignManageDetail,
  useStartCampaign,
  useCompleteCampaign,
  useCancelCampaign,
  type CampaignParticipant,
} from '@/hooks/useCampaigns';
import { errMsg, mediaUrl } from '@/lib/utils';
import { Modal } from '@/components/shared/Modal';

export const ROLE_LABEL: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

export const STATUS_META: Record<string, { label: string; chip: string; icon: string }> = {
  draft: { label: 'Chờ duyệt', chip: 'cm-chip cm-chip--honey', icon: 'pending' },
  open: { label: 'Đang tuyển', chip: 'cm-chip cm-chip--sky', icon: 'campaign' },
  in_progress: { label: 'Đang chạy', chip: 'cm-chip cm-chip--mint', icon: 'play_circle' },
  completed: { label: 'Đã hoàn tất', chip: 'cm-chip cm-chip--mint', icon: 'verified' },
  cancelled: { label: 'Đã huỷ', chip: 'cm-chip cm-chip--rose', icon: 'cancel' },
};

/** So sánh scheduledDate với hôm nay (UTC, lấy theo ngày). */
export function isSameUtcDay(input: string | Date | null | undefined, ref = new Date()): boolean {
  if (!input) return false;
  const d = new Date(input);
  return (
    d.getUTCFullYear() === ref.getUTCFullYear() &&
    d.getUTCMonth() === ref.getUTCMonth() &&
    d.getUTCDate() === ref.getUTCDate()
  );
}

/** Trả về số ngày từ hôm nay tới ngày kết thúc (âm = đã qua). */
export function daysUntilUtc(input: string | Date | null | undefined, ref = new Date()): number {
  if (!input) return 0;
  const d = new Date(input);
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const b = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  return Math.round((a - b) / 86_400_000);
}

type NavKey = 'progress' | 'registrations' | 'distribution' | 'menu' | 'schedule' | 'status';

const NAV_ITEMS: Array<{ key: NavKey; label: string; icon: string }> = [
  { key: 'progress', label: 'Tổng quan', icon: 'monitoring' },
  { key: 'registrations', label: 'Đăng ký chờ duyệt', icon: 'pending_actions' },
  { key: 'distribution', label: 'Phân phối suất ăn', icon: 'takeout_dining' },
  { key: 'menu', label: 'Thực đơn & Vật phẩm', icon: 'restaurant_menu' },
  { key: 'schedule', label: 'Lịch trình', icon: 'event' },
  { key: 'status', label: 'Trạng thái', icon: 'flag' },
];

const NAV_PATH: Record<NavKey, string | null> = {
  progress: null,
  registrations: 'registrations',
  distribution: 'distribution',
  menu: 'menu',
  schedule: 'schedule',
  status: 'status',
};

// ─── Campaign data type ────────────────────────────────────────────────────────
type CampaignData = {
  id: string;
  title: string;
  status: string;
  organizationName?: string | null;
  imageUrls?: string[];
  participants?: CampaignParticipant[];
  distributions?: Array<{
    id: string;
    roundLabel?: string | null;
    servingsServed: number;
    peopleServed: number;
    leftoverServings: number;
    servedBy: string;
    distributedAt: string;
    note?: string | null;
    photoUrl?: string | null;
    feedback?: unknown[];
  }>;
  donations?: Array<{
    id: string;
    itemName: string;
    quantity?: string | null;
    note?: string | null;
    status: string;
    provider?: { businessName?: string | null };
  }>;
  expectedServings?: number | null;
  actualServings?: number | null;
  distributionSummary?: { servingsServed: number; peopleServed: number };
  chefSlotsNeeded: number;
  waiterSlotsNeeded: number;
  shipperSlotsNeeded: number;
  chefSlotsFilled: number;
  waiterSlotsFilled: number;
  shipperSlotsFilled: number;
  menuItems?: { name: string; type: string; plannedServings?: number | null }[];
  scheduleItems?: { time: string; label: string }[];
  /** Ca trực (từ bảng campaign_shifts) — dùng cho trang /schedule. */
  shifts?: Array<{
    id: string;
    label: string;
    role: 'chef' | 'waiter' | 'shipper' | null;
    startTime: string;
    endTime: string;
    slotsNeeded: number;
    slotsFilled: number;
  }>;
  /** Vật phẩm: campaign cũ lưu string, campaign mới lưu object {name, quantity, unit}. */
  supplyItems?:
    | string[]
    | Array<{ name: string; quantity?: number | null; unit?: string | null }>;
  scheduledDate?: string;
  endDate?: string | null;
  startTime?: string;
  endTime?: string;
};

// ─── Context ──────────────────────────────────────────────────────────────────
export type ActionKind = 'complete' | 'cancel';
export const ManageContext = createContext<{
  campaign: CampaignData;
  /** Mở modal Hoàn tất / Huỷ chiến dịch từ bất kỳ trang con nào. */
  openAction: (kind: ActionKind) => void;
} | null>(null);

export function useManageContext() {
  const ctx = useContext(ManageContext);
  if (!ctx) throw new Error('useManageContext must be used inside ManageShell');
  return ctx;
}

// ─── ManageShell ──────────────────────────────────────────────────────────────
export function ManageShell({
  campaignId,
  children,
}: {
  campaignId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { data: c, isLoading, isError } = useCampaignManageDetail(campaignId);
  const startCampaign = useStartCampaign();
  const completeCampaign = useCompleteCampaign();
  const cancelCampaign = useCancelCampaign();
  const [actionModal, setActionModal] = useState<
    | { kind: 'complete' }
    | { kind: 'cancel' }
    | null
  >(null);
  const activeKey: NavKey = useMemo(() => {
    if (!pathname) return 'progress';
    if (pathname.endsWith('/registrations')) return 'registrations';
    if (pathname.endsWith('/distribution')) return 'distribution';
    if (pathname.endsWith('/menu')) return 'menu';
    if (pathname.endsWith('/schedule')) return 'schedule';
    if (pathname.endsWith('/status')) return 'status';
    return 'progress';
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="cm-scope">
        <div className="cm-manage-page">
          <div className="cm-manage-hero skeleton" />
          <div className="cm-manage-grid">
            <aside className="cm-manage-sidebar">
              <p className="cm-manage-sidebar-title">Quản lý Bếp</p>
              <nav className="flex flex-col gap-1">
                {NAV_ITEMS.map((item) => (
                  <div key={item.key} className="cm-manage-nav-item">
                    <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                    <div className="h-4 w-24 skeleton rounded" />
                  </div>
                ))}
              </nav>
            </aside>
            <main className="cm-manage-main space-y-4">
              <div className="h-48 skeleton rounded-2xl" />
              <div className="h-64 skeleton rounded-2xl" />
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !c) {
    return (
      <div className="cm-scope">
        <div className="cm-manage-page text-center py-20">
          <div className="w-20 h-20 mx-auto rounded-full bg-rose-50 flex items-center justify-center">
            <span className="material-symbols-outlined text-rose-600 text-[40px]">error</span>
          </div>
          <p className="font-bold text-neutral-700 mt-4">Không tìm thấy chiến dịch</p>
          <Link href="/campaigns" className="inline-flex items-center gap-2 mt-5 cm-btn-ember">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Quay lại
          </Link>
        </div>
      </div>
    );
  }

  const heroImage = c.imageUrls?.[0] ? mediaUrl(c.imageUrls[0]) : null;
  const statusMeta = STATUS_META[c.status];
  const pendingCount = c.participants?.length ?? 0;
  const distCount = c.distributions?.length ?? 0;

  function hrefFor(key: NavKey): string {
    if (key === 'progress') return `/campaigns/${c!.id}/manage`;
    return `/campaigns/${c!.id}/manage/${NAV_PATH[key]}`;
  }

  async function onStart() {
    try {
      await startCampaign.mutateAsync(c!.id);
      toast.success('Đã bắt đầu chiến dịch');
    } catch (e) {
      toast.error(errMsg(e, 'Không thể bắt đầu — kiểm tra trạng thái'));
    }
  }
  async function onComplete(payload: {
    actualServings: number;
    earlyEndConfirmation?: 'EARLY_END';
    earlyEndReason?: string;
  }) {
    try {
      await completeCampaign.mutateAsync({
        id: c!.id,
        actualServings: payload.actualServings,
        earlyEndConfirmation: payload.earlyEndConfirmation,
        earlyEndReason: payload.earlyEndReason,
      });
      toast.success('Đã hoàn tất chiến dịch');
      setActionModal(null);
    } catch (e) {
      toast.error(errMsg(e, 'Không thể hoàn tất'));
    }
  }
  async function onCancel() {
    try {
      await cancelCampaign.mutateAsync(c!.id);
      toast.success('Đã huỷ chiến dịch');
      setActionModal(null);
    } catch (e) {
      toast.error(errMsg(e, 'Không thể huỷ'));
    }
  }

  return (
    <div className="cm-scope">
      <div className="cm-manage-page">
        {/* Hero */}
        <div className="cm-manage-hero">
          {heroImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroImage} alt={c.title} />
          )}
          <Link href={`/campaigns/${c.id}`} className="cm-manage-hero-back" aria-label="Quay lại">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div className="cm-manage-hero-actions">
            <span className={`${statusMeta.chip} backdrop-blur-md`}>
              <span className="material-symbols-outlined text-[14px]">{statusMeta.icon}</span>
              {statusMeta.label}
            </span>
            {c.status === 'open' && (() => {
              const canStart = isSameUtcDay(c.scheduledDate);
              const days = daysUntilUtc(c.scheduledDate);
              const hint =
                days > 0
                  ? `Còn ${days} ngày nữa mới tới ngày diễn ra`
                  : days < 0
                    ? `Đã qua ngày dự kiến ${Math.abs(days)} ngày — không thể bắt đầu`
                    : '';
              return (
                <button
                  type="button"
                  onClick={onStart}
                  disabled={!canStart || startCampaign.isPending}
                  title={hint || 'Bắt đầu chiến dịch'}
                  className="px-3 py-1.5 rounded-xl bg-[#236c2a] hover:bg-[#1a4f1f] text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                  {startCampaign.isPending
                    ? 'Đang bắt đầu...'
                    : canStart
                      ? 'Bắt đầu'
                      : days > 0
                        ? `Bắt đầu sau ${days} ngày`
                        : 'Quá ngày'}
                </button>
              );
            })()}
            {c.status === 'in_progress' && (
              <button
                type="button"
                onClick={() => setActionModal({ kind: 'complete' })}
                disabled={completeCampaign.isPending}
                className="px-3 py-1.5 rounded-xl bg-[#236c2a] hover:bg-[#1a4f1f] text-white text-xs font-bold inline-flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">verified</span>
                Hoàn tất
              </button>
            )}
          </div>
          <div className="cm-manage-hero-content">
            <p className="cm-manage-hero-eyebrow">
              {c.organizationName ?? 'Chiến dịch của bạn'}
            </p>
            <h1 className="cm-manage-hero-title">{c.title}</h1>
          </div>
        </div>

        {/* Grid: sidebar + main */}
        <div className="cm-manage-grid">
          <aside className="cm-manage-sidebar">
            <p className="cm-manage-sidebar-title">Quản lý Bếp</p>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.key}
                  href={hrefFor(item.key)}
                  aria-current={activeKey === item.key}
                  className="cm-manage-nav-item"
                >
                  <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.key === 'registrations' && pendingCount > 0 && (
                    <span className="badge">{pendingCount}</span>
                  )}
                  {item.key === 'distribution' && distCount > 0 && (
                    <span className="badge">{distCount}</span>
                  )}
                </Link>
              ))}
            </nav>

            <div className="border-t border-neutral-100 mt-3 pt-3 space-y-1">
              <Link href={`/campaigns/${c.id}`} className="cm-manage-nav-item">
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                Xem trang công khai
              </Link>
              <Link href={`/campaigns/${c.id}/edit`} className="cm-manage-nav-item">
                <span className="material-symbols-outlined text-[18px]">edit</span>
                Chỉnh sửa chiến dịch
              </Link>
              {c.status === 'in_progress' && (
                <button
                  type="button"
                  onClick={() => setActionModal({ kind: 'cancel' })}
                  className="cm-manage-nav-item !text-rose-700 hover:!bg-rose-50"
                >
                  <span className="material-symbols-outlined text-[18px]">cancel</span>
                  Huỷ chiến dịch
                </button>
              )}
            </div>
          </aside>

          <main className="cm-manage-main">
            <ManageContext.Provider
              value={{
                campaign: c as CampaignData,
                openAction: (kind) => setActionModal({ kind }),
              }}
            >
              {children}
            </ManageContext.Provider>
          </main>
        </div>
      </div>

      {/* Modal xác nhận hành động quản lý */}
      {actionModal?.kind === 'complete' && (
        <CompleteCampaignModal
          c={c as CampaignData}
          onCancel={() => setActionModal(null)}
          onConfirm={onComplete}
          pending={completeCampaign.isPending}
        />
      )}
      {actionModal?.kind === 'cancel' && (
        <CancelCampaignModal
          c={c as CampaignData}
          onCancel={() => setActionModal(null)}
          onConfirm={onCancel}
          pending={cancelCampaign.isPending}
        />
      )}
    </div>
  );
}

// ─── Modal: Hoàn tất chiến dịch (validation inline + early-end confirmation) ─
function CompleteCampaignModal({
  c,
  onCancel,
  onConfirm,
  pending,
}: {
  c: CampaignData;
  onCancel: () => void;
  onConfirm: (payload: {
    actualServings: number;
    earlyEndConfirmation?: 'EARLY_END';
    earlyEndReason?: string;
  }) => void | Promise<void>;
  pending: boolean;
}) {
  const defaultServings =
    c.actualServings ?? c.distributionSummary?.servingsServed ?? c.expectedServings ?? 0;
  const [value, setValue] = useState<string>(String(defaultServings));
  const [error, setError] = useState<string | undefined>(undefined);

  // Phát hiện "kết thúc sớm": còn cách ngày kết thúc (endDate hoặc scheduledDate) ≥ 1 ngày.
  const endDateRaw = c.endDate ?? c.scheduledDate ?? null;
  const daysToEnd = daysUntilUtc(endDateRaw);
  const isPremature = daysToEnd > 0;

  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);

  function validateServings(): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Vui lòng nhập số suất ăn thực tế');
      return null;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || Number.isNaN(n)) {
      setError('Số suất phải là số hợp lệ');
      return null;
    }
    if (n < 0) {
      setError('Số suất không được âm');
      return null;
    }
    if (n > 1_000_000) {
      setError('Số suất tối đa 1.000.000');
      return null;
    }
    if (!Number.isInteger(n)) {
      setError('Số suất phải là số nguyên');
      return null;
    }
    setError(undefined);
    return n;
  }

  function onSubmit() {
    const n = validateServings();
    if (n === null) return;

    if (isPremature) {
      if (!ack) {
        setReasonError('Vui lòng tick xác nhận trước khi kết thúc sớm.');
        return;
      }
      const trimmedReason = reason.trim();
      if (trimmedReason.length < 5) {
        setReasonError('Lý do tối thiểu 5 ký tự');
        return;
      }
      if (trimmedReason.length > 500) {
        setReasonError('Lý do tối đa 500 ký tự');
        return;
      }
      void onConfirm({
        actualServings: n,
        earlyEndConfirmation: 'EARLY_END',
        earlyEndReason: trimmedReason,
      });
      return;
    }

    void onConfirm({ actualServings: n });
  }

  const endLabel = endDateRaw
    ? new Date(endDateRaw).toLocaleDateString('vi-VN')
    : '—';

  return (
    <Modal
      onClose={onCancel}
      align="center"
      className="bg-white rounded-3xl border border-neutral-150 w-full max-w-md elevation-3 overflow-hidden"
    >
      <div className="bg-brand-gradient px-6 py-5 text-white">
        <h3 className="font-extrabold text-lg flex items-center gap-2">
          <span className="material-symbols-outlined">verified</span>
          Hoàn tất chiến dịch
        </h3>
        <p className="text-xs text-white/80 mt-1">
          {c.title}
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px]">warning</span>
          Hành động này <b>không thể hoàn tác</b>. Sau khi hoàn tất, chiến dịch sẽ chuyển sang trạng thái &quot;Đã hoàn tất&quot; và tổng kết suất ăn phục vụ.
        </div>

        {isPremature && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 space-y-2">
            <p className="font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">priority_high</span>
              Bạn đang muốn kết thúc sớm
            </p>
            <p>
              Ngày kết thúc dự kiến: <b>{endLabel}</b> — còn{' '}
              <b>{daysToEnd} ngày</b> nữa. Bạn có chắc chắn muốn kết thúc ngay bây giờ không?
            </p>
            <label className="flex items-start gap-2 mt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => {
                  setAck(e.target.checked);
                  if (e.target.checked) setReasonError(undefined);
                }}
                className="mt-0.5 h-4 w-4 accent-rose-600"
              />
              <span className="text-rose-900">
                Tôi chắc chắn muốn kết thúc chiến dịch sớm hơn dự kiến.
              </span>
            </label>
            <div className="space-y-1 pt-1">
              <label className="text-[11px] font-bold text-rose-900 uppercase tracking-wide">
                Lý do kết thúc sớm <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError) setReasonError(undefined);
                }}
                placeholder="VD: Thiếu nguyên liệu đột xuất, không thể tiếp tục phục vụ."
                className={`input-base ${reasonError ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
              />
              {reasonError ? (
                <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">error</span>
                  {reasonError}
                </p>
              ) : (
                <p className="text-[10px] text-rose-700/70">{reason.length}/500 ký tự</p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide">
            Số suất ăn thực tế đã phục vụ <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            min={0}
            max={1_000_000}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(undefined);
            }}
            onBlur={() => validateServings()}
            placeholder="VD: 150"
            className={`input-base ${error ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            aria-invalid={!!error}
          />
          {error ? (
            <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">error</span>
              {error}
            </p>
          ) : (
            <p className="text-[11px] text-neutral-400">
              Đã phân phối: <b>{c.distributionSummary?.servingsServed ?? 0} suất</b> · Dự kiến ban đầu:{' '}
              <b>{c.expectedServings ?? '—'} suất</b>
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 font-bold text-sm rounded-xl"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || (isPremature && (!ack || reason.trim().length < 5))}
            className="flex-1 py-3 bg-[#236c2a] hover:bg-[#1a4f1f] text-white font-bold text-sm rounded-xl disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
          >
            {pending ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Đang hoàn tất...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">verified</span>
                {isPremature ? 'Xác nhận kết thúc sớm' : 'Xác nhận hoàn tất'}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: Huỷ chiến dịch (bắt buộc nhập lý do) ────────────────────────────
function CancelCampaignModal({
  c,
  onCancel,
  onConfirm,
  pending,
}: {
  c: CampaignData;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  pending: boolean;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  function validateAndSubmit() {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError('Vui lòng nhập lý do huỷ (tối thiểu 5 ký tự)');
      return;
    }
    if (trimmed.length > 500) {
      setError('Lý do tối đa 500 ký tự');
      return;
    }
    setError(undefined);
    void onConfirm();
  }

  return (
    <Modal
      onClose={onCancel}
      align="center"
      className="bg-white rounded-3xl border border-neutral-150 w-full max-w-md elevation-3 overflow-hidden"
    >
      <div className="bg-gradient-to-br from-rose-600 to-rose-700 px-6 py-5 text-white">
        <h3 className="font-extrabold text-lg flex items-center gap-2">
          <span className="material-symbols-outlined">cancel</span>
          Huỷ chiến dịch
        </h3>
        <p className="text-xs text-white/80 mt-1">{c.title}</p>
      </div>
      <div className="p-6 space-y-4">
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px]">info</span>
          Tất cả tình nguyện viên đã đăng ký sẽ nhận được thông báo huỷ. Hành động này <b>không thể hoàn tác</b>.
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide">
            Lý do huỷ <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(undefined);
            }}
            onBlur={() => {
              if (reason.trim().length > 0 && reason.trim().length < 5)
                setError('Lý do tối thiểu 5 ký tự');
            }}
            rows={3}
            maxLength={500}
            placeholder="VD: Bếp bận đột xuất do sự cố điện — không thể tổ chức vào ngày mai."
            className={`input-base ${error ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            aria-invalid={!!error}
          />
          {error ? (
            <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">error</span>
              {error}
            </p>
          ) : (
            <p className="text-[11px] text-neutral-400">{reason.length}/500 ký tự</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 font-bold text-sm rounded-xl"
          >
            Quay lại
          </button>
          <button
            type="button"
            onClick={validateAndSubmit}
            disabled={pending}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {pending ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Đang huỷ...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">cancel</span>
                Xác nhận huỷ
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
