'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  useStartCampaign,
  useCancelCampaign,
  useCompleteCampaign,
  useConfirmDonation,
  type Campaign,
} from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';
import { formatCampaignRange } from '@/lib/campaign-schedule';

const CAMPAIGN_STATUS_META: Record<string, { label: string; chip: string }> = {
  pending_approval: { label: 'Chờ duyệt', chip: 'cm-chip cm-chip--honey' },
  approved: { label: 'Đang tuyển', chip: 'cm-chip cm-chip--sky' },
  in_progress: { label: 'Đang diễn ra', chip: 'cm-chip cm-chip--mint' },
  completed: { label: 'Hoàn tất', chip: 'cm-chip cm-chip--mint' },
  cancelled: { label: 'Đã huỷ', chip: 'cm-chip cm-chip--rose' },
};

/** Prefix backend ghi vào `notes` khi admin từ chối duyệt — dùng để phân biệt với tự huỷ. */
const REJECTION_PREFIX = 'Từ chối duyệt:';

const RECRUITMENT_STATUS_HINT: Record<string, string> = {
  scheduled: 'Chưa mở tuyển',
  open: 'Đang mở tuyển',
  staffed: 'Đã đủ người',
  expired_understaffed: 'Hết hạn tuyển — chưa đủ người',
  closed_ready: 'Đã chốt danh sách',
};

function formatVnShort(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const DONATION_STATUS: Record<string, { label: string; cls: string }> = {
  pledged: { label: 'Đã hứa góp', cls: 'badge-honey' },
  received: { label: 'Đã nhận', cls: 'badge-emerald' },
  cancelled: { label: 'Đã huỷ', cls: 'badge-neutral' },
};

export default function MyCampaignCard({ c, allowEarlyStart = false }: { c: Campaign; allowEarlyStart?: boolean }) {
  const start = useStartCampaign();
  const cancelCampaign = useCancelCampaign();
  const complete = useCompleteCampaign();
  const confirmDon = useConfirmDonation();
  const [servings, setServings] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [confirmingDonationId, setConfirmingDonationId] = useState<string | null>(null);
  const [receiptNote, setReceiptNote] = useState('');
  const rejectionReason = c.status === 'cancelled' && c.notes?.startsWith(REJECTION_PREFIX)
    ? c.notes.slice(REJECTION_PREFIX.length).trim()
    : null;
  const st = rejectionReason !== null
    ? { label: 'Bị từ chối', chip: 'cm-chip cm-chip--rose' }
    : CAMPAIGN_STATUS_META[c.status] ?? { label: c.status, chip: 'cm-chip cm-chip--ink' };
  const confirmingDonation = c.donations?.find((d) => d.id === confirmingDonationId) ?? null;

  // Tiến độ tuyển TNV — con số quản lý cần thấy ngay mà không phải mở trang Quản lý.
  const slotsNeeded = c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded;
  const slotsFilled = Math.min(
    c.chefSlotsFilled + c.waiterSlotsFilled + c.shipperSlotsFilled,
    slotsNeeded,
  );
  const showRecruitment = (c.status === 'approved' || c.status === 'in_progress') && slotsNeeded > 0;
  const recruitmentHint = (() => {
    if (c.status !== 'approved') return null;
    if (c.recruitmentStatus === 'scheduled' && c.recruitmentStartAt) {
      return `Mở tuyển ${formatVnShort(c.recruitmentStartAt)}`;
    }
    if (c.recruitmentStatus === 'open' && c.recruitmentEndAt) {
      return `Đóng tuyển ${formatVnShort(c.recruitmentEndAt)}`;
    }
    return RECRUITMENT_STATUS_HINT[c.recruitmentStatus ?? ''] ?? null;
  })();

  // Đã qua ngày diễn ra (so theo lịch UTC, đồng bộ với backend daysUntil)
  const overdue = (() => {
    const [yy, mm, dd] = c.scheduledDate.slice(0, 10).split('-').map(Number);
    const now = new Date();
    return Date.UTC(yy, mm - 1, dd) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  })();

  // Đã tới giờ vận hành chưa — điều kiện BE bắt buộc để bấm "Bắt đầu chiến dịch",
  // TRỪ KHI admin bật "Cho phép bắt đầu/điểm danh sớm" trong Cài đặt hệ thống.
  const reachedOperationTime = c.operationStartAt
    ? Date.now() >= new Date(c.operationStartAt).getTime()
    : overdue;
  const canShowStart = reachedOperationTime || allowEarlyStart;

  // Đã qua ngày kết thúc theo lịch chưa (so theo ngày, khớp với BE) — quyết định
  // việc kết thúc có bị coi là "kết thúc sớm" hay không.
  const campaignEndReached = (() => {
    const endKey = (c.endDate ?? c.scheduledDate).slice(0, 10);
    const [yy, mm, dd] = endKey.split('-').map(Number);
    const now = new Date();
    return Date.UTC(yy, mm - 1, dd) <= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  })();

  async function doConfirm(donationId: string) {
    try {
      await confirmDon.mutateAsync({ donationId, note: receiptNote.trim() || undefined });
      toast.success('Đã xác nhận nhận nguyên liệu');
      setConfirmingDonationId(null);
      setReceiptNote('');
    } catch (e) {
      toast.error(errMsg(e, 'Xác nhận thất bại'));
    }
  }

  function closeConfirmModal() {
    if (confirmDon.isPending) return;
    setConfirmingDonationId(null);
    setReceiptNote('');
  }

  async function doStart() {
    try {
      await start.mutateAsync(c.id);
      toast.success('Đã bắt đầu chiến dịch');
    } catch (e) {
      toast.error(errMsg(e, 'Không bắt đầu được'));
    }
  }

  async function doCancel() {
    if (!window.confirm('Huỷ chiến dịch quá hạn này? Hành động không thể hoàn tác.')) return;
    try {
      await cancelCampaign.mutateAsync({
        id: c.id,
        reason: 'Quá ngày vận hành mà chiến dịch chưa bắt đầu được.',
      });
      toast.success('Đã huỷ chiến dịch quá hạn');
    } catch (e) {
      toast.error(errMsg(e, 'Huỷ thất bại'));
    }
  }

  async function doComplete() {
    const n = Number(servings);
    if (Number.isNaN(n) || n < 0) {
      toast.error('Nhập số suất ăn hợp lệ');
      return;
    }
    if (n > 100000) {
      toast.error('Số suất thực tế tối đa 100.000');
      return;
    }
    // Kết thúc TRƯỚC ngày kết thúc theo lịch là "kết thúc sớm" — BE bắt buộc kèm xác
    // nhận và lý do. Widget gọn trên card không có chỗ nhập lý do nên đẩy sang trang
    // quản lý (modal ở đó có sẵn); trước đây bấm ở đây luôn báo lỗi chung chung.
    if (!campaignEndReached) {
      toast.info('Chiến dịch chưa tới ngày kết thúc — hãy vào trang Quản lý để xác nhận kết thúc sớm kèm lý do.');
      return;
    }
    try {
      await complete.mutateAsync({ id: c.id, actualServings: n });
      toast.success('Đã kết thúc chiến dịch');
      setFinishing(false);
    } catch (e) {
      toast.error(errMsg(e, 'Không kết thúc được'));
    }
  }

  return (
    <div className="cm-card p-4 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-bold text-neutral-900 text-sm truncate flex-1">{c.title}</h3>
        <span className={st.chip}>{st.label}</span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">event</span>
          {formatCampaignRange(c)}
        </span>
        {c.expectedServings != null && (
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">restaurant</span>
            {c.expectedServings} suất
          </span>
        )}
        <span className="inline-flex items-center gap-1 truncate flex-1 min-w-0" title={c.kitchenAddress}>
          <span className="material-symbols-outlined text-[14px]">place</span>
          {c.kitchenAddress}
        </span>
      </div>

      {/* Tiến độ tuyển tình nguyện viên — chiến dịch chỉ tự bắt đầu khi đủ người */}
      {showRecruitment && (
        <div className="mt-3 rounded-xl bg-neutral-50 border border-neutral-100 p-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-neutral-700 inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">group</span>
              Tuyển TNV {slotsFilled}/{slotsNeeded}
            </span>
            {recruitmentHint && (
              <span className={`font-semibold ${c.recruitmentStatus === 'expired_understaffed' ? 'text-rose-600' : 'text-neutral-500'}`}>
                {recruitmentHint}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${slotsFilled >= slotsNeeded ? 'bg-emerald-500' : 'bg-sky-500'}`}
              style={{ width: `${Math.round((slotsFilled / slotsNeeded) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-500">
            Bếp {Math.min(c.chefSlotsFilled, c.chefSlotsNeeded)}/{c.chefSlotsNeeded}
            {' · '}Phục vụ {Math.min(c.waiterSlotsFilled, c.waiterSlotsNeeded)}/{c.waiterSlotsNeeded}
            {' · '}Giao hàng {Math.min(c.shipperSlotsFilled, c.shipperSlotsNeeded)}/{c.shipperSlotsNeeded}
          </p>
        </div>
      )}

      {/* Lý do admin từ chối — tổ chức cần biết sai gì để tạo lại cho đúng */}
      {rejectionReason !== null && (
        <div className="mt-3 rounded-xl bg-rose-50 border border-rose-100 p-2.5 text-[11px] text-rose-700">
          <p className="font-bold inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">block</span>
            Quản trị viên từ chối duyệt
          </p>
          <p className="mt-0.5">{rejectionReason || 'Không có lý do được ghi lại.'}</p>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3">
        <Link
          href={`/campaigns/${c.id}/manage`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 transition-colors"
        >
          <span className="material-symbols-outlined text-[15px]">settings</span>
          Quản lý
        </Link>
        <Link
          href={`/campaigns/${c.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-honey-700 hover:text-honey-900 transition-colors"
        >
          <span className="material-symbols-outlined text-[15px]">info</span>
          Chi tiết
        </Link>
      </div>

      {c.status === 'pending_approval' && (
        <p className="text-[11px] text-honey-700 mt-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">hourglass_top</span>
          Đang chờ quản trị viên duyệt
        </p>
      )}

      {c.status === 'approved' &&
        (overdue ? (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] text-rose-600 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">event_busy</span>
              Đã quá ngày diễn ra mà chưa bắt đầu
            </p>
            <button
              type="button"
              onClick={doCancel}
              disabled={cancelCampaign.isPending}
              className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
            >
              {cancelCampaign.isPending ? 'Đang huỷ...' : 'Huỷ chiến dịch quá hạn'}
            </button>
          </div>
        ) : canShowStart ? (
          // BE chỉ cho bắt đầu khi ĐÃ tới giờ vận hành và đủ người xác nhận. Trước đây
          // nút hiện cho mọi chiến dịch approved nên bấm lúc nào cũng nhận lỗi "Chưa
          // tới thời gian vận hành"; giờ chỉ hiện đúng lúc, còn điều kiện đủ người
          // vẫn do BE kiểm (báo lỗi kèm số người còn thiếu).
          <button
            type="button"
            onClick={doStart}
            disabled={start.isPending}
            className="mt-3 w-full py-2 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
          >
            {start.isPending ? 'Đang bắt đầu...' : 'Bắt đầu chiến dịch'}
          </button>
        ) : (
          <p className="mt-3 flex items-center gap-1 text-[11px] text-neutral-500">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            {c.operationStartAt
              ? `Tự bắt đầu lúc ${formatVnShort(c.operationStartAt)} khi đủ người xác nhận`
              : 'Chiến dịch sẽ tự bắt đầu khi tới giờ và đủ người xác nhận'}
          </p>
        ))}

      {c.status === 'in_progress' &&
        (finishing ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              placeholder="Số suất ăn"
              className="flex-1 input-base !py-1.5 text-xs"
              autoFocus
            />
            <button
              type="button"
              onClick={doComplete}
              disabled={complete.isPending}
              className="px-3 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
            >
              Xong
            </button>
            <button
              type="button"
              onClick={() => setFinishing(false)}
              className="px-2 py-2 text-neutral-400 text-xs"
            >
              Huỷ
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFinishing(true)}
            className="mt-3 w-full py-2 bg-honey-500 hover:bg-honey-600 text-white rounded-xl text-xs font-bold transition-colors"
          >
            Kết thúc &amp; nhập số suất
          </button>
        ))}

      {c.status === 'completed' && c.actualServings != null && (
        <p className="text-[11px] text-emerald-700 mt-3 flex items-center gap-1 font-semibold">
          <span className="material-symbols-outlined text-[14px]">check_circle</span>
          Đã phục vụ {c.actualServings} suất
        </p>
      )}

      {/* Nguyên liệu được quyên góp — tổ chức xác nhận đã nhận */}
      {c.donations && c.donations.length > 0 && (
        <div className="border-t border-neutral-100 mt-3 pt-3 space-y-1.5">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">inventory_2</span>
            Nguyên liệu quyên góp ({c.donations.length})
          </p>
          {c.donations.map((d) => {
            const ds = DONATION_STATUS[d.status] ?? { label: d.status, cls: 'badge-neutral' };
            return (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-neutral-700 truncate">
                  {d.quantity ? `${d.quantity} ` : ''}
                  {d.itemName}
                </span>
                <span className="text-neutral-400 truncate">· {d.provider.businessName}</span>
                {d.status === 'pledged' ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDonationId(d.id)}
                    disabled={confirmDon.isPending}
                    className="ml-auto px-2.5 py-1 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-full text-[10px] font-bold disabled:opacity-50 transition-colors shrink-0"
                  >
                    Xác nhận nhận
                  </button>
                ) : (
                  <span className={`badge ${ds.cls} ml-auto shrink-0`}>{ds.label}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmingDonation && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center pt-[10vh] px-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`confirm-donation-title-${confirmingDonation.id}`}
          onClick={closeConfirmModal}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0 rounded-t-2xl">
              <button
                type="button"
                onClick={closeConfirmModal}
                disabled={confirmDon.isPending}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center disabled:opacity-50"
                aria-label="Đóng"
              >
                <span className="material-symbols-outlined text-white text-[18px]">close</span>
              </button>
              <div className="flex items-center gap-3 pr-8">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-[18px]">inventory_2</span>
                </div>
                <h4 id={`confirm-donation-title-${confirmingDonation.id}`} className="font-extrabold text-white text-base">
                  Xác nhận nhận nguyên liệu
                </h4>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0">
              <div className="px-5 py-4 space-y-3">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-sm font-bold text-neutral-900">{confirmingDonation.itemName}</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    {confirmingDonation.quantity ? `${confirmingDonation.quantity} ` : ''}
                    từ {confirmingDonation.provider.businessName}
                  </p>
                </div>

                <label className="block">
                  <span className="text-xs font-bold text-neutral-700">Ghi chú gửi provider</span>
                  <textarea
                    value={receiptNote}
                    onChange={(e) => setReceiptNote(e.target.value)}
                    rows={4}
                    placeholder="Ví dụ: đã nhận đủ số lượng, chất lượng đạt yêu cầu, thời gian giao đúng hẹn..."
                    className="mt-2 w-full resize-none rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    autoFocus
                  />
                </label>
                <p className="text-xs leading-relaxed text-neutral-500">
                  Nội dung này sẽ được lưu vào biên nhận và gửi thông báo cho provider để họ biết kết quả xử lý.
                </p>
              </div>
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-neutral-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirmModal}
                disabled={confirmDon.isPending}
                className="rounded-full px-4 py-2 text-sm font-bold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => doConfirm(confirmingDonation.id)}
                disabled={confirmDon.isPending}
                className="rounded-full bg-[#236c2a] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1a4f1f] disabled:opacity-50"
              >
                {confirmDon.isPending ? 'Đang xác nhận...' : 'Xác nhận đã nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
