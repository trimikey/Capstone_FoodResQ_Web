'use client';

import '../campaign-tokens.css';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import PublicHeader from '@/components/home/PublicHeader';
import CampaignPlaybook, {
  type CampaignPhaseKey,
} from '@/components/campaigns/CampaignPlaybook';
import {
  usePublicCampaignDetail,
  useApplyCampaign,
  useAddExperience,
  useUploadExperienceImage,
  type CampaignParticipant,
  type CampaignDistribution,
  type CampaignExperience,
  type CampaignProofPhoto,
} from '@/hooks/useCampaigns';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import { useAuthStore } from '@/stores/auth.store';
import { useMe } from '@/hooks/useProfile';
import { mediaUrl, errMsg } from '@/lib/utils';
import { findOverlapping, formatCampaignRange, isMultiDay } from '@/lib/campaign-schedule';
import { AssignmentRole, UserRole } from '@foodresq/types';
import ProviderCampaignDetail from '../ProviderCampaignDetail';

const CAMPAIGN_FALLBACK = '/vn-pho.jpg';

/** `2026-08-13` → `T5 13/08`. Ghim timeZone để máy múi giờ âm không lùi mất một ngày. */
function formatDayLabel(date: string): string {
  if (!date) return '';
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'UTC' }).format(d);
  const dm = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(d);
  return `${weekday} ${dm}`;
}

const ROLE_META: Record<string, { label: string; icon: string }> = {
  chef: { label: 'Đầu bếp', icon: 'skillet' },
  waiter: { label: 'Phục vụ', icon: 'room_service' },
  shipper: { label: 'Giao hàng', icon: 'local_shipping' },
};

const PROOF_KIND: Record<string, string> = {
  ingredient: 'Nguyên liệu',
  cooked: 'Món đã nấu',
  distribution: 'Trao suất ăn',
};

const STATUS_META: Record<string, { label: string; chip: string }> = {
  draft: { label: 'Chờ duyệt', chip: 'cm-chip cm-chip--honey' },
  open: { label: 'Đang tuyển', chip: 'cm-chip cm-chip--sky' },
  in_progress: { label: 'Đang diễn ra', chip: 'cm-chip cm-chip--mint' },
  completed: { label: 'Hoàn tất', chip: 'cm-chip cm-chip--mint' },
  cancelled: { label: 'Đã huỷ', chip: 'cm-chip cm-chip--rose' },
};

const ROLE_CARDS: Array<{
  key: AssignmentRole;
  title: string;
  sub: string;
  icon: string;
  iconCls: string;
}> = [
  {
    key: AssignmentRole.CHEF,
    title: 'Đầu bếp',
    sub: 'Chuẩn bị nguyên liệu, nấu và đảm bảo ATTP',
    icon: 'skillet',
    iconCls: 'cm-role-icon--chef',
  },
  {
    key: AssignmentRole.WAITER,
    title: 'Phục vụ',
    sub: 'Hỗ trợ phân phát suất ăn, sắp xếp khu vực',
    icon: 'room_service',
    iconCls: 'cm-role-icon--waiter',
  },
  {
    key: AssignmentRole.SHIPPER,
    title: 'Giao hàng',
    sub: 'Vận chuyển suất ăn đến người nhận cuối',
    icon: 'local_shipping',
    iconCls: 'cm-role-icon--shipper',
  },
];

type Tab = 'schedule' | 'items' | 'logistics';
const TABS: { key: Tab; label: string }[] = [
  { key: 'schedule', label: 'Lịch trình' },
  { key: 'items', label: 'Thực đơn' },
  { key: 'logistics', label: 'Nhân sự & Log' },
];

export default function CampaignPublicDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const router = useRouter();

  const { data: c, isLoading, isError, error } = usePublicCampaignDetail(id);
  const queryErrorMsg = error instanceof Error ? error.message : '';
  const { data: me } = useMe();
  const user = useAuthStore((s) => s.user);
  const isProvider = me?.role === UserRole.PROVIDER;
  const isVolunteer = user?.role === UserRole.VOLUNTEER;
  const { data: vol } = useVolunteerMe(isVolunteer);
  const apply = useApplyCampaign();
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<Tab>('schedule');

  // Form đăng ký tình nguyện viên (mở rộng theo mockup)
  const [formRole, setFormRole] = useState<AssignmentRole | null>(null);
  const [formMotivation, setFormMotivation] = useState('');
  /**
   * Một "suất trực" = ca + NGÀY. Ca chỉ có giờ, chiến dịch nhiều ngày thì ca lặp lại
   * mỗi ngày, nên chọn mỗi shiftId là không đủ để biết TNV trực buổi nào.
   */
  const [formSlots, setFormSlots] = useState<Array<{ shiftId: string; date: string }>>([]);
  /** Ngày đang xem trong bảng chọn ca (chỉ dùng cho chiến dịch nhiều ngày). */
  const [formDay, setFormDay] = useState<string | null>(null);
  const [formPhone, setFormPhone] = useState('');
  const [formConsent, setFormConsent] = useState(false);

  const myRoles = (vol?.specializations ?? []).map((s: { specialization: string }) => s.specialization);

  // TNV đã khai chuyên môn lúc đăng ký tài khoản, và backend chỉ nhận đúng chuyên môn đó.
  // Chỉ có MỘT chuyên môn thì bắt chọn lại là thao tác thừa — suy ra luôn.
  // Dùng giá trị DẪN XUẤT thay vì đồng bộ bằng useEffect: setState trong effect gây
  // render thừa và bị react-hooks/set-state-in-effect chặn.
  const singleRole = myRoles.length === 1 ? (myRoles[0] as AssignmentRole) : null;
  const effectiveRole = formRole ?? singleRole;

  const hasShifts = (c?.shifts?.length ?? 0) > 0;
  // Ca chung (role = null) ai cũng nhận được, nên vẫn liệt kê cho mọi vai trò.
  // Lọc trực tiếp, không useMemo: danh sách ca chỉ vài phần tử, và optional chaining
  // trong mảng deps làm React Compiler bỏ qua memo hoá cả component.
  const roleShifts = (c?.shifts ?? []).filter(
    (s) => !effectiveRole || s.role === null || s.role === effectiveRole,
  );
  // Các ngày chiến dịch diễn ra — lấy từ `days` của ca đầu tiên (backend đã tính sẵn).
  const campaignDays = roleShifts[0]?.days?.map((d) => d.date) ?? [];
  // Ngày đang xem: mặc định ngày đầu tiên còn nhận đăng ký, không thì ngày đầu.
  const activeDay =
    formDay ??
    roleShifts[0]?.days?.find((d) => !d.expired)?.date ??
    campaignDays[0] ??
    null;
  // Trùng giờ chỉ xét trong CÙNG NGÀY — ca sáng 13/08 và ca sáng 14/08 không đụng nhau.
  const pickedShifts = roleShifts.filter((s) =>
    formSlots.some((p) => p.shiftId === s.id && p.date === activeDay),
  );
  const isCompleted = c?.status === 'completed';
  const st = c ? (STATUS_META[c.status] ?? { label: c.status, chip: 'cm-chip cm-chip--ink' }) : null;

  // Đã qua ngày diễn ra (hết ngày tổ chức) → không còn nhận đăng ký
  const isPast = c ? new Date(c.scheduledDate).setHours(23, 59, 59, 999) < Date.now() : false;
  const canRegister = !isCompleted && !isPast;

  const slots = c
    ? (['chef', 'waiter', 'shipper'] as AssignmentRole[]).map((role) => ({
        role,
        needed: c[`${role}SlotsNeeded` as const],
        filled: c[`${role}SlotsFilled` as const],
      }))
    : [];

  const slotInfo = useMemo(() => {
    if (!c) return null;
    return {
      chef: { filled: c.chefSlotsFilled, needed: c.chefSlotsNeeded },
      waiter: { filled: c.waiterSlotsFilled, needed: c.waiterSlotsNeeded },
      shipper: { filled: c.shipperSlotsFilled, needed: c.shipperSlotsNeeded },
    };
  }, [c]);

  const completedSlots = (c?.chefSlotsFilled ?? 0) + (c?.waiterSlotsFilled ?? 0) + (c?.shipperSlotsFilled ?? 0);
  const totalSlots = c ? c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded : 0;
  const slotPct = totalSlots > 0 ? Math.round((completedSlots / totalSlots) * 100) : 0;

  const dateFormatted = c
    ? new Date(c.scheduledDate).toLocaleDateString('vi-VN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  const longDateFormatted = c
    ? new Date(c.scheduledDate).toLocaleDateString('vi-VN', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';

  // Chiến dịch kéo dài nhiều ngày phải hiện CẢ ngày kết thúc — chỉ hiện ngày bắt đầu
  // thì TNV tưởng chỉ diễn ra một hôm.
  const multiDay = c ? isMultiDay(c) : false;
  const longEndDateFormatted =
    c && c.endDate
      ? new Date(c.endDate).toLocaleDateString('vi-VN', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';

  /**
   * Gửi đăng ký. Mỗi ca là một bản ghi riêng ở backend nên phải gọi lần lượt.
   *
   * Chạy TUẦN TỰ chứ không Promise.all: backend kiểm tra ca mới có trùng giờ với ca
   * đã giữ hay không, chạy song song thì cả hai cùng đọc trạng thái "chưa có ca nào"
   * và lọt qua kiểm tra.
   */
  async function join(role: AssignmentRole) {
    const targets: Array<{ shiftId?: string; date?: string }> =
      formSlots.length > 0 ? formSlots.map((s) => ({ shiftId: s.shiftId, date: s.date })) : [{}];
    const done: string[] = [];
    const failed: string[] = [];

    for (const t of targets) {
      try {
        await apply.mutateAsync({ id, role, shiftId: t.shiftId, workDate: t.date });
        done.push(t.shiftId ?? '');
      } catch (e) {
        const label = roleShifts.find((s) => s.id === t.shiftId)?.label ?? 'ca này';
        const when = t.date ? ` ngày ${formatDayLabel(t.date)}` : '';
        failed.push(`${label}${when}: ${errMsg(e, 'thất bại')}`);
      }
    }

    if (done.length > 0) {
      toast.success(
        formSlots.length > 1
          ? `Đã gửi đăng ký ${done.length}/${targets.length} suất trực. Chờ tổ chức duyệt.`
          : `Đã gửi đăng ký vai trò ${ROLE_META[role]?.label ?? role}. Chờ tổ chức duyệt.`,
      );
      setPicking(false);
      setFormRole(null);
      setFormSlots([]);
      setFormMotivation('');
      setFormConsent(false);
    }
    // Báo rõ ca nào hỏng thay vì nuốt lỗi khi mới gửi được một phần.
    failed.forEach((msg) => toast.error(msg));
  }

  async function submitRegistration(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveRole) {
      toast.error('Chọn vai trò bạn muốn tham gia');
      return;
    }
    // Backend từ chối đăng ký không kèm ca khi chiến dịch đã chia ca — chặn ở đây
    // để người dùng thấy lỗi ngay tại ô cần sửa thay vì nhận toast từ server.
    if (roleShifts.length > 0 && formSlots.length === 0) {
      toast.error('Chọn ít nhất một ca trực bạn muốn nhận.');
      return;
    }
    if (!formConsent) {
      toast.error('Bạn cần xác nhận cam kết trước khi gửi');
      return;
    }
    if (formMotivation.trim().length > 0 && formMotivation.trim().length < 10) {
      toast.error('Lời nhắn nên dài ít nhất 10 ký tự');
      return;
    }
    if (!user) {
      toast.info('Bạn cần có tài khoản tình nguyện viên để tham gia.');
      router.push('/register');
      return;
    }
    if (!isVolunteer) {
      toast.error('Chỉ tình nguyện viên mới tham gia được chiến dịch.');
      return;
    }
    if (myRoles.length === 0) {
      toast.error('Bạn chưa đăng ký chuyên môn nào — cập nhật hồ sơ tình nguyện viên để tham gia.');
      return;
    }
    if (!myRoles.includes(effectiveRole)) {
      toast.error('Bạn chưa có chuyên môn phù hợp với vai trò này.');
      return;
    }
    await join(effectiveRole);
  }

  function share() {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(window.location.href);
      toast.success('Đã sao chép liên kết chiến dịch.');
    }
  }

  return (
    <div className="cm-page cm-scope min-h-screen">
      {/* NCC thấy view riêng (bảng nguyên liệu + donate) — không cần PublicHeader */}
      {c && isProvider ? (
        <ProviderCampaignDetail c={c} />
      ) : (
      <>
      <PublicHeader />

      <div className="cm-detail-page">
        {isLoading && (
          <div className="space-y-4">
            <div className="h-80 skeleton rounded-3xl" />
            <div className="h-24 skeleton rounded-2xl" />
            <div className="grid grid-cols-3 gap-4">
              <div className="h-96 skeleton rounded-2xl" />
              <div className="col-span-2 h-96 skeleton rounded-2xl" />
            </div>
          </div>
        )}

        {isError && (
          <div className="text-center py-20 cm-card mt-8">
            {queryErrorMsg.includes('đang chờ duyệt') ? (
              <>
                <span className="material-symbols-outlined text-amber-400 text-[56px]">hourglass_empty</span>
                <p className="font-bold text-neutral-700 mt-3">Chiến dịch đang chờ duyệt</p>
                <p className="text-sm text-neutral-400 mt-1">
                  Chiến dịch này hiện đang chờ quản trị viên duyệt và chưa công khai.
                </p>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-neutral-300 text-[56px]">event_busy</span>
                <p className="font-bold text-neutral-700 mt-3">Không tìm thấy chiến dịch</p>
                <p className="text-sm text-neutral-400 mt-1">
                  Chiến dịch có thể đã đóng hoặc chưa được duyệt.
                </p>
              </>
            )}
            <button
              onClick={() => router.push('/')}
              className="mt-5 px-5 py-2.5 cm-btn-ember text-sm"
            >
              Về trang chủ
            </button>
          </div>
        )}

        {c && (
          <>
            {/* ─── Hero (chỉ chứa ảnh bìa, full nguyên bức ảnh) ─── */}
            <div className="cm-detail-hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.imageUrls?.[0] ? mediaUrl(c.imageUrls[0]) : CAMPAIGN_FALLBACK}
                alt={c.title}
              />
              <button
                type="button"
                onClick={() => router.back()}
                className="cm-detail-hero-back"
                aria-label="Quay lại"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
              {st && (
                <div className="cm-detail-hero-actions">
                  <span className={`${st.chip} backdrop-blur-md`}>
                    <span className="material-symbols-outlined text-[14px]">
                      {c.status === 'open'
                        ? 'campaign'
                        : c.status === 'in_progress'
                          ? 'play_circle'
                          : c.status === 'completed'
                            ? 'verified'
                            : c.status === 'cancelled'
                              ? 'cancel'
                              : 'pending'}
                    </span>
                    {st.label}
                  </span>
                </div>
              )}
            </div>

            {/* ─── Card info (title + meta) — đặt dưới ảnh để ảnh luôn full visibility ─── */}
            <div className="cm-detail-hero-info">
              <p className="cm-detail-hero-eyebrow">
                {c.organizationName ? c.organizationName : 'Chiến dịch cộng đồng'}
              </p>
              <h1 className="cm-detail-hero-title">{c.title}</h1>
              <div className="cm-detail-hero-meta">
                <span>
                  <span className="material-symbols-outlined text-[16px]">event</span>
                  {multiDay
                    ? `${longDateFormatted} → ${longEndDateFormatted}`
                    : longDateFormatted}
                </span>
                <span>
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  {c.startTime} – {c.endTime}
                  {multiDay && <span className="ml-1 opacity-80">mỗi ngày</span>}
                </span>
                <span>
                  <span className="material-symbols-outlined text-[16px]">place</span>
                  {c.kitchenAddress}
                </span>
              </div>
            </div>

            {/* ─── Info bar (4 cells) ─── */}
            <div className="cm-info-bar">
              <div className="cm-info-cell">
                <span className="cm-info-cell-label">
                  <span className="material-symbols-outlined text-[14px]">groups</span>
                  Tình nguyện viên
                </span>
                <span className="cm-info-cell-value">
                  {completedSlots}/{totalSlots} người
                </span>
                <span className="cm-info-cell-sub">Đã đăng ký / tổng nhu cầu</span>
              </div>
              <div className="cm-info-cell">
                <span className="cm-info-cell-label">
                  <span className="material-symbols-outlined text-[14px]">restaurant</span>
                  Suất ăn dự kiến
                </span>
                <span className="cm-info-cell-value">
                  {c.expectedServings?.toLocaleString('vi-VN') ?? '—'} suất
                </span>
                <span className="cm-info-cell-sub">Mục tiêu phục vụ</span>
              </div>
              <div className="cm-info-cell">
                <span className="cm-info-cell-label">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                  Thời lượng
                </span>
                <span className="cm-info-cell-value">{c.startTime}–{c.endTime}</span>
                <span className="cm-info-cell-sub">{formatCampaignRange(c)}</span>
              </div>
              <div className="cm-info-cell">
                <span className="cm-info-cell-label">
                  <span className="material-symbols-outlined text-[14px]">percent</span>
                  Tỉ lệ lấp đầy
                </span>
                <span className="cm-info-cell-value">{slotPct}%</span>
                <span className="cm-info-cell-sub">Sẽ tăng khi có đăng ký</span>
              </div>
            </div>

            {/* ─── 2-col: side (sticky) + main ─── */}
            <div className="cm-detail-grid">
              {/* ─── Side panel (sticky) ─── */}
              <aside className="cm-side-panel">
                <div className="cm-side-card">
                  <h2 className="cm-side-card-title">
                    <span className="material-symbols-outlined">volunteer_activism</span>
                    Tại sao bạn nên tham gia
                  </h2>
                  <div className="cm-benefit">
                    <div className="cm-benefit-icon">
                      <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
                    </div>
                    <div className="cm-benefit-body">
                      <p className="cm-benefit-title">+5 điểm cống hiến</p>
                      <p className="cm-benefit-sub">Hoàn thành tốt — thăng hạng tình nguyện viên</p>
                    </div>
                  </div>
                  <div className="cm-benefit">
                    <div className="cm-benefit-icon cm-benefit-icon--honey">
                      <span className="material-symbols-outlined text-[18px]">soup_kitchen</span>
                    </div>
                    <div className="cm-benefit-body">
                      <p className="cm-benefit-title">Một bữa ấm cho cộng đồng</p>
                      <p className="cm-benefit-sub">Đóng góp trực tiếp cho người cần hỗ trợ</p>
                    </div>
                  </div>
                  <div className="cm-benefit">
                    <div className="cm-benefit-icon cm-benefit-icon--sky">
                      <span className="material-symbols-outlined text-[18px]">handshake</span>
                    </div>
                    <div className="cm-benefit-body">
                      <p className="cm-benefit-title">Kết nối tình nguyện viên</p>
                      <p className="cm-benefit-sub">Gặp gỡ những người cùng chí hướng quanh bạn</p>
                    </div>
                  </div>
                  <div className="cm-benefit">
                    <div className="cm-benefit-icon cm-benefit-icon--rose">
                      <span className="material-symbols-outlined text-[18px]">verified</span>
                    </div>
                    <div className="cm-benefit-body">
                      <p className="cm-benefit-title">Xác nhận hoàn thành</p>
                      <p className="cm-benefit-sub">Điểm danh + ảnh bằng chứng để được ghi nhận</p>
                    </div>
                  </div>
                </div>

                <div className="cm-side-card">
                  <h2 className="cm-side-card-title">
                    <span className="material-symbols-outlined">checklist</span>
                    Yêu cầu tham gia
                  </h2>
                  <ul className="cm-req-list">
                    <li>
                      <span className="material-symbols-outlined">check_circle</span>
                      Tài khoản đã xác minh danh tính 
                    </li>
                    <li>
                      <span className="material-symbols-outlined">check_circle</span>
                      Có mặt đúng giờ tại địa điểm bếp
                    </li>
                    <li>
                      <span className="material-symbols-outlined">check_circle</span>
                      Cam kết hoàn thành đến cuối ca làm việc
                    </li>
                    <li>
                      <span className="material-symbols-outlined">check_circle</span>
                      Mang theo giấy tờ tuỳ thân khi điểm danh
                    </li>
                  </ul>
                </div>

                {c.participants.length > 0 && (
                  <div className="cm-side-card">
                    <h2 className="cm-side-card-title">
                      <span className="material-symbols-outlined">group</span>
                      Đã có {c.participants.length} người đăng ký
                    </h2>
                    <div className="cm-avatars">
                      {c.participants.slice(0, 6).map((p) => (
                        <div key={p.id} className="cm-avatar" title={p.fullName}>
                          {p.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mediaUrl(p.avatarUrl)} alt={p.fullName} />
                          ) : (
                            p.fullName.charAt(0).toUpperCase()
                          )}
                        </div>
                      ))}
                      {c.participants.length > 6 && (
                        <div className="cm-avatar cm-avatar--more">
                          +{c.participants.length - 6}
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-3">
                      Bạn sẽ tham gia cùng những tình nguyện viên trên.
                    </p>
                  </div>
                )}

                <button
                  onClick={share}
                  className="w-full py-3 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 rounded-2xl font-bold text-sm transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">share</span> Chia sẻ chiến dịch
                </button>
              </aside>

              {/* ─── Main column ─── */}
              <main className="cm-main-form">
                {/* ─── Mô tả / Giới thiệu ─── */}
                {c.description && (
                  <section className="cm-form-card">
                    <h2 className="cm-side-card-title !mb-3">
                      <span className="material-symbols-outlined">description</span>
                      Giới thiệu
                    </h2>
                    <p className="text-[14px] text-neutral-700 leading-relaxed whitespace-pre-line">
                      {c.description}
                    </p>
                  </section>
                )}

                {/* ─── Form đăng ký (mở rộng theo mockup) ─── */}
                {canRegister && (
                  <form onSubmit={submitRegistration} className="cm-form-card">
                    <h2 className="cm-form-card-title">Đăng ký tham gia</h2>
                    <p className="cm-form-card-sub">
                      Chọn vai trò phù hợp — quản trị viên sẽ duyệt trong vòng 24 giờ.
                    </p>

                    {!user && (
                      <div className="cm-consent !bg-amber-50 !border-amber-200 mb-5">
                        <span className="material-symbols-outlined text-[20px] text-amber-700 mt-0.5">
                          info
                        </span>
                        <div className="cm-consent-body">
                          Bạn cần <b>đăng ký tài khoản tình nguyện viên</b> để tham gia.{' '}
                          <button
                            type="button"
                            onClick={() => router.push('/register')}
                            className="text-emerald-700 font-bold underline"
                          >
                            Đăng ký ngay
                          </button>
                        </div>
                      </div>
                    )}

                    {user && !isVolunteer && (
                      <div className="cm-consent !bg-amber-50 !border-amber-200 mb-5">
                        <span className="material-symbols-outlined text-[20px] text-amber-700 mt-0.5">
                          info
                        </span>
                        <div className="cm-consent-body">
                          Chỉ tài khoản <b>tình nguyện viên</b> mới có thể đăng ký.
                        </div>
                      </div>
                    )}

                    {/* Role picker — chỉ cần chọn khi TNV có nhiều chuyên môn */}
                    {singleRole ? (
                      <div className="mb-5">
                        <label className="cm-field-label">Vai trò</label>
                        <div className="cm-input !py-3 flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-[20px] text-emerald-700">
                            {ROLE_META[singleRole]?.icon ?? 'badge'}
                          </span>
                          <span className="text-sm font-bold text-neutral-900">
                            {ROLE_META[singleRole]?.label ?? singleRole}
                          </span>
                          <span className="ml-auto text-[11px] font-semibold text-emerald-700">
                            Theo chuyên môn đã xác minh
                          </span>
                        </div>
                        <p className="cm-field-hint">
                          Muốn nhận vai trò khác? Bổ sung chuyên môn trong hồ sơ tình nguyện viên.
                        </p>
                      </div>
                    ) : (
                    <div className="mb-5">
                      <label className="cm-field-label">
                        Vai trò <span className="required">*</span>
                      </label>
                      <div className="cm-role-grid">
                        {ROLE_CARDS.map((r) => {
                          const info = slotInfo?.[r.key as keyof typeof slotInfo];
                          const full = info ? info.filled >= info.needed : false;
                          const verified = myRoles.includes(r.key);
                          return (
                            <button
                              key={r.key}
                              type="button"
                              aria-pressed={effectiveRole === r.key}
                              onClick={() => setFormRole(r.key)}
                              disabled={full}
                              className="cm-role-card"
                            >
                              <span className="cm-role-check">
                                <span className="material-symbols-outlined">check</span>
                              </span>
                              <div className={`cm-role-icon ${r.iconCls}`}>
                                <span className="material-symbols-outlined text-[22px]">
                                  {r.icon}
                                </span>
                              </div>
                              <p className="cm-role-title">{r.title}</p>
                              <p className="cm-role-sub">{r.sub}</p>
                              {info && (
                                <p
                                  className={`cm-role-slot ${
                                    full ? 'cm-role-slot-full' : ''
                                  }`}
                                >
                                  {full ? 'Đã đủ người' : `${info.filled}/${info.needed} đã đăng ký`}
                                  {verified && !full ? ' · Bạn đủ điều kiện' : ''}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="cm-field-hint">
                        Bạn chỉ có thể đăng ký 1 vai trò cho mỗi chiến dịch.
                      </p>
                    </div>
                    )}

                    {/* Ca trực — thay cho ô "khung giờ" tự khai trước đây.
                        Backend từ chối đăng ký không kèm ca khi chiến dịch đã chia ca,
                        nên đây là bước bắt buộc chứ không phải thông tin tham khảo. */}
                    {roleShifts.length > 0 && (
                      <div className="mb-5">
                        <label className="cm-field-label">
                          Chọn ca trực <span className="required">*</span>
                        </label>
                        {/* Chiến dịch nhiều ngày: ca lặp lại mỗi ngày nên phải chọn
                            trực NGÀY NÀO, không thì tổ chức không xếp được người. */}
                        {multiDay && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {(roleShifts[0]?.days ?? []).map((d) => {
                              const dayPicked = formSlots.filter((p) => p.date === d.date).length;
                              const allExpired = roleShifts.every(
                                (s) => s.days?.find((x) => x.date === d.date)?.expired !== false,
                              );
                              return (
                                <button
                                  key={d.date}
                                  type="button"
                                  disabled={allExpired}
                                  onClick={() => setFormDay(d.date)}
                                  title={allExpired ? 'Mọi ca của ngày này đã qua giờ' : undefined}
                                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                                    activeDay === d.date
                                      ? 'bg-[#236c2a] text-white'
                                      : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                                  } ${allExpired ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                  {formatDayLabel(d.date)}
                                  {dayPicked > 0 && (
                                    <span className="ml-1 rounded-full bg-white/25 px-1.5 text-[10px]">
                                      {dayPicked}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div className="grid gap-2">
                          {roleShifts.map((s) => {
                            // Chỗ trống tính THEO NGÀY đang xem: ca 2 chỗ của chiến dịch
                            // 3 ngày là 2 chỗ mỗi ngày, không phải 2 chỗ cả đợt.
                            const day = activeDay
                              ? s.days?.find((d) => d.date === activeDay)
                              : undefined;
                            const filled = day?.slotsFilled ?? s.slotsFilled;
                            const needed = day?.slotsNeeded ?? s.slotsNeeded;
                            const full = filled >= needed;
                            const picked = formSlots.some(
                              (p) => p.shiftId === s.id && p.date === activeDay,
                            );
                            // Không cho chọn ca đụng giờ ca đã tick — backend cũng chặn,
                            // báo ngay ở đây thì người dùng thấy đụng CA NÀO.
                            const clash = picked ? null : findOverlapping(s, pickedShifts);
                            // Ca của ngày đang xem đã qua giờ → không còn buổi để có mặt.
                            const expired = day ? day.expired : s.expired === true;
                            const disabled = full || expired || !!clash;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                disabled={disabled}
                                aria-pressed={picked}
                                title={
                                  expired
                                    ? 'Ca này của ngày đang chọn đã qua giờ'
                                    : clash
                                      ? `Trùng giờ với "${clash.label}"`
                                      : undefined
                                }
                                onClick={() =>
                                  setFormSlots((prev) =>
                                    picked
                                      ? prev.filter(
                                          (p) => !(p.shiftId === s.id && p.date === activeDay),
                                        )
                                      : [...prev, { shiftId: s.id, date: activeDay ?? '' }],
                                  )
                                }
                                className={`cm-input !py-3 flex items-center justify-between gap-3 text-left ${
                                  picked ? '!border-emerald-500 !bg-emerald-50' : ''
                                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <span className="min-w-0">
                                  <span className="block text-sm font-bold text-neutral-900 truncate">
                                    {s.label}
                                  </span>
                                  <span className="block text-[11px] text-neutral-500">
                                    {s.startTime}–{s.endTime} ·{' '}
                                    {expired
                                      ? 'Đã qua giờ — không còn buổi nào'
                                      : full
                                        ? 'Đã đủ người'
                                        : clash
                                          ? `Trùng giờ với “${clash.label}”`
                                          : `còn ${needed - filled} chỗ`}
                                  </span>
                                </span>
                                <span
                                  className={`material-symbols-outlined text-[20px] shrink-0 ${
                                    picked ? 'text-emerald-600' : 'text-neutral-300'
                                  }`}
                                >
                                  {picked ? 'check_box' : 'check_box_outline_blank'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="cm-field-hint">
                          {multiDay
                            ? 'Chọn ngày rồi tick ca. Đăng ký được nhiều ngày, miễn là các ca trong cùng một ngày không trùng giờ.'
                            : 'Chọn được nhiều ca cùng lúc, miễn là các ca không trùng giờ.'}
                          {formSlots.length > 0 && ` Đang chọn ${formSlots.length} suất trực.`}
                        </p>

                        {/* Tóm tắt các suất đã chọn — với nhiều ngày, chỉ nhìn tab đang
                            mở thì không thấy hết mình đã nhận những buổi nào. */}
                        {multiDay && formSlots.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {formSlots.map((p) => {
                              const sh = roleShifts.find((x) => x.id === p.shiftId);
                              return (
                                <li
                                  key={`${p.shiftId}-${p.date}`}
                                  className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800"
                                >
                                  <span className="min-w-0 truncate">
                                    {formatDayLabel(p.date)} · {sh?.label ?? 'Ca'}{' '}
                                    {sh ? `(${sh.startTime}–${sh.endTime})` : ''}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFormSlots((prev) =>
                                        prev.filter(
                                          (x) => !(x.shiftId === p.shiftId && x.date === p.date),
                                        ),
                                      )
                                    }
                                    className="shrink-0 text-emerald-700 hover:text-rose-600"
                                    aria-label="Bỏ suất trực này"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}

                    {effectiveRole && roleShifts.length === 0 && hasShifts && (
                      <p className="mb-5 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                        <span className="material-symbols-outlined text-[14px] shrink-0">info</span>
                        Chiến dịch chưa mở ca nào cho vai trò này — hãy chọn vai trò khác hoặc quay
                        lại sau.
                      </p>
                    )}

                    {/* Phone */}
                    <div className="mb-5">
                      <label className="cm-field-label">Số điện thoại liên hệ</label>
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                        placeholder="VD: 0901 234 567"
                        className="cm-input"
                      />
                      <p className="cm-field-hint">
                        Để BTC xác nhận nhanh khi cần (không bắt buộc).
                      </p>
                    </div>

                    {/* Motivation */}
                    <div className="mb-5">
                      <label className="cm-field-label">Lời nhắn cho ban tổ chức</label>
                      <textarea
                        value={formMotivation}
                        onChange={(e) => setFormMotivation(e.target.value)}
                        placeholder="Chia sẻ lý do bạn muốn tham gia hoặc kinh nghiệm liên quan…"
                        rows={4}
                        maxLength={500}
                        className="cm-input"
                      />
                      <p className="cm-field-hint">
                        {formMotivation.length}/500 ký tự · không bắt buộc
                      </p>
                    </div>

                    {/* Consent */}
                    <label className="cm-consent mb-5">
                      <input
                        type="checkbox"
                        checked={formConsent}
                        onChange={(e) => setFormConsent(e.target.checked)}
                      />
                      <div className="cm-consent-body">
                        Tôi cam kết <b>có mặt đúng giờ</b>, tuân thủ nội quy bếp và{' '}
                        <b>hoàn thành đến cuối ca</b>. Tôi hiểu việc vắng mặt không lý do sẽ ảnh hưởng đến điểm uy tín.
                      </div>
                    </label>

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={apply.isPending || !user || !isVolunteer}
                      className="cm-btn-submit-big"
                    >
                      {apply.isPending ? (
                        <>
                          <span className="material-symbols-outlined text-[18px] animate-spin">
                            progress_activity
                          </span>
                          Đang gửi đăng ký...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[20px]">send</span>
                          Gửi đăng ký tham gia
                        </>
                      )}
                    </button>

                    <p className="text-[11px] text-center text-neutral-400 mt-3">
                      Sau khi gửi, BTC sẽ duyệt trong vòng 24 giờ. Bạn sẽ nhận thông báo khi được duyệt.
                    </p>
                  </form>
                )}

                {/* ─── Trạng thái đặc biệt (completed / past) ─── */}
                {isCompleted && (
                  <div className="cm-card p-6 text-center">
                    <span className="material-symbols-outlined text-amber-500 text-[44px]">
                      workspace_premium
                    </span>
                    <p className="font-extrabold text-neutral-900 mt-2">Chiến dịch đã hoàn thành</p>
                    <p className="text-sm text-neutral-500 mt-1">
                      Cảm ơn tất cả tình nguyện viên & nhà hảo tâm đã chung tay!
                    </p>
                  </div>
                )}

                {!isCompleted && isPast && (
                  <div className="cm-card p-6 text-center">
                    <span className="material-symbols-outlined text-neutral-400 text-[44px]">event_busy</span>
                    <p className="font-extrabold text-neutral-900 mt-2">Đã qua ngày diễn ra</p>
                    <p className="text-sm text-neutral-500 mt-1">
                      Chiến dịch này không còn nhận đăng ký tình nguyện.
                    </p>
                  </div>
                )}

                {/* ─── Stats line (only when completed) ─── */}
                {isCompleted && (
                  <section className="cm-form-card">
                    <h2 className="cm-side-card-title !mb-4">
                      <span className="material-symbols-outlined">analytics</span>
                      Tổng kết chiến dịch
                    </h2>
                    <div className="flex flex-wrap gap-4">
                      <div className="cm-stat">
                        <span className="material-symbols-outlined text-emerald-500 text-[16px]">restaurant</span>
                        <span className="cm-stat-value">{c.actualServings ?? c.distributionSummary.servingsServed}</span>
                        <span>suất đã nấu</span>
                      </div>
                      <div className="cm-stat">
                        <span className="material-symbols-outlined text-sky-500 text-[16px]">diversity_3</span>
                        <span className="cm-stat-value">{c.distributionSummary.peopleServed}</span>
                        <span>người được phục vụ</span>
                      </div>
                      <div className="cm-stat">
                        <span className="material-symbols-outlined text-amber-500 text-[16px]">workspace_premium</span>
                        <span className="cm-stat-value">{c.participants.length}</span>
                        <span>TNV tham gia</span>
                      </div>
                      {c.avgSatisfaction != null && (
                        <div className="cm-stat">
                          <span className="material-symbols-outlined text-amber-500 text-[16px]">star</span>
                          <span className="cm-stat-value">{c.avgSatisfaction.toFixed(1)}</span>
                          <span>/ 5 ({c.feedbackCount} đánh giá)</span>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* ─── Tabs (Lịch trình / Thực đơn / Nhân sự) ─── */}
                <section className="cm-form-card !p-0 overflow-hidden">
                  <div className="px-5 pt-5">
                    <div className="cm-tabs">
                      {TABS.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          aria-selected={tab === t.key}
                          onClick={() => setTab(t.key)}
                          className="cm-tab"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {tab === 'schedule' && (
                      <ScheduleTab c={c} isCompleted={isCompleted} />
                    )}
                    {tab === 'items' && <ItemsTab c={c} isCompleted={isCompleted} />}
                    {tab === 'logistics' && (
                      <LogisticsTab c={c} isCompleted={isCompleted} slots={slots} />
                    )}

                    {isCompleted && c.proofGallery.length > 0 && (
                      <div className="cm-card p-5">
                        <h3 className="font-extrabold text-neutral-900 mb-4 flex items-center gap-2">
                          <span className="material-symbols-outlined text-emerald-600 text-[20px]">
                            photo_library
                          </span>
                          Hành trình qua ảnh
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {c.proofGallery.map((p, i) => (
                            <ProofPhoto key={i} p={p} />
                          ))}
                        </div>
                      </div>
                    )}

                    {isCompleted && c.distributions.length > 0 && (
                      <div className="cm-card p-5">
                        <h3 className="font-extrabold text-neutral-900 mb-4 flex items-center gap-2">
                          <span className="material-symbols-outlined text-emerald-600 text-[20px]">
                            takeout_dining
                          </span>
                          Các đợt trao suất ăn
                        </h3>
                        <div className="space-y-3">
                          {c.distributions.map((d) => (
                            <DistributionRow key={d.id} d={d} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* ─── Cảm nhận của tình nguyện viên (khi completed) ─── */}
                {isCompleted && (
                  <section className="cm-form-card">
                    <h2 className="cm-side-card-title !mb-4">
                      <span className="material-symbols-outlined text-amber-500">
                        format_quote
                      </span>
                      Cảm nhận của tình nguyện viên
                    </h2>
                    {c.experiences.length > 0 ? (
                      <div className="space-y-4">
                        {c.experiences.map((e) => (
                          <ExperienceCard key={e.id} e={e} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-400">Chưa có cảm nhận nào được chia sẻ.</p>
                    )}
                    {isVolunteer && <ExperienceForm campaignId={id} />}
                  </section>
                )}
              </main>
            </div>
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScheduleTab({
  c,
  isCompleted,
}: {
  c: import('@/hooks/useCampaigns').PublicCampaignDetail;
  isCompleted: boolean;
}) {
  // Phase highlight theo status campaign để gợi ý đúng bước đang cần làm.
  const highlightKey: CampaignPhaseKey | null = isCompleted
    ? 'report'
    : c.status === 'in_progress'
    ? 'distribute'
    : c.status === 'open'
    ? 'recruit'
    : 'plan';

  return (
    <div className="space-y-4">
      {/* Gợi ý quy trình tổ chức — collapsible dropdown */}
      <CampaignPlaybook highlightKey={highlightKey} />

      {c.scheduleItems.length > 0 && (
        <div className="cm-card p-5">
          <h3 className="font-extrabold text-neutral-900 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">schedule</span>
            Lịch trình hoạt động
          </h3>
          <div className="space-y-2">
            {c.scheduleItems.map((t, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="shrink-0 min-w-[70px] text-xs font-bold text-neutral-500 bg-neutral-100 rounded-lg px-2 py-1 text-center">
                  {t.time}
                </div>
                <p className="text-sm text-neutral-700 leading-relaxed">{t.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {c.supplyItems.length > 0 && (
        <div className="cm-card p-5">
          <h3 className="font-extrabold text-neutral-900 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-honey-500 text-[20px]">inventory_2</span>
            Vật phẩm cần chuẩn bị
          </h3>
          <div className="flex flex-wrap gap-2">
            {c.supplyItems.map((s, i) => {
              const label =
                typeof s === 'string'
                  ? s
                  : [s.name, s.quantity ? `${s.quantity}${s.unit ? ` ${s.unit}` : ''}` : null]
                      .filter(Boolean)
                      .join(' — ');
              return (
                <span key={i} className="cm-chip cm-chip--ink text-sm">
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {c.scheduleItems.length === 0 && c.supplyItems.length === 0 && (
        <div className="cm-card p-6 text-center">
          <span className="material-symbols-outlined text-4xl text-neutral-300">schedule</span>
          <p className="text-sm text-neutral-500 mt-2">Chưa có lịch trình chi tiết.</p>
        </div>
      )}

      {/* Tình nguyện viên đã tham gia */}
      {c.participants.length > 0 && (
        <div className="cm-card p-5">
          <h3 className="font-extrabold text-neutral-900 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">diversity_3</span>
            Những người đã chung tay ({c.participants.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {/* Gộp theo người + vai trò: một TNV nhận nhiều ca sẽ có nhiều bản ghi
                phân công, để nguyên thì danh sách nhân sự hiện trùng tên. */}
            {[
              ...new Map(c.participants.map((p) => [`${p.fullName}|${p.role}`, p])).values(),
            ].map((p) => (
              <ParticipantChip key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemsTab({
  c,
  isCompleted,
}: {
  c: import('@/hooks/useCampaigns').PublicCampaignDetail;
  isCompleted: boolean;
}) {
  if (c.menuItems.length === 0) {
    return (
      <div className="cm-card p-6 text-center">
        <span className="material-symbols-outlined text-4xl text-neutral-300">restaurant_menu</span>
        <p className="text-sm text-neutral-500 mt-2">Chưa có thực đơn công khai.</p>
      </div>
    );
  }

  const grouped = c.menuItems.reduce<Record<string, typeof c.menuItems>>((acc, item) => {
    const key = item.type || 'Khác';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} className="cm-card p-5">
          <h3 className="font-extrabold text-neutral-900 mb-3 flex items-center gap-2">
            <span className="cm-chip cm-chip--honey">{type}</span>
            <span className="text-xs text-neutral-400">{items.length} món</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((m, i) => (
              <div key={i} className="rounded-2xl bg-neutral-50 border border-neutral-150 p-4 text-center">
                <span className="material-symbols-outlined text-emerald-600 text-[26px]">restaurant</span>
                <p className="font-bold text-sm text-neutral-800 mt-1">{m.name}</p>
                {m.type && <p className="text-[11px] text-neutral-400">{m.type}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LogisticsTab({
  c,
  isCompleted,
  slots,
}: {
  c: import('@/hooks/useCampaigns').PublicCampaignDetail;
  isCompleted: boolean;
  slots: { role: AssignmentRole; needed: number; filled: number }[];
}) {
  return (
    <div className="space-y-4">
      {/* Nhu cầu nhân lực — ẩn khi đã hoàn thành */}
      {!isCompleted && (
        <div className="cm-card p-5">
          <h3 className="font-extrabold text-neutral-900 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">groups</span>
            Nhu cầu nhân lực
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {slots
              .filter((s) => s.needed > 0)
              .map((s) => {
                const pct = Math.min(100, Math.round((s.filled / s.needed) * 100));
                const role = ROLE_META[s.role];
                return (
                  <div key={s.role}>
                    <div className="flex items-center justify-between text-xs font-bold text-neutral-700 mb-1.5">
                      <span>{role?.label ?? s.role}</span>
                      <span className="text-neutral-400">
                        {s.filled}/{s.needed}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Nguyên liệu được quyên góp */}
      {c.donations.length > 0 && (
        <div className="cm-card p-5">
          <h3 className="font-extrabold text-neutral-900 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-honey-500 text-[20px]">volunteer_activism</span>
            Nguyên liệu quyên góp ({c.donations.length})
          </h3>
          <div className="space-y-2">
            {c.donations.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-2 text-sm rounded-xl bg-neutral-50 px-4 py-2.5"
              >
                <span className="material-symbols-outlined text-[16px] text-emerald-600">
                  volunteer_activism
                </span>
                <span className="font-semibold text-neutral-700">
                  {d.quantity ? `${d.quantity} ` : ''}
                  {d.itemName}
                </span>
                <span className="text-neutral-400 text-xs">· {d.provider.businessName}</span>
                <span
                  className={`ml-auto cm-chip text-[10px] ${
                    d.status === 'received' ? 'cm-chip--mint' : 'cm-chip--honey'
                  }`}
                >
                  {d.status === 'received' ? 'Đã nhận' : 'Đã hứa góp'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProofPhoto({ p }: { p: CampaignProofPhoto }) {
  return (
    <div className="relative rounded-2xl overflow-hidden aspect-square bg-neutral-100 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl(p.url)}
        alt={PROOF_KIND[p.kind] ?? p.kind}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-1.5">
        <p className="text-[10px] font-bold text-white">{PROOF_KIND[p.kind] ?? p.kind}</p>
        <p className="text-[9px] text-white/70 truncate">{p.by}</p>
      </div>
    </div>
  );
}

function ParticipantChip({ p }: { p: CampaignParticipant }) {
  const rm = ROLE_META[p.role] ?? { label: p.role, icon: 'work' };
  return (
    <span className="inline-flex items-center gap-2 bg-neutral-50 border border-neutral-150 rounded-full pl-1.5 pr-3 py-1">
      {p.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(p.avatarUrl)}
          alt={p.fullName}
          className="w-7 h-7 rounded-full object-cover"
        />
      ) : (
        <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold">
          {p.fullName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-xs font-semibold text-neutral-700">{p.fullName}</span>
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
        <span className="material-symbols-outlined text-[12px]">{rm.icon}</span>
        {rm.label}
      </span>
    </span>
  );
}

function DistributionRow({ d }: { d: CampaignDistribution }) {
  return (
    <div className="rounded-2xl border border-neutral-150 overflow-hidden">
      <div className="flex gap-3 p-3">
        {d.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(d.photoUrl)}
            alt={d.roundLabel ?? 'Đợt phân phát'}
            className="w-20 h-20 rounded-xl object-cover shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-neutral-800">{d.roundLabel || 'Đợt phân phát'}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {d.servingsServed} suất · {d.peopleServed} người
            {d.leftoverServings > 0 ? ` · còn dư ${d.leftoverServings}` : ''}
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">Phụ trách: {d.servedBy}</p>
          {d.note && <p className="text-xs text-neutral-600 mt-1 italic">"{d.note}"</p>}
        </div>
      </div>
      {d.feedback.length > 0 && (
        <div className="bg-neutral-50 px-3 py-2 space-y-1.5 border-t border-neutral-100">
          {d.feedback.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="flex items-center gap-0.5 text-amber-500 shrink-0">
                {Array.from({ length: 5 }).map((_, k) => (
                  <span
                    key={k}
                    className="material-symbols-outlined text-[13px]"
                    style={{ fontVariationSettings: k < f.satisfaction ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    star
                  </span>
                ))}
              </span>
              {f.comment && <span className="text-neutral-600">{f.comment}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExperienceCard({ e }: { e: CampaignExperience }) {
  return (
    <div className="rounded-2xl border border-neutral-150 p-4">
      <div className="flex items-center gap-2.5">
        {e.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(e.avatarUrl)}
            alt={e.fullName}
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">
            {e.fullName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-bold text-sm text-neutral-800">{e.fullName}</p>
          {e.rating != null && (
            <span className="flex items-center gap-0.5 text-amber-500">
              {Array.from({ length: 5 }).map((_, k) => (
                <span
                  key={k}
                  className="material-symbols-outlined text-[13px]"
                  style={{ fontVariationSettings: k < e.rating! ? "'FILL' 1" : "'FILL' 0" }}
                >
                  star
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      <p className="text-sm text-neutral-600 leading-relaxed mt-2 whitespace-pre-line">{e.content}</p>
      {e.imageUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          {e.imageUrls.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={mediaUrl(u)}
              alt="Ảnh cảm nhận"
              className="w-full aspect-square rounded-xl object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExperienceForm({ campaignId }: { campaignId: string }) {
  const add = useAddExperience();
  const upload = useUploadExperienceImage();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [rating, setRating] = useState(5);
  const [images, setImages] = useState<string[]>([]);

  async function onPick(file: File) {
    try {
      const res = await upload.mutateAsync(file);
      setImages((prev) => [...prev, res.url].slice(0, 6));
    } catch (e) {
      toast.error(errMsg(e, 'Tải ảnh thất bại'));
    }
  }

  async function submit() {
    if (content.trim().length < 5) {
      toast.error('Cảm nhận tối thiểu 5 ký tự');
      return;
    }
    try {
      await add.mutateAsync({
        id: campaignId,
        content: content.trim(),
        rating,
        imageUrls: images,
      });
      toast.success('Đã chia sẻ cảm nhận của bạn. Cảm ơn bạn!');
      setContent('');
      setImages([]);
      setRating(5);
      setOpen(false);
    } catch (e) {
      toast.error(errMsg(e, 'Gửi cảm nhận thất bại'));
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full py-2.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">edit</span> Chia sẻ cảm nhận của bạn
      </button>
    );
  }

  return (
    <div className="mt-4 border-t border-neutral-100 pt-4 space-y-3">
      <p className="text-xs text-neutral-400">Chỉ tình nguyện viên đã tham gia chiến dịch mới chia sẻ được.</p>
      <div className="flex items-center gap-1">
        <span className="text-xs font-bold text-neutral-500 mr-1">Đánh giá:</span>
        {Array.from({ length: 5 }).map((_, k) => (
          <button key={k} type="button" onClick={() => setRating(k + 1)}>
            <span
              className="material-symbols-outlined text-[22px] text-amber-500"
              style={{ fontVariationSettings: k < rating ? "'FILL' 1" : "'FILL' 0" }}
            >
              star
            </span>
          </button>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Trải nghiệm của bạn khi tham gia chiến dịch này..."
        className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
      />

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((u, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(u)} alt="Ảnh" className="w-full aspect-square rounded-lg object-cover" />
              <button
                onClick={() => setImages(images.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <label className="flex-1 cursor-pointer py-2 border border-dashed border-neutral-300 rounded-xl text-xs font-bold text-neutral-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]">
            {upload.isPending ? 'hourglass_top' : 'add_photo_alternate'}
          </span>
          {upload.isPending ? 'Đang tải...' : 'Thêm ảnh'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
              e.target.value = '';
            }}
          />
        </label>
        <button
          onClick={submit}
          disabled={add.isPending}
          className="px-5 py-2 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {add.isPending ? 'Đang gửi...' : 'Gửi'}
        </button>
        <button onClick={() => setOpen(false)} className="px-3 py-2 text-neutral-400 text-sm">
          Huỷ
        </button>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="material-symbols-outlined text-[18px] text-emerald-600 mt-0.5">{icon}</span>
      <div>
        <p className="text-[11px] text-neutral-400 font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-neutral-800">{value}</p>
      </div>
    </div>
  );
}
