'use client';

import { useEffect, useState } from 'react';
import { X, Truck, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  useReviewProviderRequest,
  type ProviderRequestItem,
} from '@/hooks/useCampaigns';

interface Props {
  req: ProviderRequestItem | null;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Modal provider dùng để duyệt (accept/reject) yêu cầu hợp tác từ charity.
 *
 * Khi accept:
 *  - Hiển thị time picker "Giờ TNV đến lấy" (default = campaign.startTime).
 *  - Switch "Cần TNV giao hàng" mặc định BẬT → BE sẽ tự tạo delivery + tìm shipper.
 */
export function ReviewRequestModal({ req, onClose, onSuccess }: Props) {
  const review = useReviewProviderRequest();

  // Defaults
  const campaignStart = req?.campaign?.scheduledDate
    ? ''
    : '';
  // Lấy startTime từ request (nếu đã có) hoặc để trống để user chọn
  const [pickupTime, setPickupTime] = useState<string>('');
  const [needsTransport, setNeedsTransport] = useState<boolean>(true);
  const [rejectNote, setRejectNote] = useState<string>('');
  const [showRejectForm, setShowRejectForm] = useState<boolean>(false);

  useEffect(() => {
    if (!req) return;
    // Reset state khi mở modal cho request mới
    setPickupTime('');
    setNeedsTransport(true);
    setRejectNote('');
    setShowRejectForm(false);
  }, [req?.id]);

  if (!req) return null;

  const orgName =
    req.receiver.organizationName || req.receiver.user.fullName || 'Tổ chức';
  const campaignTitle = req.campaign?.title ?? 'Chiến dịch';
  const scheduledDateStr = req.campaign?.scheduledDate
    ? req.campaign.scheduledDate.slice(0, 10)
    : '—';

  const handleAccept = async () => {
    if (!pickupTime) {
      toast.error('Vui lòng chọn giờ TNV đến lấy hàng.');
      return;
    }
    try {
      const res = await review.mutateAsync({
        requestId: req.id,
        action: 'accept',
        pickupTime,
        needsTransport,
      });
      toast.success(
        needsTransport
          ? 'Đã chấp nhận — hệ thống đang tìm TNV giao hàng.'
          : 'Đã chấp nhận — TNV của charity sẽ đến lấy.',
      );
      void res;
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Có lỗi xảy ra.';
      toast.error(msg);
    }
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) {
      toast.error('Vui lòng nhập lý do từ chối.');
      return;
    }
    try {
      await review.mutateAsync({
        requestId: req.id,
        action: 'reject',
        note: rejectNote.trim(),
      });
      toast.success('Đã từ chối yêu cầu.');
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Có lỗi xảy ra.';
      toast.error(msg);
    }
  };

  const isLoading = review.isPending;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 animate-[cm-modal-in_180ms_ease]">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-[#E2E5DA] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#E2E5DA] bg-gradient-to-r from-[#F0F7F3] to-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#236c2a] text-white grid place-items-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-[#1a4f1f] text-base">
                Duyệt yêu cầu hợp tác
              </h2>
              <p className="text-xs text-[#5b6b59]">
                Từ <strong className="text-[#1a4f1f]">{orgName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-lg hover:bg-white/70 grid place-items-center text-[#5b6b59]"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Campaign preview */}
          <div className="rounded-xl border border-[#E2E5DA] bg-[#FAFBF9] p-4">
            <p className="text-xs uppercase tracking-wide text-[#5b6b59] font-semibold">
              Chiến dịch
            </p>
            <p className="font-bold text-[#1a4f1f] text-lg mt-1">{campaignTitle}</p>
            <p className="text-sm text-[#5b6b59] mt-1">
              Ngày dự kiến: <strong className="text-[#1a4f1f]">{scheduledDateStr}</strong>
            </p>
            {req.message && (
              <p className="mt-3 text-sm text-[#3d4a3b] italic border-l-2 border-[#9bc26a] pl-3">
                “{req.message}”
              </p>
            )}
          </div>

          {showRejectForm ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-[#1a4f1f] mb-2">
                  Lý do từ chối <span className="text-rose-600">*</span>
                </label>
                <textarea
                  className="w-full rounded-lg border border-[#E2E5DA] bg-white px-3 py-2 text-sm focus:border-[#236c2a] focus:outline-none focus:ring-2 focus:ring-[#236c2a]/20"
                  rows={3}
                  placeholder="Ví dụ: kho đang thiếu hàng, không thể đáp ứng…"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRejectForm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-[#3d4a3b] hover:bg-[#F0F7F3]"
                  disabled={isLoading}
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isLoading || !rejectNote.trim()}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  {isLoading ? 'Đang gửi…' : 'Xác nhận từ chối'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Pickup time picker */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-[#1a4f1f] mb-2">
                  <Clock className="h-4 w-4" />
                  Giờ TNV đến lấy hàng <span className="text-rose-600">*</span>
                </label>
                <input
                  type="time"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E5DA] bg-white px-3 py-2 text-sm font-medium focus:border-[#236c2a] focus:outline-none focus:ring-2 focus:ring-[#236c2a]/20"
                />
                <p className="mt-1 text-xs text-[#5b6b59]">
                  Mặc định sẽ lấy theo giờ bắt đầu của chiến dịch nếu bạn không chọn.
                </p>
              </div>

              {/* Needs transport switch */}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-[#E2E5DA] bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-[#F0F7F3] text-[#236c2a] grid place-items-center shrink-0">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-[#1a4f1f]">
                      Cần TNV giao hàng
                    </p>
                    <p className="text-xs text-[#5b6b59] mt-0.5">
                      Hệ thống sẽ tự tìm shipper gần nhà cung cấp để chở hàng đến bếp.
                      Tắt nếu charity tự điều TNV của họ đến lấy.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={needsTransport}
                  onClick={() => setNeedsTransport((v) => !v)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    needsTransport ? 'bg-[#236c2a]' : 'bg-[#cbd5cb]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      needsTransport ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRejectForm(true)}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  Từ chối
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isLoading || !pickupTime}
                  className="px-5 py-2 rounded-lg bg-[#236c2a] hover:bg-[#1a4f1f] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isLoading ? 'Đang gửi…' : 'Chấp nhận'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
