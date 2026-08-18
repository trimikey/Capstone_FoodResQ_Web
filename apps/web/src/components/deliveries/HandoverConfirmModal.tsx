'use client';

import { mediaUrl, UNIT_LABEL } from '@/lib/utils';
import { QuantityUnit } from '@foodresq/types';
import type { ActiveDelivery } from '@/hooks/useDeliveries';

/**
 * Bước cuối của shipper: sau khi quét đúng mã QR của người nhận, ĐỐI CHIẾU thông
 * tin rồi mới xác nhận bàn giao — cùng luật với đơn tự đến lấy (provider quét QR
 * xong phải nhìn ảnh đăng ký trước khi giao). Quét trúng mã chưa đủ: điện thoại
 * có thể đưa cho người khác cầm.
 */
export default function HandoverConfirmModal({
  delivery,
  busy,
  onConfirm,
  onCancel,
}: {
  delivery: ActiveDelivery;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reservation = delivery.reservation;
  const receiver = reservation?.receiver;
  const registeredPhoto = receiver?.faceImageUrl ?? receiver?.idCardImageUrl ?? null;
  const unit =
    UNIT_LABEL[reservation?.listing.quantityUnit as QuantityUnit] ??
    reservation?.listing.quantityUnit ??
    'phần';

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center pt-[8vh] px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0">
          <button
            onClick={onCancel}
            disabled={busy}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center disabled:opacity-50"
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-white text-[18px]">close</span>
          </button>
          <div className="flex items-center gap-3 pr-8">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-[18px]">how_to_reg</span>
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base">Đối chiếu người nhận</h3>
              <p className="text-xs text-white/80">Mã QR đã đúng — kiểm tra người trước mặt bạn</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="p-5 space-y-4">
            {/* Ảnh đã đăng ký */}
            <div className="flex flex-col items-center">
              {registeredPhoto ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(registeredPhoto)}
                    alt={receiver?.user.fullName ?? 'Người nhận'}
                    className="w-36 h-36 rounded-2xl object-cover ring-4 ring-emerald-100"
                  />
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    Ảnh đã đăng ký
                  </span>
                </div>
              ) : (
                <div className="w-36 h-36 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col items-center justify-center text-center px-3">
                  <span className="material-symbols-outlined text-amber-500 text-[36px]">no_photography</span>
                  <p className="text-[11px] font-bold text-amber-700 mt-1">Người nhận chưa đăng ký ảnh</p>
                </div>
              )}
            </div>

            {/* Thông tin đơn */}
            <div className="rounded-2xl bg-neutral-50 p-4 space-y-2.5 text-sm">
              <Row icon="person" label="Họ tên" value={receiver?.user.fullName ?? '—'} strong />
              {receiver?.user.phone && (
                <Row
                  icon="call"
                  label="Điện thoại"
                  value={
                    <a href={`tel:${receiver.user.phone}`} className="font-bold text-emerald-700 hover:underline">
                      {receiver.user.phone}
                    </a>
                  }
                />
              )}
              {receiver?.idCardNumber && <Row icon="badge" label="Số CCCD" value={receiver.idCardNumber} />}
              <Row
                icon="lunch_dining"
                label="Đơn hàng"
                value={`${reservation?.listing.title ?? '—'} · ${reservation?.quantity ?? 0} ${unit}`}
              />
              <Row icon="place" label="Giao đến" value={delivery.destination.address ?? '—'} />
            </div>

            {/* Bằng chứng khó di chuyển — đối chiếu luôn khi bàn giao */}
            {reservation?.deliveryEvidenceUrl && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900">
                  <span className="material-symbols-outlined text-[16px]">accessible</span>
                  Bằng chứng người nhận khó di chuyển
                </p>
                <a
                  href={mediaUrl(reservation.deliveryEvidenceUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block"
                  title="Bấm để xem ảnh gốc"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(reservation.deliveryEvidenceUrl)}
                    alt="Bằng chứng khó di chuyển"
                    className="h-28 w-full rounded-xl border border-amber-200 object-cover"
                  />
                </a>
              </div>
            )}

            {!registeredPhoto && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-600 text-[18px]">warning</span>
                <p className="text-xs font-medium text-amber-800">
                  Người nhận chưa đăng ký ảnh. Hãy hỏi giấy tờ tuỳ thân trước khi bàn giao.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-3 border-t border-neutral-100 p-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-3 rounded-xl border border-neutral-200 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Chưa đúng người
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {busy ? 'Đang xác nhận…' : 'Xác nhận bàn giao'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  strong,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <p className="flex items-start gap-2">
      <span className="material-symbols-outlined text-[16px] text-neutral-400">{icon}</span>
      <span className="shrink-0 text-neutral-500">{label}:</span>
      <span className={`min-w-0 flex-1 text-right ${strong ? 'font-extrabold text-neutral-900' : 'text-neutral-800'}`}>
        {value}
      </span>
    </p>
  );
}
