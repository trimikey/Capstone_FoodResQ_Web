'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useManageContext, STATUS_META } from '../../../_components/ManageShell';
import { campaignStartWindow } from '@/lib/campaign-schedule';
import type { VolunteerDetail, CampaignManageParticipant } from '@/hooks/useCampaigns';

/**
 * Trạng thái chiến dịch: đang ở giai đoạn nào, mốc nào đã qua, và còn hành động gì.
 *
 * Các nút Hoàn tất / Huỷ dùng chung modal của ManageShell (`openAction`) để logic
 * xác nhận + gọi API nằm một chỗ, không nhân bản ở từng trang.
 */

type StageKey = 'pending_approval' | 'approved' | 'in_progress' | 'done';

const STAGES: Array<{ key: StageKey; label: string; desc: string; icon: string }> = [
  { key: 'pending_approval', label: 'Chờ duyệt', desc: 'Quản trị viên xem xét yêu cầu tạo chiến dịch.', icon: 'pending' },
  { key: 'approved', label: 'Đang tuyển', desc: 'Chiến dịch công khai, tình nguyện viên đăng ký ca.', icon: 'campaign' },
  { key: 'in_progress', label: 'Đang diễn ra', desc: 'Bếp hoạt động — TNV điểm danh và cập nhật công việc.', icon: 'play_circle' },
  { key: 'done', label: 'Kết thúc', desc: 'Đã hoàn tất hoặc bị huỷ — chỉ còn xem lại số liệu.', icon: 'flag' },
];

function stageOf(status: string): StageKey {
  if (status === 'pending_approval') return 'pending_approval';
  if (status === 'approved') return 'approved';
  if (status === 'in_progress') return 'in_progress';
  return 'done';
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Participant = CampaignManageParticipant & {
  /** Tên ca được gán */
  shiftLabel?: string;
  /** Số chiến dịch đã tham gia */
  campaignsJoined?: number;
};

type ParticipantTone = 'mint' | 'honey' | 'rose' | 'sky' | 'neutral';

const STATUS_TONE: Record<string, ParticipantTone> = {
  pending: 'honey',
  applied: 'honey',
  approved: 'mint',
  confirmed: 'mint',
  checked_in: 'sky',
  completed: 'mint',
  rejected: 'rose',
  cancelled: 'rose',
  absent: 'rose',
  no_show: 'rose',
};

const TONE_COLORS: Record<ParticipantTone, string> = {
  mint: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  honey: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  neutral: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ duyệt',
  applied: 'Chờ duyệt',
  approved: 'Đã duyệt',
  confirmed: 'Đã xác nhận',
  checked_in: 'Đã điểm danh',
  completed: 'Hoàn tất',
  rejected: 'Từ chối',
  cancelled: 'Đã hủy',
  absent: 'Vắng mặt',
  no_show: 'Không đến',
};

const ROLE_LABEL_VN: Record<string, string> = {
  chef: 'Bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

const RANK_COLORS: Record<string, string> = {
  'Hạng Tân binh': 'bg-neutral-100 text-neutral-600 border-neutral-300',
  'Hạng Đồng': 'bg-orange-50 text-orange-700 border-orange-200',
  'Hạng Bạc': 'bg-slate-50 text-slate-700 border-slate-200',
  'Hạng Vàng': 'bg-amber-50 text-amber-700 border-amber-200',
  'Hạng Kim cương': 'bg-sky-50 text-sky-700 border-sky-200',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function checkInTone(ts: string | null): 'mint' | 'honey' | 'rose' {
  if (!ts) return 'honey';
  const diffMin = (Date.now() - new Date(ts).getTime()) / 60_000;
  if (diffMin < 15) return 'mint';
  if (diffMin < 60) return 'honey';
  return 'rose';
}

function trustColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-rose-600';
}

function dedicationColor(pts: number): string {
  if (pts >= 200) return 'text-purple-600';
  if (pts >= 100) return 'text-blue-600';
  if (pts >= 50) return 'text-teal-600';
  return 'text-neutral-500';
}

// ─── Volunteer Detail Modal ─────────────────────────────────────────────────

function VolunteerDetailModal({
  p,
  shift,
  onClose,
}: {
  p: Participant;
  shift?: { label: string; startTime: string; endTime: string; role: string | null } | null;
  onClose: () => void;
}) {
  const tone = STATUS_TONE[p.status] ?? 'neutral';
  const { volunteer: v } = p;
  const campaignsCount = v.pastCampaignsCount ?? 0;
  const specs = v.specializations?.join(', ') || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh] px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl mt-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-brand-gradient px-5 pt-5 pb-4 rounded-t-2xl relative">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-white text-[18px]">close</span>
          </button>

          <div className="flex items-center gap-3 pr-8">
            {v.avatarUrl || v.faceImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.avatarUrl || v.faceImageUrl!} alt={p.fullName} className="w-12 h-12 rounded-full object-cover border-2 border-white/50 shrink-0" />
            ) : (
              <span className="w-12 h-12 rounded-full bg-white/20 text-white font-extrabold text-lg flex items-center justify-center shrink-0">
                {p.fullName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="font-extrabold text-white text-base truncate">{p.fullName}</h3>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">
                  {ROLE_LABEL_VN[p.role]}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${TONE_COLORS[tone]}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Năng lực */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px]">workspace_premium</span>
              Năng lực &amp; Đánh giá
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-neutral-150 p-2.5 text-center bg-neutral-50">
                <p className="text-[10px] text-neutral-500 mb-1">Xếp hạng</p>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                  RANK_COLORS[v.rank] ?? 'bg-neutral-100 text-neutral-600 border-neutral-300'
                }`}>
                  {v.rank || 'TNV Mới'}
                </span>
              </div>
              <div className="rounded-xl border border-neutral-150 p-2.5 text-center bg-neutral-50">
                <p className="text-[10px] text-neutral-500 mb-1">Điểm cống hiến</p>
                <p className={`text-lg font-extrabold ${dedicationColor(v.dedicationPoints)}`}>
                  {v.dedicationPoints.toLocaleString('vi-VN')}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-150 p-2.5 text-center bg-neutral-50">
                <p className="text-[10px] text-neutral-500 mb-1">Điểm trust</p>
                <p className={`text-lg font-extrabold ${trustColor(v.trustScore)}`}>
                  {v.trustScore}
                </p>
              </div>
            </div>
          </div>

          {/* Thông tin liên hệ */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px]">contact_phone</span>
              Thông tin liên hệ
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2">
                <span className="text-xs text-neutral-500 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">phone</span>
                  Số điện thoại
                </span>
                <span className="text-sm font-bold text-neutral-800">{v.phone ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2">
                <span className="text-xs text-neutral-500 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">star</span>
                  Đánh giá trung bình
                </span>
                <span className="text-sm font-bold text-neutral-800 flex items-center gap-1">
                  {v.avgRating ? v.avgRating.toFixed(1) : '—'}
                  {v.avgRating && <span className="text-amber-500 text-[12px]">★</span>}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2">
                <span className="text-xs text-neutral-500 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">groups</span>
                  Chiến dịch đã tham gia
                </span>
                <span className="text-sm font-bold text-neutral-800">{campaignsCount}</span>
              </div>
            </div>
          </div>

          {/* Phụ trách ca trực */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px]">schedule</span>
              Phân công ca trực
            </p>
            {shift ? (
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-emerald-800">{shift.label}</span>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">
                    {shift.startTime} — {shift.endTime}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-emerald-700">
                  <span>📍 {shift.role ? ROLE_LABEL_VN[shift.role] : 'Ca chung'}</span>
                </div>
              </div>
            ) : p.workDate ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-sm font-bold text-neutral-700">
                  Ngày đăng ký: {new Date(p.workDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">Chưa được phân ca cụ thể</p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-200 p-3 text-center">
                <p className="text-xs text-neutral-400">Chưa có thông tin ca trực</p>
              </div>
            )}
          </div>

          {/* Điểm danh */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px]">login</span>
              Điểm danh
            </p>
            <div className="rounded-xl border border-neutral-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Trạng thái</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE_COLORS[tone]}`}>
                  {p.checkInTime ? 'Đã điểm danh' : STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
              {p.checkInTime && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Thời gian</span>
                    <span className={`text-sm font-bold ${
                      checkInTone(p.checkInTime) === 'mint' ? 'text-emerald-700' :
                      checkInTone(p.checkInTime) === 'honey' ? 'text-amber-700' : 'text-rose-700'
                    }`}>
                      {formatDateTime(p.checkInTime)}
                    </span>
                  </div>
                  {p.checkInLateMinutes != null && p.checkInLateMinutes > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">Trễ</span>
                      <span className="text-sm font-bold text-rose-600">{p.checkInLateMinutes} phút</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Ghi chú / Lý do */}
          {p.notes && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px]">sticky_note_2</span>
                Ghi chú
              </p>
              <div className="rounded-xl border border-neutral-200 p-3 bg-neutral-50">
                <p className="text-sm text-neutral-700">{p.notes}</p>
              </div>
            </div>
          )}

          {/* Phương tiện (shipper) */}
          {p.role === 'shipper' && (v.vehicleType || v.vehiclePlate) && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px]">two_wheeler</span>
                Phương tiện
              </p>
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3">
                <span className="text-2xl">{v.vehicleType === 'motorbike' ? '🏍️' : '🚗'}</span>
                <div>
                  <p className="text-sm font-bold text-neutral-800 capitalize">{v.vehicleType ?? '—'}</p>
                  {v.vehiclePlate && <p className="text-xs text-neutral-500 font-mono">{v.vehiclePlate}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Chuyên môn */}
          {specs && specs !== '—' && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px]">psychology</span>
                Chuyên môn
              </p>
              <div className="flex flex-wrap gap-1.5">
                {v.specializations.map((spec: string) => (
                  <span key={spec} className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                    {spec}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-sm transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function CampaignStatusPage() {
  const { campaign: c, openAction } = useManageContext();
  const [volFilter] = useState<'all' | 'pending' | 'chef' | 'waiter' | 'shipper' | 'removed'>('all');
  const [selectedVol] = useState<Participant | null>(null);
  const meta = STATUS_META[c.status] ?? { label: c.status, chip: 'cm-chip cm-chip--ink', icon: 'help' };
  const current = stageOf(c.status);
  const currentIndex = STAGES.findIndex((s) => s.key === current);
  const isClosed = c.status === 'completed' || c.status === 'cancelled';
  const startWindow = campaignStartWindow(c);

  const totalNeeded = c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded;
  const totalFilled = c.chefSlotsFilled + c.waiterSlotsFilled + c.shipperSlotsFilled;
  const pendingCount = (c.participants ?? []).filter((p) => (p.status ?? 'pending') === 'pending').length;
  const served = c.distributionSummary?.servingsServed ?? 0;
  const target = c.expectedServings ?? 0;

  // ── Enrich participants ──────────────────────────────────────────────────────
  const participants: Participant[] = useMemo(() => {
    return (c.participants ?? []).map((p) => {
      const shift = c.shifts?.find((s) => s.id === p.shiftId);
      return {
        ...p,
        shiftLabel: shift ? `${shift.label} · ${shift.startTime}-${shift.endTime}` : undefined,
        campaignsJoined: p.volunteer?.pastCampaignsCount,
      };
    }) as Participant[];
  }, [c.participants, c.shifts]);

  const filteredParticipants = useMemo(() => {
    if (volFilter === 'all') return participants;
    if (volFilter === 'pending') return participants.filter((p) => p.status === 'pending' || p.status === 'applied');
    if (volFilter === 'removed') return participants.filter((p) => ['cancelled', 'rejected', 'absent', 'no_show'].includes(p.status));
    return participants.filter((p) => p.role === volFilter);
  }, [participants, volFilter]);

  const filterCounts = useMemo(() => ({
    all: participants.length,
    pending: participants.filter((p) => p.status === 'pending' || p.status === 'applied').length,
    chef: participants.filter((p) => p.role === 'chef').length,
    waiter: participants.filter((p) => p.role === 'waiter').length,
    shipper: participants.filter((p) => p.role === 'shipper').length,
    removed: participants.filter((p) => ['cancelled', 'rejected', 'absent', 'no_show'].includes(p.status)).length,
  }), [participants]);

  const selectedShift = selectedVol ? c.shifts?.find((s) => s.id === selectedVol.shiftId) : null;

  return (
    <div className="space-y-4">
      <section className="cm-manage-card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="cm-manage-card-title">
              <span className="material-symbols-outlined text-[20px]">flag</span>
              Trạng thái chiến dịch
            </h2>
            <p className="cm-manage-card-sub">Giai đoạn hiện tại và các hành động còn lại.</p>
          </div>
          <span className={meta.chip}>
            <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>
            {meta.label}
          </span>
        </div>

        <ol className="mt-5 space-y-0">
          {STAGES.map((s, i) => {
            const done = i < currentIndex || (isClosed && s.key === 'done');
            const active = s.key === current;
            return (
              <li key={s.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      active
                        ? 'bg-[#236c2a] text-white'
                        : done
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {done && !active ? 'check' : s.icon}
                    </span>
                  </span>
                  {i < STAGES.length - 1 && <span className="w-px flex-1 bg-neutral-200 my-1" />}
                </div>
                <div className="pb-5 min-w-0">
                  <p className={`text-sm font-bold ${active ? 'text-neutral-900' : 'text-neutral-500'}`}>
                    {s.label}
                    {active && <span className="ml-2 text-[11px] font-bold text-emerald-700">← hiện tại</span>}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">{s.desc}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title">
          <span className="material-symbols-outlined text-[20px]">insights</span>
          Số liệu nhanh
        </h2>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Nhân sự" value={`${totalFilled}/${totalNeeded}`} unit="người" />
          <Stat label="Chờ duyệt" value={String(pendingCount)} unit="đăng ký" tone={pendingCount > 0 ? 'amber' : undefined} />
          <Stat label="Đã phát" value={String(served)} unit="suất" />
          <Stat
            label="Mục tiêu"
            value={target > 0 ? `${Math.round((served / target) * 100)}%` : '—'}
            unit={target > 0 ? `của ${target}` : 'chưa đặt'}
          />
        </div>

        {pendingCount > 0 && (
          <Link
            href={`/campaigns/${c.id}/manage/registrations`}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:underline"
          >
            <span className="material-symbols-outlined text-[15px]">pending_actions</span>
            Có {pendingCount} đăng ký chờ duyệt — xem ngay
          </Link>
        )}
      </section>

      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title">
          <span className="material-symbols-outlined text-[20px]">bolt</span>
          Hành động
        </h2>

        {isClosed ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-semibold text-neutral-600">
            <span className="material-symbols-outlined text-[15px] shrink-0">lock</span>
            Chiến dịch đã kết thúc — không còn thao tác nào. Số liệu vẫn xem lại được ở các tab bên trái.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {c.status === 'in_progress' && (
              <button
                type="button"
                onClick={() => openAction('complete')}
                className="cm-manage-cta-primary inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">edit_note</span>
                Kết thúc &amp; nhập số suất
              </button>
            )}
            {c.status === 'approved' && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-600">
                <span className="material-symbols-outlined text-[15px]">info</span>
                {startWindow.canStart
                  ? 'Đã tới giờ — bấm “Bắt đầu” ở đầu trang quản lý.'
                  : startWindow.message}
              </span>
            )}
            {/* BE chỉ cho huỷ chiến dịch CHƯA bắt đầu (pending_approval / approved).
                Trước đây nút còn hiện khi in_progress nên tổ chức điền xong lý do mới
                nhận lỗi; chiến dịch đang chạy thì dùng "Kết thúc" chứ không huỷ. */}
            {c.status === 'approved' && (
              <button
                type="button"
                onClick={() => openAction('cancel')}
                className="cm-manage-cta-secondary inline-flex items-center gap-1.5 !text-rose-700"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
                Huỷ chiến dịch
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: 'amber';
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-neutral-150 bg-neutral-50'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold tabular-nums text-neutral-900">{value}</p>
      <p className="text-[11px] text-neutral-500">{unit}</p>
    </div>
  );
}
