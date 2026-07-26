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
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={() => !isPending && onClose()}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              isProvider ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
            }`}
          >
            <span className="material-symbols-outlined">
              {isProvider ? 'block' : 'cancel'}
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base text-neutral-900">
              {isProvider ? 'Huỷ đơn của người nhận' : 'Huỷ đặt chỗ'}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5 truncate">
              {listingTitle}
              {quantityLabel ? ` · ${quantityLabel}` : ''}
              {receiverName ? ` · ${receiverName}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="ml-auto text-neutral-400 hover:text-neutral-700 disabled:opacity-50"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Cảnh báo riêng cho từng mode */}
        {isProvider ? (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
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
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <span className="material-symbols-outlined text-amber-600 text-[18px] mt-0.5">warning</span>
            <p className="text-xs text-amber-800 leading-relaxed">
              Vui lòng chỉ huỷ khi thực sự cần thiết. Đơn đã xác nhận sẽ trừ 1 lượt đặt trong ngày của bạn.
            </p>
          </div>
        )}

        <p className="text-sm font-bold text-neutral-800 mb-2">Vì sao bạn huỷ đơn này?</p>

        <div className="flex flex-wrap gap-1.5 mb-3">
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
          className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200 resize-none disabled:opacity-50"
        />

        <div className="flex gap-2 mt-4">
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
