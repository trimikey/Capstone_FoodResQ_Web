'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useSentRequests,
  useConfirmCampaignTransportReceipt,
  useConfirmDonation,
  useAssignRequestPickup,
  type SentRequestItem,
  type CampaignManageParticipant,
} from '@/hooks/useCampaigns';
import { useManageContext } from '../../../_components/ManageShell';
import { formatVnDate } from '@/lib/vn-date';
import { errMsg } from '@/lib/utils';

const TRANSPORT_LABEL: Record<string, string> = {
  pending: 'Chờ shipper chiến dịch đi nhận',
  assigned: 'Shipper đã nhận chuyến',
  heading_to_provider: 'Shipper đang đến NCC',
  picked_up: 'Đã lấy thực phẩm',
  in_transit: 'Đang giao đến bếp',
  delivered: 'Hàng đã về bếp — chờ bếp xác nhận',
  received: 'Bếp đã xác nhận nhận hàng',
  failed: 'Giao hàng thất bại',
  cancelled: 'Đã chuyển sang shipper chiến dịch đi nhận',
};

const toMin = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

/** Ca có phủ trọn khung giờ lấy hàng không (ca tối có thể vắt qua 00:00). */
function shiftCovers(
  shift: { startTime: string; endTime: string; endDayOffset?: number },
  start: string,
  end: string,
): boolean {
  const shiftStart = toMin(shift.startTime);
  const shiftEnd = toMin(shift.endTime) + (shift.endDayOffset ?? 0) * 1440;
  const pickupStart = toMin(start);
  let pickupEnd = toMin(end);
  if (pickupEnd <= pickupStart) pickupEnd += 1440;
  return pickupStart >= shiftStart && pickupEnd <= shiftEnd;
}

/** Vai trò VẬN HÀNH — phục vụ và giao hàng dùng chung, chỉ đầu bếp là riêng. */
const OPS_ROLES: string[] = ['shipper', 'waiter'];

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ NCC duyệt',
  accepted: 'NCC đã đồng ý',
  rejected: 'NCC từ chối',
  expired: 'Hết hạn',
};

/**
 * Tab "Giao & nhận hàng" — một chỗ cho tổ chức theo dõi TOÀN BỘ thực phẩm về bếp
 * của chiến dịch này: ai giao (shipper nào), tình trạng chuyến, và xác nhận
 * SỐ LƯỢNG THỰC NHẬN. Xác nhận xong hệ thống tự báo cho NCC là hàng đã giao
 * thành công (notify sẵn ở BE confirmTransportReceipt / confirmDonation).
 */
export default function LogisticsPage() {
  const { campaign: c } = useManageContext();
  const { data: sentRequests, isLoading } = useSentRequests();

  // Chỉ đơn của CHIẾN DỊCH đang mở, và chỉ đơn NCC đã đồng ý (pending/rejected
  // đã có tab Nhà cung cấp lo).
  const requests = (sentRequests ?? []).filter(
    (r) => r.campaign?.id === c.id && r.status === 'accepted',
  );
  // Khoản sinh ra từ đơn nguyên liệu là CÙNG MỘT LÔ với đơn đó — đã hiện đầy đủ ở thẻ
  // trên (trạng thái chuyến + ô xác nhận số kg thực nhận). Liệt kê lại ở đây thì tổ chức
  // thấy một lô thành hai thẻ, tưởng phải nhập số kg hai lần.
  const allDonations = c.donations ?? [];
  const donations = allDonations.filter((d) => !d.providerRequestId);
  const mergedCount = allDonations.length - donations.length;

  // Tra tên shipper được cử đi nhận quyên góp từ danh sách phân công ca.
  const assigneeName = (assignmentId: string) =>
    c.participants?.find((p) => p.id === assignmentId)?.fullName ?? null;

  return (
    <div className="space-y-4">
      {/* ── Đơn nguyên liệu từ NCC (có vận chuyển) ── */}
      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title !mb-1">
          <span className="material-symbols-outlined">local_shipping</span>
          Đơn nguyên liệu từ NCC ({requests.length})
        </h2>
        <p className="cm-manage-card-sub !mt-0 mb-3">
          Theo dõi ai giao, tình trạng chuyến và xác nhận số lượng thực nhận — NCC được
          báo ngay khi bếp xác nhận.
        </p>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-neutral-100" />
        ) : requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-5 text-center text-xs text-neutral-500">
            Chưa có đơn nguyên liệu nào được NCC chấp nhận cho chiến dịch này.
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <TransportRow
                key={r.id}
                request={r}
                campaignId={c.id}
                participants={(c.participants ?? []) as CampaignManageParticipant[]}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Nguyên liệu quyên góp (shipper của chiến dịch đi nhận) ── */}
      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title !mb-1">
          <span className="material-symbols-outlined">volunteer_activism</span>
          Nguyên liệu quyên góp ({donations.length})
        </h2>
        <p className="cm-manage-card-sub !mt-0 mb-3">
          NCC <b>tự nguyện góp thẳng</b>, không qua đơn đặt — tổ chức cử shipper có ca
          trùng giờ đi nhận, rồi xác nhận số lượng thực nhận tại đây.
          {mergedCount > 0 && (
            <>
              {' '}
              ({mergedCount} khoản khác đi kèm đơn nguyên liệu ở trên, xác nhận ngay trên
              đơn đó.)
            </>
          )}
        </p>

        {donations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-5 text-center text-xs text-neutral-500">
            {mergedCount > 0
              ? 'Mọi nguyên liệu của chiến dịch này đều đi kèm đơn đặt ở trên — không có khoản góp thẳng nào.'
              : 'Chưa có khoản quyên góp nào cho chiến dịch này.'}
          </p>
        ) : (
          <div className="space-y-3">
            {donations.map((d) => (
              <DonationRow
                key={d.id}
                donation={d}
                assigneeNames={(d.pickupAssigneeIds ?? [])
                  .map(assigneeName)
                  .filter((n): n is string => !!n)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Đơn NCC + chuyến vận chuyển ──────────────────────────────────────────────

function TransportRow({
  request: r,
  campaignId,
  participants,
}: {
  request: SentRequestItem;
  campaignId: string;
  participants: CampaignManageParticipant[];
}) {
  const confirmReceipt = useConfirmCampaignTransportReceipt();
  const assignPickup = useAssignRequestPickup();
  const [receivedKg, setReceivedKg] = useState('');
  const [note, setNote] = useState('');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>(
    Object.fromEntries((r.pickupAssigneeIds ?? []).map((id) => [id, true])),
  );
  // Đã phân công rồi → KHÓA khối chọn shipper, chỉ mở lại khi bấm "Đổi phân công"
  // (tránh bấm phân công lặp nhiều lần cho cùng một đơn).
  const [editing, setEditing] = useState(false);
  const hasAssigned = (r.pickupAssigneeIds ?? []).length > 0;

  const demand = r.demandDetails;
  const transport = r.transport;
  const shipperName = transport?.delivery?.shipper?.user.fullName ?? null;
  const shipperPhone = transport?.delivery?.shipper?.user.phone ?? null;

  // Shipper CHIẾN DỊCH đủ điều kiện đi nhận: đúng vai trò, đã duyệt vào ca,
  // trực đúng ngày hẹn và ca phủ trọn khung giờ lấy trên đơn.
  const pickupDateKey = r.scheduledDate?.slice(0, 10) ?? null;
  const startStr = r.pickupStartTime?.slice(0, 5) ?? null;
  const endStr = r.pickupEndTime?.slice(0, 5) ?? null;
  const eligible =
    pickupDateKey && startStr && endStr
      ? participants.filter(
          (p) =>
            // Phục vụ và giao hàng đã gộp làm một vai trò vận hành: người trực ca sáng
            // đi lấy nguyên liệu, ca chiều chia suất rồi đi phát. Lọc riêng 'shipper'
            // sinh ra cảnh có người trực đúng khung mà vẫn báo "không có shipper nào".
            OPS_ROLES.includes(p.role) &&
            ['assigned', 'checked_in', 'in_progress'].includes(p.status) &&
            p.shift &&
            p.workDate?.slice(0, 10) === pickupDateKey &&
            shiftCovers(p.shift, startStr, endStr),
        )
      : [];
  const pickedIds = eligible.filter((p) => selectedIds[p.id]).map((p) => p.id);
  const assignedNames = (r.pickupAssigneeIds ?? [])
    .map((id) => participants.find((p) => p.id === id)?.fullName)
    .filter((n): n is string => !!n);
  // Không phân công chồng lên chuyến hệ thống đang chạy thật (đã có người nhận).
  const poolBusy =
    !!transport &&
    ['assigned', 'heading_to_provider', 'picked_up', 'in_transit', 'delivered', 'received'].includes(transport.status);

  async function submitAssign() {
    if (pickedIds.length === 0 || assignPickup.isPending) return;
    try {
      await assignPickup.mutateAsync({ requestId: r.id, assignmentIds: pickedIds });
      toast.success(`Đã phân công ${pickedIds.length} shipper đi nhận đơn này.`);
      setEditing(false); // khóa lại sau khi lưu
    } catch (e) {
      toast.error(errMsg(e, 'Phân công thất bại'));
    }
  }

  const tone = !transport
    ? 'border-neutral-200'
    : transport.status === 'failed'
      ? 'border-rose-200'
      : transport.status === 'received'
        ? 'border-emerald-200'
        : 'border-sky-200';

  async function submitReceipt() {
    if (!transport) return;
    const kg = Number(receivedKg);
    if (!receivedKg || !Number.isFinite(kg) || kg < 0) {
      toast.error('Vui lòng nhập số kg thực nhận.');
      return;
    }
    try {
      await confirmReceipt.mutateAsync({
        campaignId,
        transportId: transport.id,
        // BE lưu vào receipt_note + notify NCC — số thực nhận đi cùng biên nhận.
        note: `Thực nhận: ${kg} kg${note.trim() ? ` — ${note.trim()}` : ''}`,
      });
      toast.success('Đã xác nhận nhận hàng — NCC được thông báo giao thành công.');
      setReceivedKg('');
      setNote('');
    } catch (e) {
      toast.error(errMsg(e, 'Không thể xác nhận nhận hàng'));
    }
  }

  return (
    <div className={`rounded-xl border ${tone} bg-white p-3.5 space-y-2.5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-neutral-900">{r.provider.businessName ?? r.provider.user.fullName}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {demand?.ingredientName ? `${demand.ingredientName} · ` : ''}
            {demand?.quantityKg != null ? `${demand.quantityKg} kg đặt · ` : ''}
            {r.scheduledDate ? `${formatVnDate(r.scheduledDate)} · ` : ''}
            {r.pickupStartTime ? `${r.pickupStartTime}${r.pickupEndTime ? `–${r.pickupEndTime}` : ''}` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-bold text-neutral-600">
          {REQUEST_STATUS_LABEL[r.status] ?? r.status}
        </span>
      </div>

      {transport ? (
        <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700 space-y-1">
          <p className="flex items-center gap-1.5 font-bold">
            <span className="material-symbols-outlined text-[15px]">local_shipping</span>
            {/* Đơn cũ còn delivery pool thì 'pending' nghĩa là đang tìm hệ thống */}
            {transport.status === 'pending' && transport.deliveryId
              ? 'Đang tìm shipper hệ thống'
              : TRANSPORT_LABEL[transport.status] ?? transport.status}
          </p>
          {shipperName ? (
            <p>
              Người giao: <b>{shipperName}</b>
              {shipperPhone && (
                <>
                  {' · '}
                  <a href={`tel:${shipperPhone}`} className="font-bold text-emerald-700 hover:underline">
                    {shipperPhone}
                  </a>
                </>
              )}
            </p>
          ) : transport.status === 'pending' ? (
            <p className="text-neutral-500">
              {transport.deliveryId
                ? 'Hệ thống đang mời tuần tự shipper gần NCC nhất.'
                : 'Phân công shipper chiến dịch bên dưới — shipper lấy hàng xong sẽ chụp ảnh xác nhận số kg trong màn nhiệm vụ.'}
            </p>
          ) : null}
          {transport.failureReason && (
            <p className="text-rose-600">Lý do thất bại: {transport.failureReason}</p>
          )}
          {transport.receiptNote && (
            <p className="text-emerald-700">
              Biên nhận: {transport.receiptNote}
              {transport.receivedAt ? ` · ${new Date(transport.receivedAt).toLocaleString('vi-VN')}` : ''}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          Đơn này không dùng vòng tìm shipper hệ thống — phân công shipper chiến dịch bên dưới.
        </p>
      )}

      {/* Phân công shipper CHIẾN DỊCH đi nhận — chỉ ẩn khi chuyến hệ thống đang
          có người chạy thật (tránh 2 luồng cùng đi lấy một đơn). */}
      {!poolBusy && hasAssigned && !editing ? (
        // ĐÃ PHÂN CÔNG → khóa lại, chỉ hiển thị kết quả; muốn sửa phải bấm rõ ràng.
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">
            <span className="material-symbols-outlined text-[15px]">task_alt</span>
            Đã phân công shipper chiến dịch đi nhận
          </p>
          <p className="text-xs text-neutral-700">
            Người đi nhận:{' '}
            <b>
              {assignedNames.length > 0
                ? assignedNames.join(', ')
                : `${(r.pickupAssigneeIds ?? []).length} shipper`}
            </b>
          </p>
          <button
            type="button"
            onClick={() => {
              // Mở lại form với đúng danh sách hiện tại để chỉnh
              setSelectedIds(Object.fromEntries((r.pickupAssigneeIds ?? []).map((id) => [id, true])));
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-bold text-neutral-600 hover:bg-neutral-50"
          >
            <span className="material-symbols-outlined text-[14px]">edit</span>
            Đổi phân công
          </button>
        </div>
      ) : !poolBusy ? (
        <div className="rounded-lg border border-honey-200 bg-honey-50/60 p-3 space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-honey-800">
            <span className="material-symbols-outlined text-[15px]">assignment_ind</span>
            {hasAssigned ? 'Đổi phân công shipper đi nhận' : 'Phân công shipper chiến dịch đi nhận'}
          </p>
          {!pickupDateKey || !startStr || !endStr ? (
            <p className="text-xs text-neutral-500">Đơn chưa có lịch hẹn lấy hàng để đối chiếu ca trực.</p>
          ) : eligible.length === 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
              Không có shipper nào có ca Giao hàng phủ khung {startStr}-{endStr} ngày{' '}
              {formatVnDate(pickupDateKey)}. Duyệt thêm shipper vào ca đó trước.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-neutral-500">
                Chỉ hiện shipper có ca phủ trọn {startStr}-{endStr} ngày {formatVnDate(pickupDateKey)} —
                tick nhiều người nếu hàng nặng.
              </p>
              {eligible.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md border bg-white px-2.5 py-2 ${
                    selectedIds[p.id] ? 'border-emerald-600' : 'border-neutral-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedIds[p.id]}
                    onChange={() => setSelectedIds((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                    className="h-4 w-4 accent-emerald-700"
                  />
                  <span className="min-w-0 flex-1 text-xs">
                    <span className="block font-bold text-neutral-900">{p.fullName}</span>
                    <span className="block text-neutral-500">
                      {p.shift?.label} · {p.shift?.startTime}-{p.shift?.endTime}
                    </span>
                  </span>
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={submitAssign}
                  disabled={pickedIds.length === 0 || assignPickup.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">assignment_ind</span>
                  {assignPickup.isPending
                    ? 'Đang phân công…'
                    : pickedIds.length > 0
                      ? hasAssigned
                        ? `Lưu thay đổi (${pickedIds.length} shipper)`
                        : `Phân công ${pickedIds.length} shipper`
                      : 'Chọn shipper để phân công'}
                </button>
                {hasAssigned && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={assignPickup.isPending}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Hủy
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Xác nhận thực nhận — chỉ khi shipper đã bàn giao */}
      {transport?.status === 'delivered' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            step="0.1"
            value={receivedKg}
            onChange={(e) => setReceivedKg(e.target.value)}
            placeholder="Số kg thực nhận"
            className="w-36 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú (vd: thiếu 2 kg, hàng tươi tốt…)"
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={submitReceipt}
            disabled={confirmReceipt.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">inventory</span>
            {confirmReceipt.isPending ? 'Đang xác nhận…' : 'Xác nhận đã nhận'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Khoản quyên góp ──────────────────────────────────────────────────────────

type DonationItem = NonNullable<ReturnType<typeof useManageContext>['campaign']['donations']>[number];

function DonationRow({ donation: d, assigneeNames }: { donation: DonationItem; assigneeNames: string[] }) {
  const confirmDon = useConfirmDonation();
  const [receivedKg, setReceivedKg] = useState('');
  const [note, setNote] = useState('');

  const isPledged = d.status === 'pledged';

  async function submitConfirm() {
    const kgText = receivedKg.trim() ? `Thực nhận: ${receivedKg.trim()} kg` : '';
    const merged = [kgText, note.trim()].filter(Boolean).join(' — ');
    try {
      await confirmDon.mutateAsync({ donationId: d.id, note: merged || undefined });
      toast.success('Đã xác nhận nhận quyên góp — NCC được thông báo.');
      setReceivedKg('');
      setNote('');
    } catch (e) {
      toast.error(errMsg(e, 'Xác nhận thất bại'));
    }
  }

  return (
    <div className={`rounded-xl border ${isPledged ? 'border-amber-200' : 'border-emerald-200'} bg-white p-3.5 space-y-2.5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-neutral-900">
            {d.quantity ? `${d.quantity} ` : ''}
            {d.itemName}
            <span className="font-normal text-neutral-500"> · {d.provider?.businessName ?? 'NCC'}</span>
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {d.pickupDate ? `Hẹn nhận: ${formatVnDate(d.pickupDate)} · ${d.pickupStartTime}-${d.pickupEndTime}` : 'Chưa đặt lịch đi nhận'}
            {d.provider?.address ? ` · ${d.provider.address}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
            isPledged ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {isPledged ? 'Chờ nhận hàng' : 'Đã nhận'}
        </span>
      </div>

      {(d.pickupAssigneeIds ?? []).length > 0 && (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
          <span className="material-symbols-outlined text-[14px] align-text-bottom">assignment_ind</span>{' '}
          Người đi nhận:{' '}
          <b>{assigneeNames.length > 0 ? assigneeNames.join(', ') : `${(d.pickupAssigneeIds ?? []).length} shipper`}</b>
        </p>
      )}

      {d.receivedAt && (
        <p className="text-xs text-emerald-700">
          Đã nhận lúc {new Date(d.receivedAt).toLocaleString('vi-VN')}
          {d.note ? ` · ${d.note}` : ''}
        </p>
      )}

      {isPledged && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            step="0.1"
            value={receivedKg}
            onChange={(e) => setReceivedKg(e.target.value)}
            placeholder="Số kg thực nhận"
            className="w-36 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú (tuỳ chọn)"
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={submitConfirm}
            disabled={confirmDon.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">inventory</span>
            {confirmDon.isPending ? 'Đang xác nhận…' : 'Xác nhận đã nhận'}
          </button>
        </div>
      )}
    </div>
  );
}
