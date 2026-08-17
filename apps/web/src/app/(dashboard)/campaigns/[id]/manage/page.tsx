'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  RegistrationRow,
  RoleProgressBar,
} from '../../_components/CampaignManageShared';
import { useManageContext } from '../../_components/ManageShell';
import { useReviewAssignment, useApproveDishFinalStep, useRejectDishFinalStep } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';
import CampaignPlaybook, {
  type CampaignPhaseKey,
} from '@/components/campaigns/CampaignPlaybook';

type DishStepForUI = {
  id: string;
  menuItemId: string;
  name: string;
  stepOrder: number;
  effectiveStatus: string;
  scheduledTime: string | null;
};

type DishStepsPayload =
  | DishStepForUI[]
  | {
      dishes?: Array<{
        id: string;
        name: string;
        steps?: Array<Omit<DishStepForUI, 'name'> & { stepName?: string }>;
      }>;
    };

export default function ManageOverviewPage() {
  const { campaign: c } = useManageContext();
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [dishRejection, setDishRejection] = useState<{ menuItemId: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const review = useReviewAssignment();
  const approveDish = useApproveDishFinalStep();
  const rejectDish = useRejectDishFinalStep();

  const stats = {
    totalSlots: c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded,
    filledSlots: c.chefSlotsFilled + c.waiterSlotsFilled + c.shipperSlotsFilled,
    target: c.expectedServings ?? 100,
    served: c.actualServings ?? c.distributionSummary?.servingsServed ?? 0,
    pct: 0,
    remaining: 0,
  };
  stats.pct = stats.target > 0 ? Math.min(100, Math.round((stats.served / stats.target) * 100)) : 0;
  stats.remaining = Math.max(0, stats.target - stats.served);
  // Phase highlight theo status — gợi ý bước tiếp theo cho charity.
  const playbookHighlight: CampaignPhaseKey | null =
    c.status === 'completed'
      ? 'report'
      : c.status === 'in_progress'
      ? 'distribute'
      : c.status === 'approved'
      ? 'recruit'
      : c.status === 'cancelled'
      ? 'plan'
      : 'plan';

  function decide(assignmentId: string, volunteerName: string, action: 'approved' | 'rejected') {
    const target = c.participants?.find((p) => p.id === assignmentId);
    if (!target) return;

    if (action === 'approved' && c.shifts?.length && !target.shiftId) {
      toast.error('Đăng ký này chưa gắn ca. Mở trang Đăng ký chờ duyệt để chọn ca trước khi duyệt.');
      return;
    }

    void review.mutateAsync(
      {
        campaignId: c.id,
        assignmentId,
        action,
        ...(action === 'approved' && target.shiftId ? { shiftId: target.shiftId } : {}),
      },
      {
        onSuccess: () => {
          setDecisions((prev) => ({ ...prev, [assignmentId]: action }));
          toast.success(action === 'approved' ? `Đã duyệt ${volunteerName}` : `Đã từ chối ${volunteerName}`);
        },
        onError: (e) => {
          toast.error(errMsg(e, action === 'approved' ? 'Duyệt thất bại' : 'Từ chối thất bại'));
        },
      },
    );
  }

  // Lọc món cần duyệt: step cuối (order=4) đang ở trạng thái "available" (chef đã tick)
  // Deduplicate theo menuItemId để tránh duplicate key warning
  const dishStepsPayload = (c as { dishSteps?: DishStepsPayload })?.dishSteps;
  const dishStepsForUI: DishStepForUI[] = Array.isArray(dishStepsPayload)
    ? dishStepsPayload
    : Array.isArray(dishStepsPayload?.dishes)
      ? dishStepsPayload.dishes.flatMap((dish) =>
          Array.isArray(dish.steps)
            ? dish.steps.map((step) => ({
                ...step,
                menuItemId: step.menuItemId ?? dish.id,
                name: dish.name,
              }))
            : [],
        )
      : [];
  const rawPendingDishes = dishStepsForUI.filter(
    (s) => s.stepOrder === 4 && s.effectiveStatus === 'available'
  );
  const seenMenuItemIds = new Set<string>();
  const pendingDishApprovals = rawPendingDishes.filter((dish) => {
    if (seenMenuItemIds.has(dish.menuItemId)) return false;
    seenMenuItemIds.add(dish.menuItemId);
    return true;
  });

  async function handleApproveDish(menuItemId: string, name: string) {
    if (!c) return;
    try {
      await approveDish.mutateAsync({ campaignId: c.id, menuItemId });
      toast.success(`Đã duyệt "${name}" — món sẵn sàng phát xuất.`);
    } catch (e) {
      toast.error(errMsg(e, 'Duyệt thất bại'));
    }
  }

  async function handleRejectDish() {
    if (!dishRejection || !c || !rejectReason.trim()) return;
    try {
      await rejectDish.mutateAsync({ campaignId: c.id, menuItemId: dishRejection.menuItemId, reason: rejectReason.trim() });
      toast.info(`Đã từ chối "${dishRejection.name}" — chef sẽ nhận thông báo.`);
      setDishRejection(null);
      setRejectReason('');
    } catch (e) {
      toast.error(errMsg(e, 'Từ chối thất bại'));
    }
  }

  return (
    <>
      {/* Tiến độ mục tiêu */}
      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title">
          <span className="material-symbols-outlined">monitoring</span>
          Tiến độ mục tiêu
        </h2>
        <p className="cm-manage-card-sub">
          Số suất ăn đã phục vụ so với mục tiêu ban đầu.
        </p>

        <div className="cm-progress-stats">
          <div className="cm-progress-stat cm-progress-stat--target">
            <span className="cm-progress-stat-label">Mục tiêu</span>
            <span className="cm-progress-stat-value">{stats.target.toLocaleString('vi-VN')}</span>
            <span className="cm-progress-stat-sub">Suất ăn dự kiến</span>
          </div>
          <div className="cm-progress-stat cm-progress-stat--done">
            <span className="cm-progress-stat-label">Đã đạt</span>
            <span className="cm-progress-stat-value">{stats.served.toLocaleString('vi-VN')}</span>
            <span className="cm-progress-stat-sub">Suất đã phát</span>
          </div>
          <div className="cm-progress-stat cm-progress-stat--remain">
            <span className="cm-progress-stat-label">Còn lại</span>
            <span className="cm-progress-stat-value">{stats.remaining.toLocaleString('vi-VN')}</span>
            <span className="cm-progress-stat-sub">Cần phục vụ thêm</span>
          </div>
          <div className="cm-progress-stat cm-progress-stat--pct">
            <span className="cm-progress-stat-label">Tỉ lệ</span>
            <span className="cm-progress-stat-value">{stats.pct}%</span>
            <span className="cm-progress-stat-sub">Hoàn thành mục tiêu</span>
          </div>
        </div>

        <div className="cm-progress-bar">
          <div className="cm-progress-bar-fill" style={{ width: `${stats.pct}%` }} />
        </div>
        <div className="cm-progress-meta">
          <span>
            Đã đạt <b>{stats.served.toLocaleString('vi-VN')}</b> / {stats.target.toLocaleString('vi-VN')} suất
          </span>
          <span>
            <b>{stats.filledSlots}/{stats.totalSlots}</b> TNV tham gia
          </span>
        </div>
      </section>

      {/* Gợi ý quy trình tổ chức — collapsible dropdown */}
      <section className="cm-manage-card">
        <CampaignPlaybook variant="inline" highlightKey={playbookHighlight} />
      </section>

      {/* Món ăn chờ duyệt QC — chef đã tick "Sẵn sàng phát xuất" */}
      {c.status === 'in_progress' && pendingDishApprovals.length > 0 && (
        <section className="cm-manage-card">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-amber-600">pending_actions</span>
            <h2 className="cm-manage-card-title !mb-0">
              Món chờ duyệt QC ({pendingDishApprovals.length})
            </h2>
          </div>
          <p className="cm-manage-card-sub mb-4">
            Chef đã tick "Sẵn sàng phát xuất". Kiểm tra và duyệt để món được phát.
          </p>
          <div className="space-y-3">
            {pendingDishApprovals.map((dish) => (
              <div
                key={dish.menuItemId}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-neutral-900 truncate">{dish.name}</p>
                  {dish.scheduledTime && (
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Dự kiến: {dish.scheduledTime}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDishRejection({ menuItemId: dish.menuItemId, name: dish.name })}
                    className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-600 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 transition-colors"
                  >
                    Từ chối
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproveDish(dish.menuItemId, dish.name)}
                    disabled={approveDish.isPending}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    Duyệt ✓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title">
          <span className="material-symbols-outlined">group</span>
          Nhân sự theo vai trò
        </h2>
        <div className="space-y-3">
          <RoleProgressBar
            label="Đầu bếp"
            icon="skillet"
            filled={c.chefSlotsFilled}
            needed={c.chefSlotsNeeded}
            tone="honey"
          />
          <RoleProgressBar
            label="Phục vụ"
            icon="room_service"
            filled={c.waiterSlotsFilled}
            needed={c.waiterSlotsNeeded}
            tone="sky"
          />
          <RoleProgressBar
            label="Giao hàng"
            icon="local_shipping"
            filled={c.shipperSlotsFilled}
            needed={c.shipperSlotsNeeded}
            tone="emerald"
          />
        </div>
      </section>


      {/* Inline quick registrations */}
      {(() => {
        // Deduplicate participants theo id để tránh duplicate key warning
        const seen = new Set<string>();
        const uniqueParticipants = (c.participants ?? []).filter((p: { id: string }) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
        return uniqueParticipants.length > 0 && (
        <section className="cm-manage-card !p-0">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="cm-manage-card-title !mb-0">
              <span className="material-symbols-outlined">pending_actions</span>
              Đăng ký gần đây ({uniqueParticipants.length})
            </h2>
            <Link
              href={`/campaigns/${c.id}/manage/registrations`}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
            >
              Xem tất cả →
            </Link>
          </div>
          <div className="px-2 pb-3">
            {uniqueParticipants.slice(0, 4).map((p: { id: string }, idx: number) => (
                <RegistrationRow
                  key={`${p.id}-${idx}`}
                  p={p as Parameters<typeof RegistrationRow>[0]['p']}
                  shifts={c.shifts}
                  decision={decisions[p.id]}
                  pending={review.isPending && review.variables?.assignmentId === p.id}
                  onDecide={decide}
                />
              ))}
          </div>
        </section>
        );
      })()}

      {/* Modal từ chối món */}
      {dishRejection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDishRejection(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-4 text-white">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">warning</span>
                <p className="font-bold">Từ chối món</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                <p className="text-sm font-bold text-rose-800">{dishRejection.name}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1">
                  Lý do từ chối <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="VD: Món chưa đạt yêu cầu, thiếu thành phần, không đảm bảo vệ sinh..."
                  className="w-full rounded-xl border border-neutral-200 p-3 text-xs focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-200"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setDishRejection(null); setRejectReason(''); }}
                  className="flex-1 rounded-xl border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-50 transition-colors"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  onClick={handleRejectDish}
                  disabled={!rejectReason.trim() || rejectDish.isPending}
                  className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                >
                  {rejectDish.isPending ? 'Đang gửi...' : 'Từ chối'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
