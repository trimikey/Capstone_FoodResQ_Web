'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useAssignDonationPickup,
  useConfirmDonation,
  type Campaign,
  type CampaignDonationItem,
} from '@/hooks/useCampaigns';
import { formatVnDate } from '@/lib/vn-date';
import { errMsg } from '@/lib/utils';

const DONATION_STATUS_META: Record<string, { label: string; cls: string }> = {
  pledged: { label: 'Đã hứa góp — chờ nhận hàng', cls: 'bg-amber-100 text-amber-800' },
  received: { label: 'Đã nhận hàng', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-neutral-200 text-neutral-600' },
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

/**
 * Chi tiết 1 khoản NCC hứa góp + phân công TNV đi nhận.
 *
 * Danh sách TNV chỉ gồm người có CA TRỰC phủ trọn khung giờ lấy hàng đúng ngày —
 * cùng luật với BE (assignDonationPickup) để không phân công lệch lịch.
 */
export default function DonationDetailModal({
  campaign,
  donation,
  onClose,
}: {
  campaign: Campaign;
  donation: CampaignDonationItem;
  onClose: () => void;
}) {
  const assign = useAssignDonationPickup();
  const confirmDon = useConfirmDonation();
  const st = DONATION_STATUS_META[donation.status] ?? { label: donation.status, cls: 'bg-neutral-200 text-neutral-600' };

  const [pickupDate, setPickupDate] = useState(
    (donation.pickupDate ?? campaign.scheduledDate ?? '').slice(0, 10),
  );
  const [startTime, setStartTime] = useState(donation.pickupStartTime ?? '');
  const [endTime, setEndTime] = useState(donation.pickupEndTime ?? '');
  // Chọn được NHIỀU shipper — hàng nặng cần vài người đi cùng.
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>(
    Object.fromEntries((donation.pickupAssigneeIds ?? []).map((id) => [id, true])),
  );
  // Đã phân công → KHÓA form, chỉ mở lại khi bấm "Đổi phân công"
  // (tránh bấm phân công lặp nhiều lần cho cùng khoản góp).
  const hasAssigned = (donation.pickupAssigneeIds ?? []).length > 0;
  const [editing, setEditing] = useState(false);
  const formOpen = donation.status === 'pledged' && (!hasAssigned || editing);

  // Chỉ SHIPPER đã duyệt vào ca, trực đúng ngày, ca phủ trọn khung giờ — đi nhận
  // hàng là việc của vai trò Giao hàng, chef/phục vụ phải ở bếp.
  const eligible = useMemo(() => {
    if (!pickupDate || !startTime || !endTime) return [];
    return (campaign.assignments ?? []).filter((a) => {
      if (a.role !== 'shipper') return false;
      if (!a.shift || !a.workDate) return false;
      if (a.workDate.slice(0, 10) !== pickupDate) return false;
      return shiftCovers(a.shift, startTime, endTime);
    });
  }, [campaign.assignments, pickupDate, startTime, endTime]);

  const pickedIds = eligible.filter((a) => selectedIds[a.id]).map((a) => a.id);

  // Tra tên các shipper đã được phân công từ danh sách assignment của chiến dịch.
  const assignedNames = (donation.pickupAssigneeIds ?? [])
    .map((id) => (campaign.assignments ?? []).find((a) => a.id === id)?.volunteer.user.fullName)
    .filter((name): name is string => !!name);

  async function submitAssign() {
    if (pickedIds.length === 0 || assign.isPending) return;
    try {
      await assign.mutateAsync({
        donationId: donation.id,
        assignmentIds: pickedIds,
        pickupDate,
        pickupStartTime: startTime,
        pickupEndTime: endTime,
      });
      toast.success(`Đã phân công ${pickedIds.length} shipper đi nhận quyên góp.`);
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Phân công thất bại'));
    }
  }

  async function submitConfirmReceived() {
    try {
      await confirmDon.mutateAsync(donation.id);
      toast.success('Đã xác nhận nhận hàng.');
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Xác nhận thất bại'));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-white text-[18px]">close</span>
          </button>
          <div className="flex items-center gap-3 pr-8">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-[18px]">volunteer_activism</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-white text-base">Chi tiết quyên góp</h3>
              <p className="mt-0.5 text-xs text-emerald-50 truncate">
                {donation.provider.businessName} → {campaign.title}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="px-5 py-4 space-y-4">
            {/* Thông tin khoản góp */}
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-extrabold text-neutral-900">
                  {donation.quantity ? `${donation.quantity} ` : ''}
                  {donation.itemName}
                </p>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>
                  {st.label}
                </span>
              </div>
              <InfoRow icon="storefront" label="Nhà cung cấp" value={donation.provider.businessName} />
              {donation.provider.address && (
                <InfoRow icon="place" label="Địa chỉ lấy hàng" value={donation.provider.address} />
              )}
              {donation.provider.contactPhone && (
                <InfoRow
                  icon="call"
                  label="Liên hệ"
                  value={
                    <a href={`tel:${donation.provider.contactPhone}`} className="font-bold text-emerald-700 hover:underline">
                      {donation.provider.contactPhone}
                    </a>
                  }
                />
              )}
              {donation.createdAt && (
                <InfoRow icon="schedule" label="Hứa góp lúc" value={new Date(donation.createdAt).toLocaleString('vi-VN')} />
              )}
              {donation.receivedAt && (
                <InfoRow icon="inventory" label="Đã nhận lúc" value={new Date(donation.receivedAt).toLocaleString('vi-VN')} />
              )}
              {donation.note && <InfoRow icon="sticky_note_2" label="Ghi chú" value={donation.note} />}
            </div>

            {/* Shipper đang được phân công */}
            {(donation.pickupAssigneeIds ?? []).length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">
                  <span className="material-symbols-outlined text-[15px]">assignment_ind</span>
                  Đã phân công {(donation.pickupAssigneeIds ?? []).length} shipper đi nhận
                </p>
                <p className="mt-1.5 font-bold text-neutral-900">
                  {assignedNames.length > 0 ? assignedNames.join(', ') : 'Xem danh sách bên dưới'}
                </p>
                <p className="text-xs text-neutral-600 mt-0.5">
                  {donation.pickupDate ? `${formatVnDate(donation.pickupDate)} · ` : ''}
                  {donation.pickupStartTime}-{donation.pickupEndTime}
                </p>
                {donation.status === 'pledged' && !editing && (
                  <button
                    type="button"
                    onClick={() => {
                      // Mở lại form với đúng danh sách hiện tại để chỉnh
                      setSelectedIds(
                        Object.fromEntries((donation.pickupAssigneeIds ?? []).map((id) => [id, true])),
                      );
                      setEditing(true);
                    }}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-bold text-neutral-600 hover:bg-neutral-50"
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    Đổi phân công
                  </button>
                )}
              </div>
            )}

            {/* Phân công TNV — chỉ khi còn chờ nhận hàng và chưa khóa */}
            {formOpen && (
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-neutral-500">
                  <span className="material-symbols-outlined text-[15px]">event_available</span>
                  {(donation.pickupAssigneeIds ?? []).length > 0 ? 'Đổi lịch / shipper đi nhận' : 'Phân công shipper đi nhận'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="col-span-1 text-xs font-semibold text-neutral-600">
                    Ngày lấy
                    <input
                      type="date"
                      value={pickupDate}
                      onChange={(e) => { setPickupDate(e.target.value); setSelectedIds({}); }}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </label>
                  <label className="col-span-1 text-xs font-semibold text-neutral-600">
                    Từ
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => { setStartTime(e.target.value); setSelectedIds({}); }}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </label>
                  <label className="col-span-1 text-xs font-semibold text-neutral-600">
                    Đến
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => { setEndTime(e.target.value); setSelectedIds({}); }}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </label>
                </div>

                {pickupDate && startTime && endTime ? (
                  eligible.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-neutral-500">
                        Chỉ hiện <b>shipper</b> có ca trực phủ trọn khung giờ trên — tránh lệch giờ
                        đăng ký với giờ lấy hàng. Tick nhiều người nếu hàng cần vài shipper đi cùng.
                      </p>
                      {eligible.map((a) => (
                        <label
                          key={a.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${
                            selectedIds[a.id] ? 'border-emerald-600 bg-emerald-50' : 'border-neutral-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!selectedIds[a.id]}
                            onChange={() => setSelectedIds((prev) => ({ ...prev, [a.id]: !prev[a.id] }))}
                            className="h-4 w-4 accent-emerald-700"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-neutral-900">
                              {a.volunteer.user.fullName}
                            </span>
                            <span className="block text-xs text-neutral-500">
                              {a.shift?.label} · {a.shift?.startTime}-{a.shift?.endTime}
                              {a.workDate ? ` · trực ${formatVnDate(a.workDate)}` : ''}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">
                      Không có shipper nào có ca trực phủ khung giờ này ngày {pickupDate ? formatVnDate(pickupDate) : ''}.
                      Hãy chọn khung giờ nằm trong ca Giao hàng đã có người được duyệt.
                    </div>
                  )
                ) : (
                  <p className="text-xs text-neutral-400">Chọn ngày + khung giờ lấy hàng để xem shipper phù hợp.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-neutral-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-bold text-neutral-500 transition-colors hover:bg-neutral-100"
          >
            Đóng
          </button>
          {donation.status === 'pledged' && (
            <>
              <button
                type="button"
                onClick={submitConfirmReceived}
                disabled={confirmDon.isPending}
                className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
              >
                {confirmDon.isPending ? 'Đang xác nhận…' : 'Đã nhận hàng'}
              </button>
              {hasAssigned && editing && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={assign.isPending}
                  className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-bold text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                >
                  Hủy
                </button>
              )}
              {formOpen && (
                <button
                  type="button"
                  onClick={submitAssign}
                  disabled={pickedIds.length === 0 || assign.isPending}
                  className="rounded-full bg-[#236c2a] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1a4f1f] disabled:opacity-50"
                >
                  {assign.isPending
                    ? 'Đang phân công…'
                    : pickedIds.length > 0
                      ? hasAssigned
                        ? `Lưu thay đổi (${pickedIds.length} shipper)`
                        : `Phân công ${pickedIds.length} shipper`
                      : 'Phân công đi nhận'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-neutral-600">
      <span className="material-symbols-outlined text-[15px] text-neutral-400">{icon}</span>
      <span className="font-semibold text-neutral-500 shrink-0">{label}:</span>
      <span className="min-w-0">{value}</span>
    </p>
  );
}
