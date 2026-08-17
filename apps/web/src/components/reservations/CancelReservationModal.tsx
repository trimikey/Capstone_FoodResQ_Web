'use client';

import { useState } from 'react';

interface CancelReservationModalProps {
  /** "receiver" = người nhận tự huỷ (có cảnh báo trust) */
  /** "provider" = nhà cung cấp huỷ đơn của người nhận (không phạt trust) */
  mode: 'receiver' | 'provider';
  reservationId: string;
  listingTitle: string;
  /** Tên người nhận (cho provider mode) — hiện để xác nhận đúng đơn cần huỷ */
  receiverName?: string;
  /** Mô tả số lượng (vd "2 phần") */
  quantityLabel?: string;
  isPending: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}

const RECEIVER_REASONS = [
  'Bận việc đột xuất',
  'Đổi ý / không cần nữa',
  'Đặt nhầm',
  'Quá xa',
];

const PROVIDER_REASONS = [
  'Người nhận không đến nhận sau khi đặt',
  'Thông tin người nhận có dấu hiệu gian lận',
  'Số lượng đăng sai so với thực tế',
  'Hàng bị hỏng trước giờ giao',
];

export default function CancelReservationModal({
  mode,
  reservationId,
  listingTitle,
  receiverName,
  quantityLabel,
  isPending,
  onConfirm,
  onClose,
}: CancelReservationModalProps) {
  const [reason, setReason] = useState('');
  const reasons = mode === 'provider' ? PROVIDER_REASONS : RECEIVER_REASONS;

  const isProvider = mode === 'provider';

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[10vh] px-4"
      onClick={() => !isPending && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-md max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0 rounded-t-2xl">
          <button
            onClick={onClose}
            disabled={isPending}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-white text-[18px]">close</span>
          </button>
          <div className="flex items-center gap-3 pr-8">
            <div className={`w-9 h-9 rounded-xl ${isProvider ? 'bg-white/20' : 'bg-white/20'} flex items-center justify-center shrink-0`}>
              <span className="material-symbols-outlined text-white text-[18px]">
                {isProvider ? 'block' : 'cancel'}
              </span>
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base">
                {isProvider ? 'Huỷ đơn của người nhận' : 'Huỷ đặt chỗ'}
              </h3>
              <p className="text-xs text-white/70 truncate mt-0.5">
                {listingTitle}
                {quantityLabel ? ` · ${quantityLabel}` : ''}
                {receiverName ? ` · ${receiverName}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="px-5 py-4 space-y-3">
            {/* Cảnh báo riêng cho từng mode */}
            {isProvider ? (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-rose-600 text-[18px] mt-0.5">info</span>
                <div className="text-xs leading-relaxed">
                  <p className="font-bold text-rose-700">
                    Đơn sẽ bị huỷ và số lượng sẽ được hoàn lại cho tin đăng.
                  </p>
                  <p className="text-rose-700/80 mt-1 font-normal">
                    Người nhận sẽ <b>không bị trừ điểm uy tín</b>. Đơn giao hàng (nếu có) sẽ bị đóng và tình nguyện viên được giải phóng.
                  </p>
                  <p className="text-rose-700/60 mt-1 text-[10px] font-mono">Mã: {reservationId.slice(0, 8).toUpperCase()}</p>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-600 text-[18px] mt-0.5">warning</span>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Vui lòng chỉ huỷ khi thực sự cần thiết. Đơn đã xác nhận sẽ trừ 1 lượt đặt trong ngày của bạn.
                </p>
              </div>
            )}

            <p className="text-sm font-bold text-neutral-800">Vì sao bạn huỷ đơn này?</p>

            <div className="flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  disabled={isPending}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors disabled:opacity-50 ${
                    reason === r
                      ? isProvider
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Hoặc nhập lý do khác..."
              rows={2}
              maxLength={500}
              disabled={isPending}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-neutral-200 resize-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-neutral-100 flex gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 py-2.5 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Không huỷ
          </button>
          <button
            onClick={() => void onConfirm(reason.trim())}
            disabled={isPending || !reason.trim()}
            className={`flex-1 py-2.5 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 ${
              isProvider ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {isPending ? 'Đang huỷ...' : isProvider ? 'Xác nhận huỷ đơn' : 'Xác nhận huỷ'}
          </button>
        </div>
      </div>
    </div>
  );
}
