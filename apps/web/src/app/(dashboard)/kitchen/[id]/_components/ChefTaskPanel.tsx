'use client';

import type { MyTask } from '@/hooks/useCampaigns';
import { CampaignTaskAction } from '@/app/(dashboard)/campaigns/_components/CampaignTaskAction';

const STEPS = [
  { key: 'assigned', label: 'Nhận việc', icon: 'assignment_turned_in' },
  { key: 'checked_in', label: 'Điểm danh', icon: 'location_on' },
  { key: 'in_progress', label: 'Đang nấu', icon: 'skillet' },
  { key: 'completed', label: 'Hoàn thành', icon: 'verified' },
];

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Đã nhận việc',
  checked_in: 'Đã điểm danh',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn thành',
};

export default function ChefTaskPanel({ task }: { task: MyTask }) {
  const stepIndex = STEPS.findIndex((step) => step.key === task.status);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 md:py-8">
      <section className="overflow-hidden rounded-[28px] bg-[#123c2d] p-5 text-white shadow-xl shadow-emerald-950/15 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-100/70">Nhiệm vụ của tôi</p>
            <h1 className="mt-2 text-2xl font-black md:text-3xl">{task.campaign.title}</h1>
            <p className="mt-2 text-sm text-emerald-100/80">Đầu bếp tình nguyện · {STATUS_LABEL[task.status] ?? task.status}</p>
          </div>
          <span className="rounded-full border border-emerald-300/30 bg-emerald-300/15 px-3 py-1.5 text-xs font-extrabold text-emerald-100">
            {STATUS_LABEL[task.status] ?? task.status}
          </span>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
          {STEPS.map((step, index) => {
            const done = index <= stepIndex;
            return (
              <div key={step.key} className={`rounded-2xl border p-3 ${done ? 'border-emerald-300/30 bg-emerald-300/15' : 'border-white/10 bg-white/[0.04]'}`}>
                <span className={`material-symbols-outlined text-[20px] ${done ? 'text-emerald-200' : 'text-white/35'}`}>{step.icon}</span>
                <p className="mt-1 text-xs font-bold">{step.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-5 cm-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-700">assignment_ind</span>
              <h2 className="text-lg font-black text-neutral-900">Nhiệm vụ được phân công</h2>
            </div>
            <p className="mt-1 text-sm text-neutral-500">Thông tin phân công hiện tại của bạn trong chiến dịch.</p>
          </div>
          <span className="cm-chip cm-chip--mint">{STATUS_LABEL[task.status] ?? task.status}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-neutral-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Vai trò và ca làm</p>
            <p className="mt-1 text-sm font-extrabold text-neutral-900">Đầu bếp tình nguyện</p>
            <p className="mt-1 text-xs text-neutral-600">
              {task.shift ? `${task.shift.label} · ${task.shift.startTime}–${task.shift.endTime}` : `${task.campaign.startTime}–${task.campaign.endTime}`}
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Địa điểm</p>
            <p className="mt-1 text-sm font-extrabold text-neutral-900">{task.campaign.kitchenAddress}</p>
            <p className="mt-1 text-xs text-neutral-600">{new Date(task.campaign.scheduledDate).toLocaleDateString('vi-VN')}</p>
          </div>
        </div>
        {task.notes && <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-950"><strong>Ghi chú:</strong> {task.notes}</p>}
        <CampaignTaskAction t={task} className="mt-4 inline-flex rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50" />
      </section>
    </main>
  );
}
