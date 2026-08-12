'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  RegistrationRow,
  RoleProgressBar,
} from '../../_components/CampaignManageShared';
import { useManageContext } from '../../_components/ManageShell';
import { useReviewAssignment } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';
import CampaignPlaybook, {
  type CampaignPhaseKey,
} from '@/components/campaigns/CampaignPlaybook';

export default function ManageOverviewPage() {
  const { campaign: c } = useManageContext();
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});
  const review = useReviewAssignment();

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
      : c.status === 'open'
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
      {c.participants && c.participants.length > 0 && (
        <section className="cm-manage-card !p-0">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="cm-manage-card-title !mb-0">
              <span className="material-symbols-outlined">pending_actions</span>
              Đăng ký gần đây ({c.participants.length})
            </h2>
            <Link
              href={`/campaigns/${c.id}/manage/registrations`}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
            >
              Xem tất cả →
            </Link>
          </div>
          <div className="px-2 pb-3">
            {c.participants.slice(0, 4).map((p) => (
                <RegistrationRow
                  key={p.id}
                  p={p as Parameters<typeof RegistrationRow>[0]['p']}
                  shifts={c.shifts}
                  decision={decisions[p.id]}
                  pending={review.isPending && review.variables?.assignmentId === p.id}
                  onDecide={decide}
                />
              ))}
          </div>
        </section>
      )}
    </>
  );
}
