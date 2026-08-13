'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAdvanceTask, type MyTaskDetail, type PickupOrder } from '@/hooks/useCampaigns';
import CompleteDistributionModal from './CompleteDistributionModal';
import { formatCampaignRange } from '@/lib/campaign-schedule';
import { formatVnDate } from '@/lib/vn-date';
import { errMsg } from '@/lib/utils';

/**
 * Màn "Vào nhiệm vụ" của SHIPPER.
 *
 * Đầu bếp có quy trình 4 khâu/món để bám theo; shipper trước đây chỉ có một nút đổi
 * trạng thái chung chung ("Điểm danh tại bếp" → "Bắt đầu làm việc" → "Hoàn thành"),
 * không cho biết phải giao cái gì, mấy giờ, ở đâu.
 *
 * Ở đây liệt kê ĐÚNG việc phải làm, theo thứ tự thời gian:
 *   1. Điểm danh tại bếp
 *   2. Ca trực được phân (vd "Lấy nguyên liệu sáng 04:30–06:00") + tiến độ lấy nguyên liệu
 *   3. Chuyến chở nguyên liệu từ NCC về bếp (nếu có) — kèm khung giờ hẹn lấy
 *   4. Các đợt phát tận điểm tổ chức giao — kèm địa chỉ và nút xác nhận đã phát
 *
 * CHI TIẾT từng đơn nguyên liệu (địa chỉ NCC, quãng đường, số kg, nút chụp ảnh xác nhận)
 * nằm ở Trung tâm giao hàng — shipper nhận ca nhiều chiến dịch thì quản lý đơn ở một
 * chỗ, không phải mở từng màn nhiệm vụ. Ở đây chỉ hiện tiến độ + đường dẫn sang đó.
 */

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  pending_assignment: 'Đang tìm tình nguyện viên',
  assigned: 'Bạn đã nhận chuyến',
  heading_to_provider: 'Đang tới điểm lấy hàng',
  qc_completed: 'Đã lấy hàng (QC xong)',
  in_transit: 'Đang trên đường giao',
  delivered: 'Đã giao tới bếp',
  failed: 'Chuyến thất bại',
  cancelled: 'Đã huỷ',
};

interface Props {
  detail: MyTaskDetail;
  onCheckedIn: () => void;
}

export default function ShipperTaskView({ detail, onCheckedIn }: Props) {
  const { assignment, campaign, delivery } = detail;
  const distributions = detail.distributions ?? [];
  const pickupOrders = detail.pickupOrders ?? [];
  const advance = useAdvanceTask();
  /** Đợt phát đang mở hộp thoại chốt số liệu. */
  const [closing, setClosing] = useState<MyTaskDetail['distributions'] extends (infer U)[] | undefined ? U | null : null>(null);
  /** Danh sách nguyên liệu đăng ký khá dài — mặc định thu gọn, ấn mới mở. */
  const [showSupplies, setShowSupplies] = useState(false);

  const checkedIn = ['checked_in', 'in_progress', 'completed'].includes(assignment.status);
  const lateMinutes = assignment.checkInLateMinutes ?? 0;
  const campaignRunning = campaign.status === 'in_progress';

  const doneDistributions = distributions.filter((d) => d.completedAt);
  // Đơn coi là xong khi có biên nhận, hoặc khi chuyến vận chuyển đã giao về bếp
  // (luồng /deliveries đã chốt bằng ảnh QC — không bắt chốt lại ở đây).
  const isOrderDone = (o: PickupOrder) => !!o.pickup || o.delivery?.status === 'delivered';
  const donePickups = pickupOrders.filter(isOrderDone);

  async function handleCheckIn() {
    try {
      await advance.mutateAsync({ assignmentId: assignment.id });
      toast.success('Điểm danh thành công.');
      onCheckedIn();
    } catch (e) {
      toast.error(errMsg(e, 'Điểm danh thất bại — thử lại'));
    }
  }

  // Đánh số việc chạy tuần tự — trước đây cộng tay (`shift ? 3 : 2` + …) nên thêm
  // một mục là lệch hết số phía sau.
  let step = 0;
  const nextStep = () => (step += 1);

  // Tổng số việc để hiện tiến độ: điểm danh + từng đơn nguyên liệu + chuyến chở + đợt phát.
  const totalTasks = 1 + pickupOrders.length + (delivery ? 1 : 0) + distributions.length;
  const doneTasks =
    (checkedIn ? 1 : 0) +
    donePickups.length +
    (delivery && delivery.status === 'delivered' ? 1 : 0) +
    doneDistributions.length;

  return (
    <div className="space-y-4">
      {/* Tiến độ việc */}
      <section className="cm-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-neutral-900">
              <span className="material-symbols-outlined text-emerald-600">checklist</span>
              Việc cần làm hôm nay
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">{formatCampaignRange(campaign)}</p>
            {/* Chiến dịch nhiều ngày: ca lặp mỗi ngày nên phải nói rõ trực buổi nào,
                điểm danh ngày khác sẽ bị từ chối. */}
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
              Trễ {lateMinutes >= 60 ? `${Math.floor(lateMinutes / 60)}h${lateMinutes % 60 ? ` ${lateMinutes % 60}p` : ''}` : `${lateMinutes} phút`}
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

      {/* 2. Ca trực được phân */}
      {assignment.shift && (
        <TaskItem
          index={nextStep()}
          icon="schedule"
          title={assignment.shift.label}
          time={`${assignment.shift.startTime}–${assignment.shift.endTime}`}
          // Ca chỉ "Xong" khi đã lấy hết nguyên liệu của chiến dịch. Trước đây điểm danh
          // xong là ca hiện "Xong" ngay, trong khi chưa lấy được cân hàng nào.
          done={pickupOrders.length > 0 ? donePickups.length === pickupOrders.length : checkedIn}
          locked={!checkedIn}
          lockedHint="Điểm danh tại bếp trước đã"
          description={
            pickupOrders.length > 0
              ? `Ca trực tổ chức phân cho bạn — còn ${pickupOrders.length - donePickups.length}/${pickupOrders.length} đơn nguyên liệu chưa lấy.`
              : 'Ca trực tổ chức phân cho bạn. Có mặt đúng giờ để không trễ dây chuyền bếp.'
          }
        >
          <div className="mt-2 space-y-2">
            {/* Tiến độ lấy nguyên liệu — chi tiết từng đơn ở Trung tâm giao hàng */}
            {pickupOrders.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-emerald-600">inventory</span>
                  <span className="text-xs font-bold text-neutral-800">
                    Đơn nguyên liệu: {donePickups.length}/{pickupOrders.length} đã lấy
                  </span>
                </div>
                <Link
                  href="/deliveries"
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  Quản lý đơn ở Trung tâm giao hàng
                </Link>
              </div>
            )}

            {/* Nguyên liệu bếp khai lúc tạo chiến dịch — danh sách dài, mặc định thu gọn. */}
            {(campaign.supplyItems ?? []).length > 0 && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/70">
                <button
                  type="button"
                  onClick={() => setShowSupplies((v) => !v)}
                  aria-expanded={showSupplies}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                    Nguyên liệu chiến dịch đăng ký
                    <span className="ml-1.5 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600">
                      {(campaign.supplyItems ?? []).length} mục
                    </span>
                  </span>
                  <span
                    className={`material-symbols-outlined text-[18px] text-neutral-400 transition-transform ${
                      showSupplies ? 'rotate-180' : ''
                    }`}
                  >
                    expand_more
                  </span>
                </button>
                {showSupplies && (
                  <ul className="space-y-1 border-t border-neutral-200 px-3 py-2.5">
                    {(campaign.supplyItems ?? []).map((it, i) => (
                      <li
                        key={`${it.name}-${i}`}
                        className="flex items-baseline justify-between gap-3 text-xs"
                      >
                        <span className="text-neutral-700">{it.name}</span>
                        <span className="shrink-0 font-bold text-neutral-900">
                          {it.quantity != null ? `${it.quantity} ${it.unit || 'kg'}` : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </TaskItem>
      )}

      {/* 3. Chuyến chở nguyên liệu từ NCC về bếp */}
      {delivery && (
        <TaskItem
          index={nextStep()}
          icon="local_shipping"
          title="Chở nguyên liệu từ nhà cung cấp về bếp"
          time={
            delivery.pickupStartTime
              ? `Lấy hàng ${delivery.pickupStartTime}${delivery.pickupEndTime ? `–${delivery.pickupEndTime}` : ''}`
              : null
          }
          done={delivery.status === 'delivered'}
          locked={!checkedIn && delivery.status !== 'delivered'}
          lockedHint="Điểm danh tại bếp trước đã"
          description={DELIVERY_STATUS_LABEL[delivery.status] ?? delivery.status}
          warning={
            delivery.pickupStartTime
              ? 'Đến muộn từ 60 phút trở lên sẽ bị trừ 10 điểm uy tín.'
              : null
          }
          action={
            checkedIn ? (
              <Link
                href="/deliveries"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                Mở màn giao hàng
              </Link>
            ) : null
          }
        />
      )}

      {/* 5. Các đợt phát tận điểm */}
      {distributions.length === 0 ? (
        <section className="cm-card flex items-center gap-3 p-5">
          <span className="material-symbols-outlined text-[22px] text-neutral-300">takeout_dining</span>
          <div>
            <p className="text-sm font-bold text-neutral-700">Chưa có đợt phát nào được giao</p>
            <p className="text-xs text-neutral-500">
              Khi tổ chức lên đợt phát và chọn bạn, việc sẽ hiện ở đây kèm địa chỉ từng điểm.
            </p>
          </div>
        </section>
      ) : (
        distributions.map((d) => (
          <TaskItem
            key={d.id}
            index={nextStep()}
            icon="takeout_dining"
            title={`Đi phát: ${d.roundLabel || 'Đợt phát'}`}
            time={`${d.servingsServed} suất · ${d.peopleServed} người nhận`}
            done={!!d.completedAt}
            description={
              d.completedAt
                ? `Đã phát ${d.actualServings ?? d.servingsServed}/${d.servingsServed} suất cho `
                  + `${d.actualPeopleServed ?? d.peopleServed} người · chốt lúc `
                  + new Date(d.completedAt).toLocaleString('vi-VN')
                : d.note || 'Tới từng điểm bên dưới và phát suất ăn.'
            }
            locked={!checkedIn && !d.completedAt}
            lockedHint="Điểm danh tại bếp trước đã"
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
            {d.points.length > 0 ? (
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
            ) : (
              <p className="mt-2 text-xs italic text-amber-700">
                Chưa có địa chỉ điểm phát — liên hệ tổ chức để nhận.
              </p>
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
  warning,
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
  warning?: string | null;
  done?: boolean;
  /** Chưa tới lượt — việc trước chưa xong (vd chưa điểm danh). */
  locked?: boolean;
  lockedHint?: string;
  /** Nhãn phụ (vd đánh dấu điểm danh trễ). */
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
          {warning && !done && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
              <span className="material-symbols-outlined text-[13px]">warning</span>
              {warning}
            </p>
          )}
          {children}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}
