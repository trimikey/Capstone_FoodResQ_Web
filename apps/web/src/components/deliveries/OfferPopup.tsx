'use client';

import { useEffect, useState } from 'react';
import type { TaskOffer } from '@/hooks/useDeliveries';

/** Đồng hồ đếm ngược thời hạn offer (đỏ khi còn < 30s). */
export function OfferCountdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    const t = setInterval(() => {
      setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span className={`font-mono font-bold ${left < 30 ? 'text-rose-600' : 'text-emerald-700'}`}>
      {m}:{String(s).padStart(2, '0')}
    </span>
  );
}

/** Popup nổi bật (kiểu Grab/Xanh SM) khi có đơn mời — bật ngay qua socket, dùng ở mọi trang. */
export function OfferPopup({
  offer,
  onAccept,
  onReject,
  onClose,
  busy,
}: {
  offer: TaskOffer;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const l = offer.delivery.reservation.listing;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-emerald-600 text-white px-5 py-4 flex items-center justify-between">
          <span className="flex items-center gap-2 font-extrabold">
            <span className="material-symbols-outlined">notifications_active</span>
            Đơn giao mới!
          </span>
          <span className="flex items-center gap-1.5 text-sm bg-white/15 px-2.5 py-1 rounded-lg">
            <span className="material-symbols-outlined text-[18px]">timer</span>
            <OfferCountdown expiresAt={offer.expiresAt} />
          </span>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-neutral-100 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.imageUrls[0] || '/food_bread.png'} alt={l.title} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-neutral-900 truncate">{l.title}</h3>
              {offer.delivery.distanceKm != null && (
                <p className="text-xs text-neutral-500">~{offer.delivery.distanceKm} km</p>
              )}
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <p className="flex items-start gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-[18px]">store</span>
              <span className="text-neutral-700"><b>Lấy:</b> {l.pickupAddress}</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="material-symbols-outlined text-rose-600 text-[18px]">location_on</span>
              <span className="text-neutral-700"><b>Giao:</b> {offer.delivery.reservation.receiver?.address ?? '—'}</span>
            </p>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={onReject}
              disabled={busy}
              className="flex-1 py-3 rounded-2xl font-bold text-sm border border-neutral-200 text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              Từ chối
            </button>
            <button
              onClick={onAccept}
              disabled={busy}
              className="flex-1 py-3 rounded-2xl font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              Nhận đơn
            </button>
          </div>
          <button onClick={onClose} className="w-full text-center text-xs text-neutral-400 hover:text-neutral-600">
            Để sau (xem trong danh sách)
          </button>
        </div>
      </div>
    </div>
  );
}
