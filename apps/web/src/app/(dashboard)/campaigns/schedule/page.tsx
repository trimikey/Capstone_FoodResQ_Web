'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useWeeklySchedule } from '@/hooks/useCampaigns';
import AvailabilityGrid from './AvailabilityGrid';
import DeliveryShiftsGrid from './DeliveryShiftsGrid';
import { useMyDeliveryShifts } from '@/hooks/useDeliveries';
import { errMsg } from '@/lib/utils';

const DAY_NAMES = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

const STATUS_COLOR: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Tuyển', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  in_progress: { label: 'Đang chạy', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  completed: { label: 'Hoàn thành', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const ROLE_COLOR: Record<string, { label: string; cls: string }> = {
  chef: { label: 'Đầu bếp', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  waiter: { label: 'Phục vụ', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  shipper: { label: 'Shipper', cls: 'bg-teal-100 text-teal-700 border-teal-200' },
};

function weekStartOf(date: Date): Date {
  const dow = date.getUTCDay();
  const diffToMonday = (dow + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diffToMonday));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function fmtDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function WeeklySchedulePage() {
  const [anchor, setAnchor] = useState<Date>(() => weekStartOf(new Date()));
  const weekStartKey = fmtDateKey(anchor);
  const { data: weekly, isLoading, error } = useWeeklySchedule(weekStartKey);
  // Ca giao hàng đã đăng ký — hiện chung lịch với ca chiến dịch để TNV nhìn một chỗ.
  const { data: deliveryShifts } = useMyDeliveryShifts();

  const days = weekly?.days ?? [];
  const isPersonal = weekly?.isPersonalView ?? false;

  const DELIVERY_PERIOD_LABEL: Record<string, string> = {
    midnight: '00:00–06:00', morning: '06:00–12:00', afternoon: '12:00–18:00', evening: '18:00–24:00',
  };
  const deliveryByDate = new Map<string, string[]>();
  for (const slot of deliveryShifts?.slots ?? []) {
    const list = deliveryByDate.get(slot.workDate) ?? [];
    list.push(DELIVERY_PERIOD_LABEL[slot.period] ?? slot.period);
    deliveryByDate.set(slot.workDate, list);
  }

  function gotoPrevWeek() {
    setAnchor((a) => addDays(a, -7));
  }
  function gotoNextWeek() {
    setAnchor((a) => addDays(a, 7));
  }
  function gotoThisWeek() {
    setAnchor(weekStartOf(new Date()));
  }

  const weekEnd = addDays(anchor, 6);
  const weekLabel = `${anchor.getUTCDate()}/${anchor.getUTCMonth() + 1} – ${weekEnd.getUTCDate()}/${weekEnd.getUTCMonth() + 1}/${weekEnd.getUTCFullYear()}`;

  return (
    <div className="cm-scope p-4 md:p-6 max-w-7xl mx-auto pb-24">
      <header className="mb-5">
        {/* Trang này gom lịch của CẢ HAI mảng việc, nên không gắn nhãn "Bếp ăn cộng
            đồng" nữa — nhãn đó khiến lưới ca giao hàng bên dưới bị hiểu nhầm là ca trực
            bếp của chiến dịch. */}
        <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">
          {isPersonal ? 'Tình nguyện viên' : 'Bếp ăn cộng đồng'}
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-neutral-900 mt-1">
          {isPersonal ? 'Lịch làm việc của tôi' : 'Lịch chiến dịch tổ chức'}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {isPersonal
            ? 'Gồm hai mảng việc tách biệt: ca trực bếp của chiến dịch, và ca giao đơn cho người nhận.'
            : 'Danh sách chiến dịch của tổ chức trong tuần.'}
        </p>
      </header>

      {/* Hai lưới đầu vào của TNV, đặt cạnh nhau vì trước đây chúng nằm hai trang khác
          nhau và trông y hệt nhau nên ai cũng tưởng là một: khai rảnh cả tuần rồi ngồi
          đợi đơn mà không hiểu sao không có. Xếp theo mức ràng buộc tăng dần — khai báo
          trước, cam kết sau — rồi mới tới lịch tuần vốn là HỆ QUẢ của cả hai. */}
      {isPersonal && (
        <div className="mb-4 space-y-3">
          <AvailabilityGrid />
          <DeliveryShiftsGrid />
        </div>
      )}

      {/* Week selector */}
      <div className="flex items-center justify-between gap-3 mb-4 bg-white border border-neutral-200 rounded-2xl p-3">
        <button
          type="button"
          onClick={gotoPrevWeek}
          className="w-10 h-10 rounded-xl border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center"
          aria-label="Tuần trước"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-neutral-900">{weekLabel}</p>
          <button
            type="button"
            onClick={gotoThisWeek}
            className="text-[11px] text-emerald-700 font-bold hover:underline mt-0.5"
          >
            Về tuần hiện tại
          </button>
        </div>
        <button
          type="button"
          onClick={gotoNextWeek}
          className="w-10 h-10 rounded-xl border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center"
          aria-label="Tuần sau"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {error ? (
        <div className="cm-card p-6 text-center text-rose-600">{errMsg(error, 'Không tải được lịch')}</div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 skeleton rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {days.map((day, idx) => {
            const date = addDays(anchor, idx);
            const isToday = fmtDateKey(new Date()) === day.date;

            return (
              <section
                key={day.date}
                className={`cm-card !p-0 overflow-hidden flex flex-col ${
                  isToday ? 'ring-2 ring-emerald-400' : ''
                }`}
              >
                {/* Day header */}
                <header
                  className={`px-3 py-2 border-b border-neutral-200 ${
                    isToday ? 'bg-emerald-50' : 'bg-neutral-50'
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    {DAY_NAMES[idx]}
                  </p>
                  <p className="font-extrabold text-neutral-900 text-sm">
                    {date.getUTCDate()}/{date.getUTCMonth() + 1}
                  </p>
                </header>

                {/* Campaigns */}
                <div className="p-2 space-y-1.5 flex-1 min-h-[120px]">
                  {/* Ca giao hàng của chính TNV trong ngày này */}
                  {(deliveryByDate.get(day.date) ?? []).map((time) => (
                    <div
                      key={`dlv-${day.date}-${time}`}
                      className="rounded-xl border border-teal-200 bg-teal-50 px-2 py-1.5"
                    >
                      <p className="flex items-center gap-1 text-[11px] font-bold text-teal-800">
                        <span className="material-symbols-outlined text-[13px]">local_shipping</span>
                        Ca giao hàng
                      </p>
                      <p className="text-[10px] text-teal-700">{time}</p>
                    </div>
                  ))}
                  {day.campaigns.length === 0 && (deliveryByDate.get(day.date) ?? []).length === 0 ? (
                    <p className="text-[11px] text-neutral-400 italic text-center py-4">
                      Không có lịch
                    </p>
                  ) : (
                    day.campaigns.map((c) => (
                      <ScheduleChip key={c.id} campaign={c} isPersonal={isPersonal} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Ô lịch cho cả hai chế độ xem. Điểm đến khác nhau vì hai nhánh của
 * `getWeeklySchedule` trả về shape khác nhau:
 *  - TNV  (isPersonal): `id` = assignment UUID, `campaignId` = campaign UUID
 *          → mở trang chi tiết chiến dịch công khai.
 *  - Tổ chức          : `id` = campaign UUID, KHÔNG có `campaignId`
 *          → mở trang quản lý chiến dịch của tổ chức.
 *
 * Trước đây cả hai đều trỏ tới `/campaigns/{campaignId}/manage/overview`:
 * route `overview` không tồn tại (chỉ có `manage`, `manage/menu`, `manage/status`…)
 * nên TNV bấm vào là 404, còn nhánh tổ chức thì `campaignId` undefined
 * → `/campaigns/undefined/manage/overview`. Ngoài ra `manage` là khu vực của tổ
 * chức sở hữu (BE `assertOwner`), TNV vào cũng chỉ nhận 403.
 */
function ScheduleChip({
  campaign,
  isPersonal,
}: {
  campaign: { id: string; campaignId?: string; title: string; status: string; role?: string; assignmentStatus?: string; shift?: { label: string; startTime: string; endTime: string } | null };
  isPersonal: boolean;
}) {
  const statusMeta = STATUS_COLOR[campaign.status] ?? { label: campaign.status, cls: 'bg-neutral-100 text-neutral-600 border-neutral-200' };
  const roleMeta = campaign.role ? (ROLE_COLOR[campaign.role] ?? { label: campaign.role, cls: 'bg-neutral-100 text-neutral-600 border-neutral-200' }) : null;
  // Đăng ký còn chờ tổ chức duyệt — chưa phải ca chính thức, hiển thị mờ + badge
  // riêng để TNV không tưởng mình đã được nhận (BE đã loại ca bị từ chối/hủy).
  const isPendingApproval = isPersonal && campaign.assignmentStatus === 'pending';

  const href = isPersonal
    ? `/campaigns/${campaign.campaignId ?? campaign.id}`
    : `/campaigns/${campaign.id}/manage`;

  return (
    <Link
      href={href}
      title={isPersonal ? 'Xem chi tiết chiến dịch' : 'Mở trang quản lý chiến dịch'}
      className={`block p-2 rounded-xl border bg-white hover:border-emerald-300 hover:shadow-sm transition-all text-left ${
        isPendingApproval ? 'border-dashed border-amber-300 opacity-75' : ''
      }`}
    >
      {campaign.shift && (
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] text-amber-600 font-bold">⏰</span>
          <span className="text-[10px] font-bold text-amber-700">
            {campaign.shift.startTime}–{campaign.shift.endTime}
          </span>
        </div>
      )}
      <p className="text-[11px] font-extrabold text-neutral-900 line-clamp-2 leading-tight mb-1">
        {campaign.title}
      </p>
      <div className="flex flex-wrap gap-1">
        {roleMeta && (
          <span className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${roleMeta.cls}`}>
            {roleMeta.label}
          </span>
        )}
        {isPendingApproval ? (
          <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
            Chờ duyệt
          </span>
        ) : (
          <span className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${statusMeta.cls}`}>
            {statusMeta.label}
          </span>
        )}
      </div>
    </Link>
  );
}
