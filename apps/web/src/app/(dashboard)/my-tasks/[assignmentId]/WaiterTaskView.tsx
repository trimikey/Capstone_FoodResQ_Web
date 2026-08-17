'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAdvanceTask, type MyTaskDetail } from '@/hooks/useCampaigns';
import CompleteDistributionModal from './CompleteDistributionModal';
import { formatCampaignRange } from '@/lib/campaign-schedule';
import { formatVnDate } from '@/lib/vn-date';
import { errMsg, mediaUrl } from '@/lib/utils';

/**
 * Màn "Vào nhiệm vụ" của PHỤC VỤ.
 *
 * Trước đây phục vụ thấy đúng bảng 4 khâu của đầu bếp (sơ chế → nấu → trình bày →
 * sẵn sàng phát). Đó là việc của bếp, không phải việc của họ: phục vụ không nấu,
 * họ chờ món xong rồi chia suất và phát cho người tới nhận.
 *
 * Việc thật của phục vụ, theo thứ tự:
 *   1. Điểm danh tại bếp
 *   2. Ca trực được phân
 *   3. Theo dõi món nào ĐÃ SẴN SÀNG PHÁT (khâu 4 của bếp xong) — đây là tín hiệu
 *      để bắt đầu chia suất, thay vì phải hỏi bếp
 *   4. Các đợt phát tổ chức giao — chốt bằng số suất THỰC PHÁT
 */

interface Props {
  detail: MyTaskDetail;
  onCheckedIn: () => void;
}

export default function WaiterTaskView({ detail, onCheckedIn }: Props) {
  const { assignment, campaign } = detail;
  const dishes = detail.dishes ?? [];
  const distributions = detail.distributions ?? [];
  const advance = useAdvanceTask();
  const [closing, setClosing] = useState<
    MyTaskDetail['distributions'] extends (infer U)[] | undefined ? U | null : null
  >(null);

  const checkedIn = ['checked_in', 'in_progress', 'completed'].includes(assignment.status);
  const lateMinutes = assignment.checkInLateMinutes ?? 0;
  const campaignRunning = campaign.status === 'in_progress';

  // Khâu 4 ("Sẵn sàng phát xuất") xong = món đã có thể chia suất.
  const readyDishes = dishes.filter((d) =>
    d.steps.some((s) => s.stepOrder === 4 && s.effectiveStatus === 'done'),
  );
  const doneDistributions = distributions.filter((d) => d.completedAt);

  async function handleCheckIn() {
    try {
      await advance.mutateAsync({ assignmentId: assignment.id });
      toast.success('Điểm danh thành công.');
      onCheckedIn();
    } catch (e) {
      toast.error(errMsg(e, 'Điểm danh thất bại — thử lại'));
    }
  }

  let step = 0;
  const nextStep = () => (step += 1);

  const totalTasks = 1 + distributions.length;
  const doneTasks = (checkedIn ? 1 : 0) + doneDistributions.length;

  return (
    <div className="space-y-4">
      {/* Tiến độ */}
      <section className="cm-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-neutral-900">
              <span className="material-symbols-outlined text-emerald-600">checklist</span>
              Việc cần làm hôm nay
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">{formatCampaignRange(campaign)}</p>
            {assignment.workDate && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <span className="material-symbols-outlined text-[13px]">event_available</span>
                Ngày trực của bạn: {formatVnDate(assignment.workDate)}
              </p>
            )}
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-extrabold text-emerald-700">
            {doneTasks}/{totalTasks} việc
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${totalTasks ? (doneTasks / totalTasks) * 100 : 0}%` }}
          />
        </div>
      </section>

      {/* 1. Điểm danh */}
      <TaskItem
        index={nextStep()}
        icon="how_to_reg"
        title="Điểm danh tại bếp"
        time={assignment.shift ? `${assignment.shift.startTime}–${assignment.shift.endTime}` : null}
        done={checkedIn}
        description={
          checkedIn
            ? assignment.checkInTime
              ? `Đã điểm danh lúc ${new Date(assignment.checkInTime).toLocaleString('vi-VN')}`
              : 'Đã điểm danh'
            : 'Có mặt tại bếp và bấm điểm danh để bắt đầu ca. Trễ vẫn điểm danh được nhưng bị trừ điểm uy tín.'
        }
        badge={
          lateMinutes > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
              <span className="material-symbols-outlined text-[12px]">running_with_errors</span>
              Trễ{' '}
              {lateMinutes >= 60
                ? `${Math.floor(lateMinutes / 60)}h${lateMinutes % 60 ? ` ${lateMinutes % 60}p` : ''}`
                : `${lateMinutes} phút`}
            </span>
          ) : null
        }
        action={
          !checkedIn && campaignRunning ? (
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={advance.isPending}
              className="rounded-xl bg-[#236c2a] px-4 py-2 text-xs font-bold text-white hover:bg-[#1a4f1f] disabled:opacity-50"
            >
              {advance.isPending ? 'Đang gửi…' : 'Điểm danh ngay'}
            </button>
          ) : !campaignRunning && !checkedIn ? (
            <span className="text-[11px] font-semibold text-neutral-400">
              Chờ tổ chức bắt đầu chiến dịch
            </span>
          ) : null
        }
      />

      {/* 2. Ca trực */}
      {assignment.shift && (
        <TaskItem
          index={nextStep()}
          icon="schedule"
          title={assignment.shift.label}
          time={`${assignment.shift.startTime}–${assignment.shift.endTime}`}
          done={checkedIn}
          locked={!checkedIn}
          lockedHint="Điểm danh tại bếp trước đã"
          description="Ca trực tổ chức phân cho bạn. Có mặt đúng giờ để kịp chia suất khi bếp ra món."
        />
      )}

      {/* 3. Món sẵn sàng phát */}
      <TaskItem
        index={nextStep()}
        icon="room_service"
        title="Món sẵn sàng chia suất"
        done={dishes.length > 0 && readyDishes.length === dishes.length}
        locked={!checkedIn}
        lockedHint="Điểm danh tại bếp trước đã"
        description={
          dishes.length === 0
            ? 'Chiến dịch chưa có món nào trong thực đơn.'
            : `${readyDishes.length}/${dishes.length} món đã qua khâu "Sẵn sàng phát xuất" của bếp.`
        }
      >
        {dishes.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {dishes.map((d) => {
              const last = d.steps.find((s) => s.stepOrder === 4);
              const ready = last?.effectiveStatus === 'done';
              // Khâu đang chạy = khâu chưa xong đầu tiên; cho phục vụ biết còn chờ gì.
              const current = d.steps.find((s) => s.effectiveStatus !== 'done');
              return (
                <li
                  key={d.id}
                  className={`flex items-center gap-2 rounded-xl border p-2 text-xs ${
                    ready ? 'border-emerald-200 bg-emerald-50/60' : 'border-neutral-200 bg-white'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      ready ? 'text-emerald-600' : 'text-neutral-300'
                    }`}
                  >
                    {ready ? 'check_circle' : 'hourglass_top'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-neutral-800">{d.name}</span>
                    <span className="block text-neutral-500">
                      {ready
                        ? `Sẵn sàng phát${last?.completedAt ? ` lúc ${new Date(last.completedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                        : `Bếp đang ở khâu "${current?.stepName ?? '—'}"${current?.scheduledTime ? ` · dự kiến ${current.scheduledTime}` : ''}`}
                    </span>
                  </span>
                  {d.plannedServings != null && d.plannedServings > 0 && (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">
                      {d.plannedServings} suất
                    </span>
                  )}
                  {ready && last?.proofUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={mediaUrl(last.proofUrl)}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-lg object-cover"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </TaskItem>

      {/* 4. Đợt phát được phân công */}
      {distributions.length === 0 ? (
        <section className="cm-card flex items-center gap-3 p-5">
          <span className="material-symbols-outlined text-[22px] text-neutral-300">takeout_dining</span>
          <div>
            <p className="text-sm font-bold text-neutral-700">Chưa có đợt phát nào được giao</p>
            <p className="text-xs text-neutral-500">
              Khi tổ chức lên đợt phát và chọn bạn, việc sẽ hiện ở đây kèm số suất cần phát.
            </p>
          </div>
        </section>
      ) : (
        distributions.map((d) => (
          <TaskItem
            key={d.id}
            index={nextStep()}
            icon="takeout_dining"
            title={`Phát suất ăn: ${d.roundLabel || 'Đợt phát'}`}
            time={`${d.servingsServed} suất · ${d.peopleServed} người nhận`}
            done={!!d.completedAt}
            locked={!checkedIn && !d.completedAt}
            lockedHint="Điểm danh tại bếp trước đã"
            description={
              d.completedAt
                ? `Đã phát ${d.actualServings ?? d.servingsServed}/${d.servingsServed} suất cho `
                  + `${d.actualPeopleServed ?? d.peopleServed} người · chốt lúc `
                  + new Date(d.completedAt).toLocaleString('vi-VN')
                : d.note || 'Chia suất và phát cho người tới nhận, xong thì nhập số liệu thực tế.'
            }
            action={
              !d.completedAt ? (
                <button
                  type="button"
                  onClick={() => setClosing(d)}
                  disabled={!checkedIn}
                  title={checkedIn ? undefined : 'Cần điểm danh tại bếp trước'}
                  className="rounded-xl bg-[#236c2a] px-4 py-2 text-xs font-bold text-white hover:bg-[#1a4f1f] disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
                >
                  Phát xong — nhập số liệu
                </button>
              ) : null
            }
          >
            {d.points.length > 0 && (
              <ol className="mt-2 space-y-1.5">
                {d.points.map((pt, idx) => (
                  <li key={`${d.id}-${idx}`} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                      {idx + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="font-bold text-neutral-800">{pt.label}</span>
                      <br />
                      <span className="text-neutral-500">{pt.address}</span>
                      {pt.lng != null && pt.lat != null && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${pt.lat},${pt.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex items-center gap-0.5 font-bold text-emerald-700 hover:underline"
                        >
                          <span className="material-symbols-outlined text-[13px]">directions</span>
                          Chỉ đường
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </TaskItem>
        ))
      )}

      {closing && (
        <CompleteDistributionModal
          distributionId={closing.id}
          campaignId={campaign.id}
          roundLabel={closing.roundLabel}
          plannedServings={closing.servingsServed}
          plannedPeople={closing.peopleServed}
          points={closing.points}
          onClose={() => setClosing(null)}
          onDone={onCheckedIn}
        />
      )}
    </div>
  );
}

function TaskItem({
  index,
  icon,
  title,
  time,
  description,
  done,
  locked,
  lockedHint,
  badge,
  action,
  children,
}: {
  index: number;
  icon: string;
  title: string;
  time?: string | null;
  description?: string;
  done?: boolean;
  locked?: boolean;
  lockedHint?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className={`cm-card p-4 ${done ? 'opacity-80' : ''} ${locked ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            done ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">
            {done ? 'check' : locked ? 'lock' : icon}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              Việc {index}
            </span>
            {time && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                {time}
              </span>
            )}
            {done && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                Xong
              </span>
            )}
            {badge}
            {locked && !done && lockedHint && (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500">
                <span className="material-symbols-outlined text-[12px]">lock</span>
                {lockedHint}
              </span>
            )}
          </div>
          <p className="mt-0.5 font-bold text-neutral-900">{title}</p>
          {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
          {children}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}
