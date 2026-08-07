'use client';

import type { MyTask } from '@/hooks/useCampaigns';
import { usePublicCampaignDetail } from '@/hooks/useCampaigns';
import { useShifts } from '@/hooks/useKitchenOps';

export default function ChefSchedulePanel({ task }: { task: MyTask }) {
  const campaignId = task.campaign.id;
  const { data: campaign } = usePublicCampaignDetail(campaignId);
  const { data: shifts = [] } = useShifts(campaignId);
  const scheduleItems = campaign?.scheduleItems ?? [];
  const sortedShifts = [...shifts].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 md:py-8">
      <section className="cm-card p-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-700">calendar_month</span>
          <div>
            <h1 className="text-xl font-black text-neutral-900">Lịch trình chiến dịch</h1>
            <p className="mt-1 text-sm text-neutral-500">Mốc hoạt động và các ca làm việc của {task.campaign.title}.</p>
          </div>
        </div>
        {scheduleItems.length > 0 && (
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {scheduleItems.map((item, index) => (
              <div key={`${item.time}-${index}`} className="flex items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2.5">
                <span className="min-w-16 text-xs font-black text-emerald-800">{item.time}</span>
                <p className="text-sm font-semibold text-neutral-800">{item.label}</p>
              </div>
            ))}
          </div>
        )}
        {sortedShifts.length > 0 ? (
          <div className="mt-5 space-y-2">
            {sortedShifts.map((shift) => {
              const isOwnShift = task.shiftId === shift.id || task.shift?.id === shift.id;
              const role = shift.role === 'chef' ? 'Đầu bếp' : shift.role === 'waiter' ? 'Phục vụ' : shift.role === 'shipper' ? 'Giao hàng' : 'Ca chung';
              return (
                <div key={shift.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-3 py-3 ${isOwnShift ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-100 bg-white'}`}>
                  <span className="material-symbols-outlined text-[20px] text-emerald-700">schedule</span>
                  <div className="min-w-[150px] flex-1">
                    <p className="text-sm font-extrabold text-neutral-900">{shift.label}</p>
                    <p className="text-xs text-neutral-500">{role} · {shift.startTime}–{shift.endTime}</p>
                  </div>
                  <p className="text-xs font-bold text-neutral-500">{shift.slotsFilled}/{shift.slotsNeeded} đã xếp</p>
                  {isOwnShift && <span className="rounded-full bg-emerald-700 px-2 py-1 text-[11px] font-bold text-white">Ca của bạn</span>}
                </div>
              );
            })}
          </div>
        ) : scheduleItems.length === 0 ? (
          <div className="mt-5 rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-600">
            {task.campaign.startTime}–{task.campaign.endTime} · {new Date(task.campaign.scheduledDate).toLocaleDateString('vi-VN')}
          </div>
        ) : null}
      </section>
    </main>
  );
}
