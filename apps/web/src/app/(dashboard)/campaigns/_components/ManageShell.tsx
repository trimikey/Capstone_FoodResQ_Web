'use client';

import '../../campaigns/campaign-tokens.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, createContext, useContext, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useCampaignManageDetail,
  useStaffingReadiness,
  useExtendRecruitment,
  useStartCampaign,
  useCompleteCampaign,
  useCancelCampaign,
  type CampaignManageParticipant,
  type DishProcessItem,
  type DistributionPoint,
  type StaffingReadiness,
} from '@/hooks/useCampaigns';
import { errMsg, mediaUrl } from '@/lib/utils';
import { Modal } from '@/components/shared/Modal';

export const ROLE_LABEL: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

export const STATUS_META: Record<string, { label: string; chip: string; icon: string }> = {
  pending_approval: { label: 'Chờ duyệt', chip: 'cm-chip cm-chip--honey', icon: 'pending' },
  approved: { label: 'Đã duyệt', chip: 'cm-chip cm-chip--sky', icon: 'campaign' },
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

type NavKey = 'progress' | 'registrations' | 'kitchen' | 'distribution' | 'logistics' | 'menu' | 'schedule' | 'status';

const NAV_ITEMS: Array<{ key: NavKey; label: string; icon: string }> = [
  { key: 'progress', label: 'Tổng quan', icon: 'monitoring' },
  { key: 'registrations', label: 'Đăng ký chờ duyệt', icon: 'pending_actions' },
  { key: 'kitchen', label: 'Quy trình bếp', icon: 'skillet' },
  { key: 'distribution', label: 'Phân phối suất ăn', icon: 'takeout_dining' },
  { key: 'logistics', label: 'Giao & nhận hàng', icon: 'local_shipping' },
  { key: 'menu', label: 'Thực đơn & Vật phẩm', icon: 'restaurant_menu' },
  { key: 'schedule', label: 'Lịch trình', icon: 'event' },
  { key: 'status', label: 'Trạng thái', icon: 'flag' },
];

const NAV_PATH: Record<NavKey, string | null> = {
  progress: null,
  registrations: 'registrations',
  kitchen: 'kitchen',
  distribution: 'distribution',
  logistics: 'logistics',
  menu: 'menu',
  schedule: 'schedule',
  status: 'status',
};
const CAMPAIGN_HERO_FALLBACK = '/vn-pho.jpg';

// ─── Campaign data type ────────────────────────────────────────────────────────
type CampaignData = {
  id: string;
  title: string;
  status: string;
  recruitmentStatus?: 'scheduled' | 'open' | 'staffed' | 'expired_understaffed' | 'closed_ready';
  operationStartAt?: string;
  operationEndAt?: string;
  recruitmentStartAt?: string;
  recruitmentEndAt?: string;
  recruitmentBufferHours?: number;
  organizationName?: string | null;
  imageUrls?: string[];
  /** Nhân sự đã tuyển so với ngưỡng tối thiểu do admin cấu hình. */
  staffing?: { filled: number; needed: number; percent: number; minPercent: number };
  /** Toạ độ bếp — mốc mở bản đồ khi ghim điểm phát. Null nếu chiến dịch chưa ghim vị trí. */
  kitchenLng?: number | null;
  kitchenLat?: number | null;
  participants?: CampaignManageParticipant[];
  distributions?: Array<{
    id: string;
    roundLabel?: string | null;
    servingsServed: number;
    peopleServed: number;
    /** Số THỰC TẾ shipper báo lúc chốt — FE ưu tiên hiển thị khi completedAt có giá trị. */
    actualServings?: number | null;
    actualPeopleServed?: number | null;
    leftoverServings: number;
    /** TNV đứng tên chính — người đầu tiên trong `assignees`. */
    servedBy: string;
    /** Toàn bộ shipper được phân công đi phát đợt này (rỗng với đợt tạo trước đây). */
    assignees: Array<{ volunteerId: string; fullName: string }>;
    /** Điểm phát kèm địa chỉ để shipper điều hướng tới. */
    points: DistributionPoint[];
    distributedAt: string;
    /** null = mới lên kế hoạch (chưa vào thống kê). Có giá trị = đã phát xong. */
    completedAt: string | null;
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
    createdAt?: string;
    receivedAt?: string | null;
    pickupDate?: string | null;
    pickupStartTime?: string | null;
    pickupEndTime?: string | null;
    /** DS assignment id shipper được cử đi nhận — tra tên qua participants. */
    pickupAssigneeIds?: string[];
    provider?: { businessName?: string | null; address?: string | null; contactPhone?: string | null };
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
  /** Quy trình bếp: món + 4 khâu + ảnh bằng chứng (chỉ có khi in_progress). */
  dishSteps?: DishProcessItem[];
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
  const { data: readiness } = useStaffingReadiness(campaignId);
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
    if (pathname.endsWith('/kitchen')) return 'kitchen';
    if (pathname.endsWith('/distribution')) return 'distribution';
    if (pathname.endsWith('/logistics')) return 'logistics';
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

  const heroImage = c.imageUrls?.[0] ? mediaUrl(c.imageUrls[0]) : CAMPAIGN_HERO_FALLBACK;
  const statusMeta = STATUS_META[c.status] ?? STATUS_META.pending_approval;
  const pendingCount = c.participants?.filter((p) => !p.status || p.status === 'pending' || p.status === 'applied').length ?? 0;
  const distCount = c.distributions?.length ?? 0;

  function hrefFor(key: NavKey): string {
    if (key === 'progress') return `/campaigns/${c!.id}/manage`;
    return `/campaigns/${c!.id}/manage/${NAV_PATH[key]}`;
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImage}
            alt={c.title}
            // Ảnh cũ lưu /uploads local có thể đã mất file (đổi máy/deploy) —
            // rơi về ảnh mặc định thay vì icon ảnh vỡ trên hero.
            onError={(e) => {
              const img = e.currentTarget;
              if (img.dataset.fallback !== '1') {
                img.dataset.fallback = '1';
                img.src = CAMPAIGN_HERO_FALLBACK;
              }
            }}
          />
          {/* Về danh sách chiến dịch của tổ chức, KHÔNG về trang chi tiết công khai
              của chính chiến dịch đang mở — đó là đi tới, không phải quay lại. */}
          <Link
            href="/campaigns?tab=mine"
            className="cm-manage-hero-back"
            aria-label="Quay lại danh sách chiến dịch"
            title="Quay lại danh sách chiến dịch"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div className="cm-manage-hero-actions">
            <span className={`${statusMeta.chip} backdrop-blur-md`}>
              <span className="material-symbols-outlined text-[14px]">{statusMeta.icon}</span>
              {statusMeta.label}
            </span>
            {c.status === 'approved' && readiness && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur-md ${readiness.ready ? 'bg-emerald-100/90 text-emerald-800' : 'bg-amber-100/90 text-amber-800'}`}
              >
                <span className="material-symbols-outlined text-[14px]">group</span>
                {readiness.assignedShiftSlots} phân công · {readiness.confirmedShiftSlots} xác nhận
              </span>
            )}
            {c.status === 'approved' && readiness && (
              <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-neutral-700">
                {readiness.ready
                  ? 'Đủ 100% · tự bắt đầu đúng giờ'
                  : readiness.eligibleToStart
                    ? `Đạt ${readiness.minimumFillPercent}% · được bắt đầu đúng giờ`
                    : `Chờ đạt ${readiness.minimumFillPercent}% từng ca/vai trò`}
              </span>
            )}
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
              {['pending_approval', 'approved'].includes(c.status) && (
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
            {c.status === 'approved' && readiness && (
              <RecruitmentReadinessPanel campaignId={c.id} readiness={readiness} />
            )}
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

const RECRUITMENT_LABEL: Record<string, string> = {
  scheduled: 'Sắp mở tuyển',
  open: 'Đang tuyển',
  staffed: 'Đã đủ nhân sự',
  expired_understaffed: 'Hết hạn — còn thiếu người',
  closed_ready: 'Đã đóng tuyển — sẵn sàng',
};

function toVnLocalInput(date: Date) {
  return new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0, 16);
}

function RecruitmentReadinessPanel({
  campaignId,
  readiness,
}: {
  campaignId: string;
  readiness: StaffingReadiness;
}) {
  const extend = useExtendRecruitment();
  const startCampaign = useStartCampaign();
  const [newDeadline, setNewDeadline] = useState('');
  const [continueRecruiting, setContinueRecruiting] = useState(false);
  // Bảng ma trận ngày·ca·vai trò có thể rất dài — mặc định thu gọn thành 1 dòng
  // tóm tắt, bấm "Xem chi tiết từng ca" mới xổ bảng đầy đủ.
  const [showMatrix, setShowMatrix] = useState(false);
  const shiftsEligible = readiness.matrix.filter((row) => row.eligibleToStart).length;
  const latest = new Date(
    new Date(readiness.operationStartAt).getTime() - readiness.recruitmentBufferHours * 3600_000,
  );
  const canExtend = latest > new Date(readiness.recruitmentEndAt);

  async function submitExtension() {
    if (!newDeadline) return toast.error('Chọn hạn tuyển mới.');
    try {
      await extend.mutateAsync({ campaignId, recruitmentEndAt: `${newDeadline}:00+07:00` });
      toast.success('Đã gia hạn thời gian tuyển.');
      setNewDeadline('');
    } catch (error) {
      toast.error(errMsg(error, 'Không thể gia hạn tuyển'));
    }
  }

  async function startNow() {
    try {
      await startCampaign.mutateAsync(campaignId);
      toast.success('Chiến dịch đã bắt đầu.');
    } catch (error) {
      toast.error(errMsg(error, 'Không thể bắt đầu chiến dịch'));
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">Tiến trình tuyển và vận hành</p>
          <h2 className="mt-1 text-lg font-extrabold text-neutral-900">{RECRUITMENT_LABEL[readiness.recruitmentStatus]}</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {readiness.assignedUniqueVolunteers} TNV đã phân công · {readiness.confirmedUniqueVolunteers} đã xác nhận
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {readiness.assignedShiftSlots}/{readiness.requiredShiftSlots} lượt ca đã phân công · {readiness.confirmedShiftSlots}/{readiness.requiredShiftSlots} đã xác nhận
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${readiness.eligibleToStart ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {readiness.ready
            ? 'Đủ 100% từng ca'
            : readiness.eligibleToStart
              ? `Đạt ngưỡng ${readiness.minimumFillPercent}%`
              : `Chưa đạt ngưỡng ${readiness.minimumFillPercent}%`}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold">
        {['Chờ duyệt', 'Mở tuyển', 'Đạt ngưỡng', 'Đóng tuyển', 'Bắt đầu'].map((label, index) => (
          <div key={label} className="flex items-center gap-2">
            {index > 0 && <span className="material-symbols-outlined text-neutral-300">arrow_forward</span>}
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700">{label}</span>
          </div>
        ))}
      </div>

      {/* Tóm tắt ma trận ca — bấm mới xổ bảng chi tiết (danh sách có thể rất dài) */}
      <button
        type="button"
        onClick={() => setShowMatrix((v) => !v)}
        className="mt-4 flex w-full flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-left text-xs transition-colors hover:bg-neutral-100"
      >
        <span className="material-symbols-outlined text-[18px] text-emerald-700">table_rows</span>
        <span className="font-extrabold text-neutral-800">Chi tiết từng ngày · ca · vai trò</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
            shiftsEligible === readiness.matrix.length
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {shiftsEligible}/{readiness.matrix.length} ca đạt ngưỡng
        </span>
        <span className="ml-auto inline-flex items-center gap-0.5 font-bold text-emerald-700">
          {showMatrix ? 'Thu gọn' : 'Xem chi tiết'}
          <span className="material-symbols-outlined text-[16px]">
            {showMatrix ? 'expand_less' : 'expand_more'}
          </span>
        </span>
      </button>

      {showMatrix && (
        <>
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <p className="font-extrabold">Ngưỡng {readiness.minimumFillPercent}% được tính riêng cho từng ngày · ca · vai trò.</p>
            <p className="mt-1">
              Chỉ người đã bấm xác nhận ca mới được tính. Số tối thiểu được làm tròn lên, nên ca cần 1 người vẫn phải có đủ 1 người xác nhận.
            </p>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <thead><tr className="border-b text-left text-neutral-500"><th className="p-2">Ngày</th><th className="p-2">Ca</th><th className="p-2">Vai trò</th><th className="p-2">Phân công / xác nhận</th><th className="p-2">Tối thiểu</th><th className="p-2">Trạng thái</th></tr></thead>
              <tbody>{readiness.matrix.map((row) => (
                <tr key={`${row.workDate}:${row.shiftId}`} className="border-b last:border-0">
                  <td className="p-2">{new Date(`${row.workDate}T00:00:00+07:00`).toLocaleDateString('vi-VN')}</td>
                  <td className="p-2 font-bold">{row.label}</td>
                  <td className="p-2">{ROLE_LABEL[row.role ?? ''] ?? 'Cần rà soát'}</td>
                  <td className="p-2 font-bold">
                    <span className="text-neutral-800">{row.assigned}/{row.minRequired}</span>
                    <span className="text-neutral-400"> · </span>
                    <span className={row.confirmed >= row.minimumRequired ? 'text-emerald-700' : 'text-amber-700'}>
                      {row.confirmed}/{row.minRequired}
                    </span>
                  </td>
                  <td className="p-2 font-bold">{row.minimumRequired} người ({readiness.minimumFillPercent}%)</td>
                  <td className={`p-2 font-bold ${row.eligibleToStart ? 'text-emerald-700' : 'text-amber-700'}`}>{row.ready ? 'Đủ 100%' : row.eligibleToStart ? `Đạt ${row.fillPercent}%` : `Thiếu ${Math.max(0, row.minimumRequired - row.confirmed)} để đạt ngưỡng`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      {!readiness.eligibleToStart && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-extrabold text-amber-900">Chưa thể bắt đầu chiến dịch</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-800">
            {readiness.matrix.filter((row) => !row.eligibleToStart).map((row) => (
              <li key={`${row.workDate}:${row.shiftId}:reason`}>
                {new Date(`${row.workDate}T00:00:00+07:00`).toLocaleDateString('vi-VN')} · {row.label}:{' '}
                đã phân công {row.assigned}, nhưng mới có {row.confirmed}/{row.minimumRequired} người xác nhận để đạt ngưỡng.
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-semibold text-amber-900">
            Sau khi đủ ngưỡng, nút bắt đầu chỉ được bật từ{' '}
            {new Date(readiness.operationStartAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.
          </p>
        </div>
      )}

      {readiness.eligibleToStart && !readiness.ready && !continueRecruiting && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-extrabold text-emerald-900">Đã đủ điều kiện nhân sự để bắt đầu</p>
          <p className="mt-1 text-xs text-emerald-800">Tất cả ca/vai trò đã đạt tối thiểu {readiness.minimumFillPercent}% theo cấu hình Admin. Bạn có thể tiếp tục tuyển đến hạn hoặc bắt đầu khi đã tới giờ vận hành.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void startNow()} disabled={!readiness.canStartNow || startCampaign.isPending} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {startCampaign.isPending ? 'Đang bắt đầu…' : readiness.canStartNow ? 'Bắt đầu chiến dịch' : 'Chưa tới giờ vận hành'}
            </button>
            <button type="button" onClick={() => { setContinueRecruiting(true); toast.success('Chiến dịch sẽ tiếp tục tuyển đến hạn đã đặt.'); }} className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-extrabold text-emerald-800">Tiếp tục tuyển thêm</button>
          </div>
        </div>
      )}

      {canExtend && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-amber-50 p-3">
          <label className="text-xs font-bold text-amber-900">Gia hạn tuyển
            <input type="datetime-local" value={newDeadline} min={toVnLocalInput(new Date(readiness.recruitmentEndAt))} max={toVnLocalInput(latest)} onChange={(event) => setNewDeadline(event.target.value)} className="cm-input mt-1 block" />
          </label>
          <button type="button" onClick={() => void submitExtension()} disabled={extend.isPending} className="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{extend.isPending ? 'Đang gia hạn…' : 'Gia hạn'}</button>
          <p className="text-[11px] text-amber-800">Tối đa tới {latest.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}; sau đó phải dời lịch hoặc huỷ.</p>
        </div>
      )}
    </section>
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
