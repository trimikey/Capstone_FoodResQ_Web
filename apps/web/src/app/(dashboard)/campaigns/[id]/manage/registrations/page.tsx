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
import { errMsg } from '@/lib/utils';

export default function RegistrationsPage() {
  const { campaign: c, openAction } = useManageContext();
  const [filter, setFilter] = useState<'all' | 'pending' | 'chef' | 'waiter' | 'shipper'>('all');
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});
  const review = useReviewAssignment();
  const startCampaign = useStartCampaign();

  async function onStart() {
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

  const volunteers: CampaignParticipant[] = c.participants ?? [];
  const filteredVolunteers: CampaignParticipant[] =
    filter === 'all' || filter === 'pending'
      ? volunteers
      : volunteers.filter((v) => v.role === filter);

  const pendingCount = volunteers.filter(
    (v) => !v.status || v.status === 'pending' || v.status === 'applied',
  ).length;

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

  function decide(id: string, name: string, action: 'approved' | 'rejected') {
    // Optimistic update cho UX phản hồi nhanh
    setDecisions((prev) => ({ ...prev, [id]: action }));
    void review.mutateAsync(
      { campaignId: c.id, assignmentId: id, action },
      {
        onSuccess: () => {
          toast.success(action === 'approved' ? `Đã duyệt ${name}` : `Đã từ chối ${name}`);
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

  return (
    <div className="cm-manage-2col">
      <div className="cm-manage-2col-main space-y-4">
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
                disabled={c.status !== 'open' || startCampaign.isPending}
                className="cm-manage-cta-primary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                {startCampaign.isPending ? 'Đang bắt đầu...' : 'Bắt đầu đợt mới'}
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
                  className={`cm-mini-tab ${filter === t.key ? '!bg-emerald-700 !text-white !border-emerald-700' : ''}`}
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
              {filteredVolunteers.map((p) => (
                <RegistrationRow
                  key={p.id}
                  p={p}
                  decision={decisions[p.id]}
                  onDecide={decide}
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
              slotWarnings.map((w, i) => (
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
