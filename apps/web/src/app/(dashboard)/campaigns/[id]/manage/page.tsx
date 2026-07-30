'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  RegistrationRow,
  DistributionRow,
  RoleProgressBar,
  StatusTab,
} from '../../_components/CampaignManageShared';
import { STATUS_META, useManageContext } from '../../_components/ManageShell';
import CampaignPlaybook, {
  type CampaignPhaseKey,
} from '@/components/campaigns/CampaignPlaybook';

type StatusKey = 'running' | 'pending' | 'finished';

export default function ManageOverviewPage() {
  const { campaign: c } = useManageContext();
  const [statusTab, setStatusTab] = useState<'running' | 'pending' | 'finished'>('running');
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});

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
  const statusMeta = STATUS_META[c.status];

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
    setDecisions((prev) => ({ ...prev, [assignmentId]: action }));
    // Toast handled in shell
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

      {/* Trạng thái + nút thao tác */}
      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title">
          <span className="material-symbols-outlined">flag</span>
          Trạng thái chiến dịch
        </h2>
        <p className="cm-manage-card-sub">
          Quản lý vòng đời chiến dịch: bắt đầu, hoàn tất hoặc huỷ.
        </p>

        <div className="cm-status-tab-row mb-5">
          <StatusTab
            label="Đang chạy"
            icon="play_circle"
            active={statusTab === 'running'}
            onClick={() => setStatusTab('running')}
          />
          <StatusTab
            label="Chờ duyệt"
            icon="pending"
            active={statusTab === 'pending'}
            onClick={() => setStatusTab('pending')}
          />
          <StatusTab
            label="Đã kết thúc"
            icon="verified"
            active={statusTab === 'finished'}
            onClick={() => setStatusTab('finished')}
          />
        </div>

        {statusTab === 'running' && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
            <p className="font-extrabold text-emerald-900 flex items-center gap-2">
              <span className="material-symbols-outlined">check_circle</span>
              Chiến dịch đang hoạt động
            </p>
            <p className="text-sm text-emerald-700 mt-1">
              Mọi ca làm việc đang được phục vụ. Chuyển sang trạng thái hoàn tất khi đã phục vụ đủ — bấm nút ở góc trên-phải hero.
            </p>
          </div>
        )}
        {statusTab === 'pending' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
            <p className="font-extrabold text-amber-900 flex items-center gap-2">
              <span className="material-symbols-outlined">schedule</span>
              Chờ quản trị viên duyệt
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Yêu cầu tạo chiến dịch đang được xem xét.
            </p>
          </div>
        )}
        {statusTab === 'finished' && (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/40 p-5">
            <p className="font-extrabold text-neutral-900 flex items-center gap-2">
              <span className="material-symbols-outlined">verified</span>
              Chiến dịch đã hoàn tất
            </p>
            <p className="text-sm text-neutral-600 mt-1">
              {c.actualServings ?? c.distributionSummary?.servingsServed ?? 0} suất ·{' '}
              {c.distributionSummary?.peopleServed ?? 0} người · {c.participants?.length ?? 0} TNV.
            </p>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-neutral-100">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-2">
            Trạng thái hiện tại
          </p>
          <span className={`${statusMeta.chip} text-sm`}>
            <span className="material-symbols-outlined text-[14px]">{statusMeta.icon}</span>
            {statusMeta.label}
          </span>
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
                  decision={decisions[p.id]}
                  onDecide={decide}
                />
              ))}
          </div>
        </section>
      )}
    </>
  );
}
