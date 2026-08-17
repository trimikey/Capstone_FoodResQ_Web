'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  type CampaignParticipant,
  useReviewAssignment,
  useStartCampaign,
} from '@/hooks/useCampaigns';
import { RegistrationRow } from '../../../_components/CampaignManageShared';
import { useManageContext } from '../../../_components/ManageShell';
import { campaignStartWindow } from '@/lib/campaign-schedule';
import { errMsg } from '@/lib/utils';
import CampaignPlaybook, {
  type CampaignPhaseKey,
} from '@/components/campaigns/CampaignPlaybook';

export default function RegistrationsPage() {
  const { campaign: c, openAction } = useManageContext();
  const [filter, setFilter] = useState<'all' | 'pending' | 'chef' | 'waiter' | 'shipper'>('all');
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [reviewTarget, setReviewTarget] = useState<CampaignParticipant | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  // Popup duyệt GỘP: 1 TNV đăng ký nhiều ca → duyệt các ca đã tick trong 1 lần.
  const [groupTarget, setGroupTarget] = useState<CampaignParticipant[] | null>(null);
  const [groupChecked, setGroupChecked] = useState<Record<string, boolean>>({});
  const review = useReviewAssignment();
  const startCampaign = useStartCampaign();

  // Cùng luật với backend: mở được từ 12h trước mốc bắt đầu (giờ VN).
  const startWindow = campaignStartWindow(c);

  async function onStart() {
    if (!startWindow.canStart) {
      toast.error(startWindow.message);
      return;
    }
    try {
      await startCampaign.mutateAsync(c.id);
      toast.success('Đã bắt đầu chiến dịch');
    } catch (e) {
      toast.error(errMsg(e, 'Không thể bắt đầu — kiểm tra trạng thái'));
    }
  }

  const stats = {
    total: c.expectedServings ?? 0,
    served: c.actualServings ?? c.distributionSummary?.servingsServed ?? 0,
    pct: 0,
  };
  stats.pct = stats.total > 0 ? Math.min(100, Math.round((stats.served / stats.total) * 100)) : 0;

  const totalSlots = c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded;
  const filledSlots = c.chefSlotsFilled + c.waiterSlotsFilled + c.shipperSlotsFilled;

  // Phase highlight theo status campaign.
  const playbookHighlight: CampaignPhaseKey | null =
    c.status === 'completed'
      ? 'report'
      : c.status === 'in_progress'
      ? 'distribute'
      : c.status === 'approved'
      ? 'recruit'
      : 'plan';

  const volunteers: CampaignParticipant[] = useMemo(() => c.participants ?? [], [c.participants]);
  const filteredVolunteers: CampaignParticipant[] = (() => {
    if (filter === 'all') return volunteers;
    if (filter === 'pending') return volunteers.filter((v) => !v.status || v.status === 'pending' || v.status === 'applied');
    return volunteers.filter((v) => v.role === filter);
  })();

  const pendingCount = volunteers.filter(
    (v) => !v.status || v.status === 'pending' || v.status === 'applied',
  ).length;

  // ── Gộp đăng ký cùng TNV ───────────────────────────────────────────────────
  // 1 TNV đăng ký N ca → BE tạo N bản ghi assignment (mỗi ca chiếm slot riêng).
  // Hiển thị tách N hàng làm charity tưởng trùng đăng ký, nên gộp các bản ghi
  // cùng người + cùng vai trò + cùng trạng thái thành 1 hàng; danh sách từng ca
  // nằm trong phần Chi tiết. Nhóm pending duyệt chung qua 1 popup.
  const isPendingStatus = (v: CampaignParticipant) =>
    !v.status || v.status === 'pending' || v.status === 'applied';
  // Ghép theo hồ sơ TNV + vai trò + trạng thái: trạng thái khác nhau cần hành
  // động khác nhau nên không trộn chung hàng.
  const volKey = (v: CampaignParticipant) =>
    `${(v as { volunteerId?: string }).volunteerId ?? v.id}:${v.role}:${isPendingStatus(v) ? 'pending' : v.status}`;
  const rowGroups = useMemo(() => {
    const m = new Map<string, CampaignParticipant[]>();
    for (const v of volunteers) {
      if (!v.shiftId) continue;
      const k = volKey(v);
      m.set(k, [...(m.get(k) ?? []), v]);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volunteers]);

  // Chỉ hiện bản ghi ĐẦU TIÊN của mỗi nhóm; các bản còn lại đã gộp vào hàng đó.
  const displayedVolunteers = useMemo(() => {
    const shown = new Set<string>();
    return filteredVolunteers.filter((v) => {
      if (!v.shiftId) return true;
      const k = volKey(v);
      if ((rowGroups.get(k)?.length ?? 0) < 2) return true;
      if (shown.has(k)) return false;
      shown.add(k);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredVolunteers, rowGroups]);

  // Cảnh báo ca thiếu người
  const slotWarnings = useMemo(() => {
    const list: Array<{ label: string; tone: 'rose' | 'amber'; icon: string; missing: number }> = [];
    if (c.chefSlotsNeeded > c.chefSlotsFilled) {
      list.push({
        label: 'Đầu bếp',
        tone: 'rose',
        icon: 'skillet',
        missing: c.chefSlotsNeeded - c.chefSlotsFilled,
      });
    }
    if (c.waiterSlotsNeeded > c.waiterSlotsFilled) {
      list.push({
        label: 'Phục vụ',
        tone: 'amber',
        icon: 'room_service',
        missing: c.waiterSlotsNeeded - c.waiterSlotsFilled,
      });
    }
    if (c.shipperSlotsNeeded > c.shipperSlotsFilled) {
      list.push({
        label: 'Giao hàng',
        tone: 'amber',
        icon: 'local_shipping',
        missing: c.shipperSlotsNeeded - c.shipperSlotsFilled,
      });
    }
    return list;
  }, [c.chefSlotsNeeded, c.chefSlotsFilled, c.waiterSlotsNeeded, c.waiterSlotsFilled, c.shipperSlotsNeeded, c.shipperSlotsFilled]);

  const shifts = useMemo(() => c.shifts ?? [], [c.shifts]);
  const eligibleShifts = useMemo(() => {
    if (!reviewTarget) return [];
    return shifts.filter((s) => (!s.role || s.role === reviewTarget.role) && s.slotsFilled < s.slotsNeeded);
  }, [reviewTarget, shifts]);

  function submitDecision(
    id: string,
    name: string,
    action: 'approved' | 'rejected',
    shiftId?: string,
  ) {
    // Optimistic update cho UX phản hồi nhanh
    setDecisions((prev) => ({ ...prev, [id]: action }));
    void review.mutateAsync(
      { campaignId: c.id, assignmentId: id, action, shiftId },
      {
        onSuccess: () => {
          toast.success(action === 'approved' ? `Đã duyệt ${name}` : `Đã từ chối ${name}`);
          setReviewTarget(null);
          setSelectedShiftId('');
        },
        onError: (e) => {
          // rollback nếu lỗi
          setDecisions((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          toast.error(errMsg(e, action === 'approved' ? 'Duyệt thất bại' : 'Từ chối thất bại'));
        },
      },
    );
  }

  /** Duyệt/từ chối lần lượt nhiều bản ghi của cùng 1 TNV (mỗi bản ghi = 1 ca). */
  async function submitGroup(members: CampaignParticipant[], name: string, action: 'approved' | 'rejected') {
    let ok = 0;
    let firstError: unknown = null;
    for (const m of members) {
      setDecisions((prev) => ({ ...prev, [m.id]: action }));
      try {
        await review.mutateAsync({
          campaignId: c.id,
          assignmentId: m.id,
          action,
          ...(action === 'approved' && m.shiftId ? { shiftId: m.shiftId } : {}),
        });
        ok += 1;
      } catch (e) {
        firstError = e;
        setDecisions((prev) => {
          const next = { ...prev };
          delete next[m.id];
          return next;
        });
      }
    }
    if (ok > 0) {
      toast.success(action === 'approved' ? `Đã duyệt ${ok} ca cho ${name}` : `Đã từ chối ${ok} ca của ${name}`);
    }
    if (firstError) {
      toast.error(errMsg(firstError, action === 'approved' ? 'Có ca duyệt thất bại' : 'Có ca từ chối thất bại'));
    }
    setGroupTarget(null);
    setGroupChecked({});
  }

  function decide(id: string, name: string, action: 'approved' | 'rejected') {
    const target = volunteers.find((v) => v.id === id);
    if (!target) return;
    // Nhóm các đăng ký pending-có-ca của cùng TNV; hàng ngoài đại diện cả nhóm
    // nên từ chối/duyệt phải xử lý đủ mọi thành viên.
    const group =
      isPendingStatus(target) && target.shiftId
        ? rowGroups.get(volKey(target)) ?? [target]
        : [target];

    if (action === 'rejected') {
      if (group.length > 1) {
        void submitGroup(group, name, 'rejected');
        return;
      }
      submitDecision(id, name, action);
      return;
    }
    if (shifts.length === 0) {
      submitDecision(id, name, action);
      return;
    }
    if (group.length > 1) {
      // Mở popup gộp: tick sẵn các ca còn chỗ, ca đã đủ người thì khoá lại.
      setGroupTarget(group);
      setGroupChecked(
        Object.fromEntries(
          group.map((m) => {
            const s = shifts.find((x) => x.id === m.shiftId);
            return [m.id, !!s && s.slotsFilled < s.slotsNeeded];
          }),
        ),
      );
      return;
    }
    const selectedShift = target.shiftId
      ? shifts.find((s) => s.id === target.shiftId && (!s.role || s.role === target.role) && s.slotsFilled < s.slotsNeeded)
      : null;
    const firstAvailable = selectedShift ?? shifts.find((s) => (!s.role || s.role === target.role) && s.slotsFilled < s.slotsNeeded);
    if (!firstAvailable) {
      toast.error('Không còn ca phù hợp để duyệt tình nguyện viên này. Hãy tăng slot hoặc thêm ca trước.');
      return;
    }
    setReviewTarget(target);
    setSelectedShiftId(firstAvailable.id);
  }

  return (
    <>
    <div className="cm-manage-2col">
      <div className="cm-manage-2col-main space-y-4">
        {/* Gợi ý quy trình tổ chức — collapsible dropdown */}
        <section className="cm-manage-card">
          <CampaignPlaybook variant="inline" highlightKey={playbookHighlight} />
        </section>
        <section className="cm-manage-card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="cm-manage-card-title !mb-1">
                <span className="material-symbols-outlined">monitoring</span>
                Tiến độ mục tiêu
              </h2>
              <p className="cm-manage-card-sub !mt-0">
                Hoàn thành {stats.pct}% mục tiêu · {stats.served.toLocaleString('vi-VN')}/
                {stats.total.toLocaleString('vi-VN')} suất
              </p>
            </div>
            <div className="flex gap-2 flex-wrap py-2">
              <button
                type="button"
                onClick={() => openAction('complete')}
                disabled={c.status !== 'in_progress'}
                className="cm-manage-cta-secondary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">edit_note</span>
                Kết thúc &amp; Nhập số suất
              </button>
              <button
                type="button"
                onClick={onStart}
                disabled={c.status !== 'approved' || !startWindow.canStart || startCampaign.isPending}
                title={
                  c.status !== 'approved'
                    ? 'Chỉ bắt đầu khi chiến dịch đang ở trạng thái "Đang tuyển"'
                    : startWindow.canStart
                      ? ''
                      : startWindow.message
                }
                className="cm-manage-cta-primary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                {startCampaign.isPending
                  ? 'Đang bắt đầu...'
                  : startWindow.canStart
                    ? 'Bắt đầu đợt mới'
                    : startWindow.reason === 'too_early'
                      ? 'Chưa tới giờ'
                      : 'Quá ngày'}
              </button>
            </div>
          </div>

          <div className="cm-progress-stats">
            <div className="cm-progress-stat cm-progress-stat--target">
              <span className="cm-progress-stat-label">Mục tiêu</span>
              <span className="cm-progress-stat-value">{stats.total.toLocaleString('vi-VN')}</span>
              <span className="cm-progress-stat-sub">Suất ăn</span>
            </div>
            <div className="cm-progress-stat cm-progress-stat--done">
              <span className="cm-progress-stat-label">Đã đạt</span>
              <span className="cm-progress-stat-value">{stats.served.toLocaleString('vi-VN')}</span>
              <span className="cm-progress-stat-sub">Suất đã phát</span>
            </div>
            <div className="cm-progress-stat cm-progress-stat--remain">
              <span className="cm-progress-stat-label">Còn lại</span>
              <span className="cm-progress-stat-value">{(stats.total - stats.served).toLocaleString('vi-VN')}</span>
              <span className="cm-progress-stat-sub">Cần phục vụ</span>
            </div>
            <div className="cm-progress-stat cm-progress-stat--pct">
              <span className="cm-progress-stat-label">Tỉ lệ</span>
              <span className="cm-progress-stat-value">{stats.pct}%</span>
              <span className="cm-progress-stat-sub">Hoàn thành</span>
            </div>
          </div>

          <div className="cm-progress-bar">
            <div className="cm-progress-bar-fill" style={{ width: `${stats.pct}%` }} />
          </div>
          <div className="cm-progress-meta">
            <span>
              TNV <b>{filledSlots}/{totalSlots}</b> đã tham gia
            </span>
            <span>
              Suất/đợt mục tiêu: <b>{stats.total.toLocaleString('vi-VN')}</b>
            </span>
          </div>
        </section>

        <section className="cm-manage-card !p-0">
          <div className="px-5 pt-5 pb-3">
            <h2 className="cm-manage-card-title !mb-1">
              <span className="material-symbols-outlined">pending_actions</span>
              Đăng ký chờ duyệt ({pendingCount})
            </h2>
            <p className="cm-manage-card-sub !mt-0">
              Duyệt hoặc từ chối từng tình nguyện viên trước khi ca diễn ra.
            </p>
            <div className="cm-mini-tabs">
              {(
                [
                  { key: 'all', label: `Tất cả (${volunteers.length})` },
                  { key: 'pending', label: `Chờ duyệt (${pendingCount})` },
                  { key: 'chef', label: 'Đầu bếp' },
                  { key: 'waiter', label: 'Phục vụ' },
                  { key: 'shipper', label: 'Giao hàng' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={filter === t.key}
                  onClick={() => setFilter(t.key)}
                  className={`cm-mini-tab ${filter === t.key ? '!bg-[#236c2a] !text-white !border-[#236c2a] ' : ''}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {volunteers.length === 0 ? (
            <div className="cm-mini-empty pb-6">
              <span className="material-symbols-outlined">inbox</span>
              Chưa có ai đăng ký — chia sẻ chiến dịch để thu hút tình nguyện viên.
            </div>
          ) : (
            <div className="px-2 pb-3">
              {displayedVolunteers.map((p, idx) => (
                <RegistrationRow
                  key={`${p.id}-${idx}`}
                  p={p}
                  shifts={shifts}
                  decision={decisions[p.id]}
                  pending={review.isPending && review.variables?.assignmentId === p.id}
                  onDecide={decide}
                  group={p.shiftId ? rowGroups.get(volKey(p)) : undefined}
                />
              ))}
            </div>
          )}
        </section>

        <section className="cm-manage-card !p-0">
          <div className="px-5 pt-5 pb-3">
            <h2 className="cm-manage-card-title !mb-1">
              <span className="material-symbols-outlined">takeout_dining</span>
              Phân phối suất ăn ({c.distributions?.length ?? 0})
            </h2>
            <p className="cm-manage-card-sub !mt-0">
              Theo dõi các đợt trao suất ăn đã thực hiện.
            </p>
          </div>

          {c.distributions?.length === 0 ? (
            <div className="cm-mini-empty pb-6">
              <span className="material-symbols-outlined">restaurant</span>
              Chưa có đợt phân phát nào được ghi nhận.
            </div>
          ) : (
            <div className="px-5 pb-5 space-y-2">
              {c.distributions?.map((d) => (
                <DistributionRowInline key={d.id} d={d} />
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="cm-manage-2col-side space-y-4">
        <section className="cm-manage-card">
          <p className="cm-manage-card-title !mb-3">
            <span className="material-symbols-outlined">trending_up</span>
            Tổng suất đã phát
          </p>
          <p className="font-display text-3xl font-extrabold text-emerald-700">
            {stats.served.toLocaleString('vi-VN')}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            Mục tiêu: {stats.total.toLocaleString('vi-VN')} suất · Còn lại{' '}
            {Math.max(0, stats.total - stats.served).toLocaleString('vi-VN')}
          </p>
          <div className="cm-growth-pill mt-3">
            <span className="material-symbols-outlined text-[14px]">
              {stats.pct >= 100 ? 'check_circle' : stats.pct >= 50 ? 'trending_up' : 'schedule'}
            </span>
            {stats.pct}% mục tiêu
          </div>
        </section>

        <section className="cm-manage-card">
          <h3 className="cm-manage-card-title">
            <span className="material-symbols-outlined">restaurant_menu</span>
            Thực đơn trong ngày
          </h3>
          {c.menuItems && c.menuItems.length > 0 ? (
            <div className="space-y-2 mt-2">
              {c.menuItems.slice(0, 6).map((m, idx) => (
                <MenuChip
                  key={`${m.name}-${idx}`}
                  icon={iconForMeal(m.type)}
                  label={m.name}
                  note={m.plannedServings ? `${m.plannedServings} suất` : mealLabel(m.type)}
                  tone={toneForMeal(idx)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400 mt-2">Chưa có món nào trong thực đơn.</p>
          )}
        </section>

        <section className="cm-manage-card">
          <h3 className="cm-manage-card-title">
            <span className="material-symbols-outlined">notifications</span>
            Thông báo nhanh
          </h3>
          <ul className="cm-notif-list">
            {/* Đợt phát trong ngày */}
            <li className="cm-notif-item">
              <span className="cm-notif-dot cm-notif-dot--mint" />
              <div>
                <p className="text-xs font-bold text-neutral-800">
                  {(() => {
                    const today = new Date().toDateString();
                    const todayRounds =
                      c.distributions?.filter(
                        (d) => new Date(d.distributedAt).toDateString() === today,
                      ).length ?? 0;
                    return todayRounds > 0
                      ? `Hôm nay có ${todayRounds} đợt phát`
                      : 'Hôm nay chưa ghi nhận đợt phát';
                  })()}
                </p>
                <p className="text-[10px] text-neutral-400 mt-0.5">Cập nhật liên tục</p>
              </div>
            </li>

            {/* Ca thiếu người */}
            {slotWarnings.length > 0 ? (
              slotWarnings.map((w) => (
                <li key={w.label} className="cm-notif-item">
                  <span className={`cm-notif-dot cm-notif-dot--${w.tone === 'rose' ? 'rose' : 'honey'}`} />
                  <div>
                    <p className="text-xs font-bold text-neutral-800">
                      Thiếu {w.missing} {w.label.toLowerCase()} — đã tự động đăng tuyển
                    </p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Cảnh báo tự động</p>
                  </div>
                </li>
              ))
            ) : (
              <li className="cm-notif-item">
                <span className="cm-notif-dot cm-notif-dot--sky" />
                <div>
                  <p className="text-xs font-bold text-neutral-800">Đủ người cho mọi ca</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Cập nhật liên tục</p>
                </div>
              </li>
            )}

            {/* Quyên góp mới nhất */}
            {c.donations && c.donations.length > 0 ? (
              <li className="cm-notif-item">
                <span className="cm-notif-dot cm-notif-dot--sky" />
                <div>
                  <p className="text-xs font-bold text-neutral-800">
                    Nhà hảo tâm cam kết góp {c.donations[0].itemName}
                    {c.donations[0].quantity ? ` (${c.donations[0].quantity})` : ''}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    {c.donations[0].provider?.businessName ?? 'Nhà hảo tâm'}
                  </p>
                </div>
              </li>
            ) : (
              <li className="cm-notif-item">
                <span className="cm-notif-dot cm-notif-dot--sky" />
                <div>
                  <p className="text-xs font-bold text-neutral-800">Chưa có cam kết quyên góp nào</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Cập nhật liên tục</p>
                </div>
              </li>
            )}
          </ul>
        </section>
      </aside>
    </div>
    {reviewTarget ? (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh] px-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0 rounded-t-2xl">
            <button
              type="button"
              onClick={() => {
                setReviewTarget(null);
                setSelectedShiftId('');
              }}
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
              aria-label="Đóng"
            >
              <span className="material-symbols-outlined text-white text-[18px]">close</span>
            </button>
            <div className="flex items-center gap-3 pr-8">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-[18px]">event_available</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-white text-base">Chọn ca trước khi duyệt</h3>
                <p className="mt-0.5 text-xs text-emerald-50 truncate">
                  {reviewTarget.fullName} - {roleLabel(reviewTarget.role)}
                </p>
              </div>
            </div>
            {reviewTarget.shiftId ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold text-white">
                <span className="material-symbols-outlined text-[14px]">event_available</span>
                Ca TNV đã chọn
              </p>
            ) : (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold text-white">
                <span className="material-symbols-outlined text-[14px]">assignment</span>
                Đăng ký vai trò tổng - cần phân ca
              </p>
            )}
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            <div className="px-5 py-4 space-y-3">
              {eligibleShifts.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 ${
                    selectedShiftId === s.id ? 'border-emerald-600 bg-emerald-50' : 'border-neutral-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="review-shift"
                    value={s.id}
                    checked={selectedShiftId === s.id}
                    onChange={() => setSelectedShiftId(s.id)}
                    className="h-4 w-4 accent-emerald-700"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-neutral-900">
                      {s.label}
                      {reviewTarget.shiftId === s.id ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-emerald-700">
                          TNV chọn
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {s.startTime}-{s.endTime} · {s.role ? roleLabel(s.role) : 'Ca chung'} · {s.slotsFilled}/{s.slotsNeeded} đã duyệt
                    </span>
                  </span>
                </label>
              ))}
              {eligibleShifts.length === 0 ? (
                <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  Không còn ca phù hợp để duyệt tình nguyện viên này. Hãy tăng slot hoặc thêm ca trước.
                </div>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 px-5 py-3 border-t border-neutral-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setReviewTarget(null);
                setSelectedShiftId('');
              }}
              disabled={review.isPending}
              className="cm-reg-btn cm-reg-btn--reject disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={() => submitDecision(reviewTarget.id, reviewTarget.fullName, 'approved', selectedShiftId)}
              disabled={!selectedShiftId || review.isPending}
              className="cm-reg-btn cm-reg-btn--approve disabled:opacity-50"
            >
              {review.isPending ? 'Đang duyệt...' : 'Duyệt & phân ca'}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    {groupTarget ? (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh] px-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0 rounded-t-2xl">
            <button
              type="button"
              onClick={() => {
                setGroupTarget(null);
                setGroupChecked({});
              }}
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
              aria-label="Đóng"
            >
              <span className="material-symbols-outlined text-white text-[18px]">close</span>
            </button>
            <div className="flex items-center gap-3 pr-8">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-[18px]">event_available</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-white text-base">Duyệt {groupTarget.length} ca đã đăng ký</h3>
                <p className="mt-0.5 text-xs text-emerald-50 truncate">
                  {groupTarget[0].fullName} - {roleLabel(groupTarget[0].role)}
                </p>
              </div>
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold text-white">
              <span className="material-symbols-outlined text-[14px]">stacks</span>
              TNV đăng ký nhiều ca — duyệt chung 1 lần
            </p>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            <div className="px-5 py-4 space-y-3">
              {groupTarget.map((m) => {
                const s = shifts.find((x) => x.id === m.shiftId);
                const full = !s || s.slotsFilled >= s.slotsNeeded;
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-3 ${
                      full
                        ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60'
                        : groupChecked[m.id]
                          ? 'cursor-pointer border-emerald-600 bg-emerald-50'
                          : 'cursor-pointer border-neutral-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!groupChecked[m.id]}
                      disabled={full}
                      onChange={() => setGroupChecked((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                      className="h-4 w-4 accent-emerald-700"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-neutral-900">
                        {s ? s.label : 'Ca không còn tồn tại'}
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-emerald-700">
                          TNV chọn
                        </span>
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {m.workDate ? `${new Date(m.workDate).toLocaleDateString('vi-VN')} · ` : ''}
                        {s
                          ? `${s.startTime}-${s.endTime} · ${s.slotsFilled}/${s.slotsNeeded} đã duyệt${full ? ' · Đã đủ người' : ''}`
                          : 'Ca này đã bị xoá khỏi lịch trình'}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="shrink-0 px-5 py-3 border-t border-neutral-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setGroupTarget(null);
                setGroupChecked({});
              }}
              disabled={review.isPending}
              className="cm-reg-btn cm-reg-btn--reject disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={() => {
                const members = groupTarget.filter((m) => groupChecked[m.id]);
                if (members.length === 0) return;
                void submitGroup(members, groupTarget[0].fullName, 'approved');
              }}
              disabled={review.isPending || groupTarget.every((m) => !groupChecked[m.id])}
              className="cm-reg-btn cm-reg-btn--approve disabled:opacity-50"
            >
              {review.isPending
                ? 'Đang duyệt...'
                : `Duyệt ${groupTarget.filter((m) => groupChecked[m.id]).length} ca đã chọn`}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mealLabel(type: string): string {
  if (type === 'breakfast') return 'Bữa sáng';
  if (type === 'lunch') return 'Bữa trưa';
  if (type === 'dinner') return 'Bữa tối';
  return 'Món';
}

function iconForMeal(type: string): string {
  if (type === 'breakfast') return 'free_breakfast';
  if (type === 'lunch') return 'rice_bowl';
  if (type === 'dinner') return 'dinner_dining';
  return 'restaurant';
}

function toneForMeal(idx: number): 'honey' | 'emerald' | 'rose' {
  return (['honey', 'emerald', 'rose'] as const)[idx % 3];
}

function roleLabel(role: 'chef' | 'waiter' | 'shipper'): string {
  if (role === 'chef') return 'Đầu bếp';
  if (role === 'waiter') return 'Phục vụ';
  return 'Giao hàng';
}

// ─── Inline sub-components ─────────────────────────────────────────────────────

function DistributionRowInline({ d }: { d: NonNullable<ReturnType<typeof useManageContext>['campaign']['distributions']>[number] }) {
  const initials = d.servedBy.split(' ').map((w: string) => w.charAt(0)).slice(0, 2).join('').toUpperCase();
  return (
    <div className="cm-dist-row">
      <span className="cm-reg-thumb">{initials}</span>
      <div className="cm-dist-info">
        <p className="cm-dist-name">{d.roundLabel || 'Đợt phân phát'}</p>
        <p className="cm-dist-meta">
          Phụ trách: {d.servedBy} · {new Date(d.distributedAt).toLocaleDateString('vi-VN')}
          {d.leftoverServings > 0 ? ` · còn dư ${d.leftoverServings}` : ''}
        </p>
      </div>
      <span className="cm-dist-portions">{d.servingsServed} suất</span>
      <div className="cm-dist-actions">
        <button
          type="button"
          onClick={() => toast(d.note ? d.note : 'Chưa có ghi chú cho đợt này.')}
          className="cm-dist-btn cm-dist-btn--ghost"
          title="Xem ghi chú đợt phát"
        >
          <span className="material-symbols-outlined text-[14px]">visibility</span>
          Chi tiết
        </button>
        <button
          type="button"
          onClick={() => toast.info('Mở trang Phân phối để ghi đợt mới — nút "Tạo đợt mới" ở header.')}
          className="cm-dist-btn cm-dist-btn--primary"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          Ghi đợt mới
        </button>
      </div>
    </div>
  );
}

function MenuChip({ icon, label, note, tone }: { icon: string; label: string; note: string; tone: 'honey' | 'emerald' | 'rose' }) {
  const colors = { honey: 'bg-amber-50 text-amber-700', emerald: 'bg-emerald-50 text-emerald-700', rose: 'bg-rose-50 text-rose-700' }[tone];
  return (
    <div className="cm-menu-chip">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors}`}>
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold text-neutral-900">{label}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mt-0.5">{note}</p>
      </div>
      <span className="material-symbols-outlined text-[16px] text-neutral-300">chevron_right</span>
    </div>
  );
}
