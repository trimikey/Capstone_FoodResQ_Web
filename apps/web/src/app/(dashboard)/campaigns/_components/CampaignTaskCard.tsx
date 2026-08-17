'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { useCompleteDistribution, type MyTask } from '@/hooks/useCampaigns';
import { formatCampaignRange } from '@/lib/campaign-schedule';
import { formatVnDate } from '@/lib/vn-date';
import { errMsg } from '@/lib/utils';
import { ROLE_META } from './RoleBadge';
import { TASK_NEXT } from './CampaignTaskAction';

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

/**
 * Mốc kết thúc lấy theo NGÀY KẾT THÚC, không phải ngày bắt đầu.
 *
 * Trước đây hàm này ghép `endTime` vào `scheduledDate`, nên chiến dịch kéo dài
 * nhiều ngày bị coi là hết hạn ngay tối hôm đầu và thẻ việc hiện "Quá hạn" suốt
 * những ngày còn lại dù TNV vẫn đang làm.
 */
function taskEndDate(t: MyTask): Date | null {
  const datePart = (t.campaign.endDate ?? t.campaign.scheduledDate)?.slice(0, 10);
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

export default function CampaignTaskCard({ t, group }: { t: MyTask; group?: MyTask[] }) {
  const rm = ROLE_META[t.role];
  const status = TASK_STATUS_META[t.status] ?? { label: t.status, chip: 'cm-chip cm-chip--ink' };
  const next = TASK_NEXT[t.status]?.(t.role) ?? null;
  const distributions = t.distributions ?? [];
  // 1 TNV nhận nhiều ca cùng chiến dịch → BE tạo nhiều assignment. Gộp về 1 thẻ,
  // liệt kê từng ca (mỗi ca có màn nhiệm vụ riêng nên link riêng từng ca).
  const groupMembers = group && group.length > 1 ? group : null;
  const completeDist = useCompleteDistribution();
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
          {formatCampaignRange(t.campaign)}
        </span>
        <span className="inline-flex items-center gap-1 truncate flex-1 min-w-0">
          <span className="material-symbols-outlined text-[14px]">place</span>
          {t.campaign.kitchenAddress}
        </span>
      </div>

      {groupMembers && (
        <div className="mt-2 space-y-1 rounded-xl border border-neutral-100 bg-neutral-50 p-2.5">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-neutral-500">
            {groupMembers.length} ca trong chiến dịch này
          </p>
          {groupMembers.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex min-w-0 items-center gap-1 truncate font-semibold text-neutral-700">
                <span className="material-symbols-outlined text-[13px]">schedule</span>
                {m.workDate ? `${formatVnDate(m.workDate)} · ` : ''}
                {m.shift ? `${m.shift.label} · ${m.shift.startTime}-${m.shift.endTime}` : 'Ca chung'}
              </span>
              {!['pending', 'rejected'].includes(m.status) && (
                <Link href={`/my-tasks/${m.id}`} className="shrink-0 font-bold text-honey-700 hover:underline">
                  Vào nhiệm vụ →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/campaigns/${t.campaign.id}`} className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-3 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100">
          <span className="material-symbols-outlined text-[15px]">visibility</span>
          Xem chi tiết chiến dịch
        </Link>
        {/* MỌI vai trò đều có màn nhiệm vụ riêng: bếp có 4 khâu/món, shipper có
            danh sách chuyến & đợt phát theo giờ. Trước đây shipper không có lối vào
            nên chỉ còn một nút đổi trạng thái chung chung ở cuối thẻ.
            Thẻ gộp nhiều ca: link nhiệm vụ nằm cạnh từng ca ở khối phía trên. */}
        {!groupMembers && !['pending', 'rejected'].includes(t.status) && (
          <Link
            href={`/my-tasks/${t.id}`}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-honey-100 bg-honey-50 px-3 text-[11px] font-bold text-honey-700 transition-colors hover:bg-honey-100"
          >
            <span className="material-symbols-outlined text-[15px]">
              {t.role === 'shipper' ? 'local_shipping' : 'soup_kitchen'}
            </span>
            Vào nhiệm vụ →
          </Link>
        )}
      </div>

      {/* Khoản quyên góp NCC mà tổ chức phân công TNV này đi nhận — khung giờ
          luôn nằm trong ca trực (BE validate), kèm địa chỉ + SĐT để đi luôn. */}
      {(t.donationPickups ?? []).length > 0 && (
        <div className="mt-3 rounded-xl border border-honey-200 bg-honey-50/70 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-honey-800">
            <span className="material-symbols-outlined text-[15px]">volunteer_activism</span>
            Đi nhận quyên góp ({(t.donationPickups ?? []).length})
          </p>
          <ul className="mt-2 space-y-2">
            {(t.donationPickups ?? []).map((d) => (
              <li key={d.id} className="rounded-lg bg-white/80 p-2 text-[11px] text-neutral-600">
                <p className="text-xs font-bold text-neutral-800">
                  {d.quantity ? `${d.quantity} ` : ''}
                  {d.itemName} · từ {d.provider.businessName}
                </p>
                <p className="mt-0.5">
                  <span className="material-symbols-outlined text-[13px] align-text-bottom">schedule</span>{' '}
                  {d.pickupDate ? `${formatVnDate(d.pickupDate)} · ` : ''}
                  {d.pickupStartTime}-{d.pickupEndTime}
                </p>
                {d.provider.address && (
                  <p className="mt-0.5">
                    <span className="material-symbols-outlined text-[13px] align-text-bottom">place</span>{' '}
                    {d.provider.address}
                  </p>
                )}
                {d.provider.contactPhone && (
                  <a href={`tel:${d.provider.contactPhone}`} className="mt-0.5 inline-block font-bold text-emerald-700 hover:underline">
                    <span className="material-symbols-outlined text-[13px] align-text-bottom">call</span>{' '}
                    {d.provider.contactPhone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Đơn nguyên liệu NCC mà tổ chức cử shipper này đi nhận — thay cho vòng
          tìm shipper hệ thống; khung giờ luôn nằm trong ca trực. */}
      {(t.requestPickups ?? []).length > 0 && (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-sky-800">
            <span className="material-symbols-outlined text-[15px]">package_2</span>
            Đi nhận nguyên liệu NCC ({(t.requestPickups ?? []).length})
          </p>
          <ul className="mt-2 space-y-2">
            {(t.requestPickups ?? []).map((p) => (
              <li key={p.id} className="rounded-lg bg-white/80 p-2 text-[11px] text-neutral-600">
                <p className="text-xs font-bold text-neutral-800">
                  {p.ingredientName ?? 'Nguyên liệu'}
                  {p.quantityKg != null ? ` · ${p.quantityKg} kg` : ''}
                  {' · từ '}
                  {p.provider.businessName}
                </p>
                <p className="mt-0.5">
                  <span className="material-symbols-outlined text-[13px] align-text-bottom">schedule</span>{' '}
                  {p.pickupDate ? `${formatVnDate(p.pickupDate)} · ` : ''}
                  {p.pickupStartTime}-{p.pickupEndTime}
                </p>
                {p.provider.address && (
                  <p className="mt-0.5">
                    <span className="material-symbols-outlined text-[13px] align-text-bottom">place</span>{' '}
                    {p.provider.address}
                  </p>
                )}
                {p.provider.contactPhone && (
                  <a href={`tel:${p.provider.contactPhone}`} className="mt-0.5 inline-block font-bold text-emerald-700 hover:underline">
                    <span className="material-symbols-outlined text-[13px] align-text-bottom">call</span>{' '}
                    {p.provider.contactPhone}
                  </a>
                )}
              </li>
            ))}
          </ul>
          {/* Đồng bộ với luồng đi phát: shipper tự xác nhận hoàn thành — nút chụp
              ảnh + số kg thực nhận nằm trong màn nhiệm vụ ("Vào nhiệm vụ"). */}
          <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-sky-700">
            <span className="material-symbols-outlined text-[13px]">photo_camera</span>
            Lấy hàng xong, bấm &quot;Vào nhiệm vụ&quot; để chụp ảnh xác nhận số kg thực nhận — bếp
            sẽ chốt và báo NCC.
          </p>
        </div>
      )}

      {/* Đợt phát tổ chức giao cho shipper này — kèm địa chỉ để đi luôn.
          Đây là nơi shipper quản lý việc phát tận điểm; /deliveries chỉ quản lý các
          đơn `deliveries` (chở hàng), không có dữ liệu của đợt phát. */}
      {distributions.length > 0 && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">
            <span className="material-symbols-outlined text-[15px]">takeout_dining</span>
            Bạn được giao {distributions.length} đợt phát
          </p>
          <ul className="mt-2 space-y-2">
            {distributions.map((d) => (
              <li key={d.id} className="rounded-lg bg-white/80 p-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-neutral-800">
                    {d.roundLabel || 'Đợt phát'} · {d.servingsServed} suất
                  </p>
                  {d.completedAt && (
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      Đã phát xong
                    </span>
                  )}
                </div>
                {d.points.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {d.points.map((pt, i) => (
                      <li key={`${d.id}-p-${i}`} className="flex items-start gap-1 text-[11px] text-neutral-600">
                        <span className="material-symbols-outlined text-[13px] text-emerald-600">place</span>
                        <span className="min-w-0">
                          <span className="font-semibold">{pt.label}</span>
                          <br />
                          <span className="text-neutral-500">{pt.address}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] italic text-amber-700">
                    Chưa có địa chỉ điểm phát — liên hệ tổ chức để nhận.
                  </p>
                )}
                {d.note && <p className="mt-1 text-[11px] text-neutral-500">Ghi chú: {d.note}</p>}
                {!d.completedAt && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await completeDist.mutateAsync({
                          distributionId: d.id,
                          campaignId: t.campaign.id,
                        });
                        toast.success('Đã xác nhận phát xong đợt này.');
                      } catch (err) {
                        toast.error(errMsg(err, 'Xác nhận thất bại'));
                      }
                    }}
                    disabled={completeDist.isPending}
                    className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[11px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[15px]">task_alt</span>
                    {completeDist.isPending ? 'Đang lưu…' : 'Xác nhận đã phát xong'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-emerald-700">
            Số suất chỉ được tính vào thống kê chiến dịch sau khi bạn xác nhận.
          </p>
        </div>
      )}

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
      ) : next ? (
        /* Nút đổi trạng thái rời rạc ("Điểm danh tại bếp" / "Bắt đầu làm việc") đã
           chuyển vào màn nhiệm vụ, nơi nó đứng cạnh việc cụ thể nên mới có nghĩa.
           Ở thẻ tóm tắt chỉ nhắc còn việc đang chờ. */
        <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-honey-700">
          <span className="material-symbols-outlined text-[14px]">pending_actions</span>
          Còn việc cần xử lý — bấm “Vào nhiệm vụ”
        </p>
      ) : null}
    </div>
  );
}
