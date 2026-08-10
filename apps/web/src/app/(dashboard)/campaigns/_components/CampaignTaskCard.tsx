'use client';

import Link from 'next/link';
import { type MyTask } from '@/hooks/useCampaigns';
import { ROLE_META } from './RoleBadge';
import { CampaignTaskAction, TASK_NEXT } from './CampaignTaskAction';

const TASK_STATUS_META: Record<string, { label: string; chip: string }> = {
  pending: { label: 'Chờ duyệt', chip: 'cm-chip cm-chip--honey' },
  rejected: { label: 'Bị từ chối', chip: 'cm-chip cm-chip--rose' },
  assigned: { label: 'Đã nhận việc', chip: 'cm-chip cm-chip--sky' },
  checked_in: { label: 'Đã điểm danh', chip: 'cm-chip cm-chip--mint' },
  in_progress: { label: 'Đang làm', chip: 'cm-chip cm-chip--honey' },
  completed: { label: 'Hoàn thành', chip: 'cm-chip cm-chip--mint' },
  absent: { label: 'Vắng', chip: 'cm-chip cm-chip--rose' },
  cancelled: { label: 'Đã huỷ', chip: 'cm-chip cm-chip--ink' },
};

function taskStartDate(t: MyTask): Date | null {
  const datePart = t.campaign.scheduledDate?.slice(0, 10);
  if (!datePart) return null;
  const timePart = (t.campaign.startTime ?? '00:00').slice(0, 5);
  const date = new Date(`${datePart}T${timePart}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function taskEndDate(t: MyTask): Date | null {
  const datePart = t.campaign.scheduledDate?.slice(0, 10);
  if (!datePart) return null;
  const timePart = (t.campaign.endTime ?? '23:59').slice(0, 5);
  const date = new Date(`${datePart}T${timePart}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

function urgencyOf(t: MyTask, now: Date): {
  kind: 'today' | 'urgent' | 'overdue' | 'normal';
  isCompleted: boolean;
} {
  const isCompleted = t.status === 'completed' || t.status === 'cancelled' || t.status === 'absent';
  const start = taskStartDate(t);
  const end = taskEndDate(t);

  if (!start || isCompleted) return { kind: 'normal', isCompleted };

  const diffStartMin = (start.getTime() - now.getTime()) / 60_000;
  const diffEndMin = end ? (end.getTime() - now.getTime()) / 60_000 : Number.POSITIVE_INFINITY;

  if (diffEndMin < 0) return { kind: 'overdue', isCompleted };
  if (diffStartMin <= 0 && diffEndMin > 0) return { kind: 'urgent', isCompleted };
  if (diffStartMin > 0 && diffStartMin <= 60 && isSameUtcDay(start, now)) return { kind: 'urgent', isCompleted };
  if (isSameUtcDay(start, now)) return { kind: 'today', isCompleted };
  return { kind: 'normal', isCompleted };
}

const TASK_STEPS = [
  { key: 'assigned', label: 'Nhận việc' },
  { key: 'checked_in', label: 'Điểm danh' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'completed', label: 'Hoàn thành' },
];

export default function CampaignTaskCard({ t }: { t: MyTask }) {
  const rm = ROLE_META[t.role];
  const status = TASK_STATUS_META[t.status] ?? { label: t.status, chip: 'cm-chip cm-chip--ink' };
  const stepIdx = TASK_STEPS.findIndex((step) => step.key === t.status);
  const next = TASK_NEXT[t.status]?.(t.role) ?? null;
  const campaignRunning = t.campaign.status === 'in_progress';
  const urgency = urgencyOf(t, new Date());
  const cardClass = urgency.kind === 'overdue'
    ? 'cm-card cm-card--overdue p-4'
    : urgency.kind === 'urgent'
      ? 'cm-card cm-card--urgent p-4'
      : 'cm-card p-4';

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {rm && (
            <span className={`badge ${rm.badge}`}>
              <span className="material-symbols-outlined text-[14px]">{rm.icon}</span>
              {rm.label}
            </span>
          )}
          {urgency.kind === 'overdue' && !urgency.isCompleted && (
            <span className="cm-urgent-pill cm-urgent-pill--rose">
              <span className="material-symbols-outlined text-[14px]">priority_high</span>
              Quá hạn
            </span>
          )}
          {urgency.kind === 'urgent' && !urgency.isCompleted && (
            <span className="cm-urgent-pill cm-urgent-pill--amber">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              Sắp tới giờ
            </span>
          )}
          {urgency.kind === 'today' && !urgency.isCompleted && (
            <span className="cm-urgent-pill cm-urgent-pill--honey">
              <span className="material-symbols-outlined text-[14px]">wb_sunny</span>
              Hôm nay
            </span>
          )}
        </div>
        <span className={status.chip}>{status.label}</span>
      </div>

      <h3 className="font-bold text-neutral-900 text-sm truncate">{t.campaign.title}</h3>
      <div className="flex flex-wrap gap-3 mt-2 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">event</span>
          {new Date(t.campaign.scheduledDate).toLocaleDateString('vi-VN')} · {t.campaign.startTime}–{t.campaign.endTime}
        </span>
        <span className="inline-flex items-center gap-1 truncate flex-1 min-w-0">
          <span className="material-symbols-outlined text-[14px]">place</span>
          {t.campaign.kitchenAddress}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/campaigns/${t.campaign.id}`} className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-3 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100">
          <span className="material-symbols-outlined text-[15px]">visibility</span>
          Xem chi tiết chiến dịch
        </Link>
        {(t.role === 'chef' || t.role === 'waiter') && (
          <Link href={`/my-tasks/${t.id}`} className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-honey-100 bg-honey-50 px-3 text-[11px] font-bold text-honey-700 transition-colors hover:bg-honey-100">
            <span className="material-symbols-outlined text-[15px]">soup_kitchen</span>
            Vào nhiệm vụ →
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1 mt-3">
        {TASK_STEPS.map((step, index) => (
          <div key={step.key} className={`flex-1 h-1.5 rounded-full ${index <= stepIdx ? 'bg-emerald-500' : 'bg-neutral-200'}`} title={step.label} />
        ))}
      </div>

      {t.status === 'pending' ? (
        <p className="text-[11px] text-honey-700 mt-3 flex items-center gap-1 font-semibold">
          <span className="material-symbols-outlined text-[14px]">hourglass_top</span>
          Chờ quản trị viên duyệt đăng ký
        </p>
      ) : t.status === 'rejected' ? (
        <p className="text-[11px] text-rose-600 mt-3 flex items-center gap-1 font-semibold">
          <span className="material-symbols-outlined text-[14px]">cancel</span>
          Đăng ký chưa được duyệt
        </p>
      ) : t.status === 'completed' ? (
        <p className="text-[11px] text-emerald-700 mt-3 flex items-center gap-1 font-semibold">
          <span className="material-symbols-outlined text-[14px]">verified</span>
          Đã hoàn thành — cảm ơn bạn!
        </p>
      ) : !campaignRunning ? (
        <p className="text-[11px] text-neutral-400 mt-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">schedule</span>
          Chờ tổ chức bắt đầu chiến dịch
        </p>
      ) : next ? <CampaignTaskAction t={t} /> : null}
    </div>
  );
}
