'use client';

import { useState } from 'react';
import { UNIT_LABEL, mediaUrl, mapsPlaceUrl } from '@/lib/utils';
import { QuantityUnit } from '@foodresq/types';
import type { ListingItem } from '@/hooks/useListings';
import { BULK_CANCEL_PENALTY } from '@/hooks/useBulkRuns';
import { Modal } from '@/components/shared/Modal';

interface Props {
  listing: ListingItem;
  quantity: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });

/**
 * Xác nhận trước khi gửi yêu cầu giao sỉ.
 *
 * Hai mục đích: (1) shipper xem đủ chi tiết cửa hàng trước khi cam kết — địa chỉ,
 * khung giờ lấy, bảo quản, dị ứng; (2) buộc tích cam kết trách nhiệm giao đúng nơi,
 * vì giao sỉ nhận số lượng lớn và phát cho người yếu thế, sai sót khó khắc phục.
 */
export default function BulkRunConfirmModal({ listing, quantity, busy, onCancel, onConfirm }: Props) {
  const [agreed, setAgreed] = useState(false);
  const unit = UNIT_LABEL[listing.quantityUnit as QuantityUnit] ?? listing.quantityUnit;

  // Chốt mốc "bây giờ" một lần lúc mở popup — đọc đồng hồ trong lúc render là không
  // thuần khiết và làm cảnh báo nhấp nháy mỗi lần component vẽ lại.
  const [openedAt] = useState(() => Date.now());
  const endsAt = new Date(listing.pickupEndTime).getTime();
  const msLeft = endsAt - openedAt;
  const hoursLeft = Math.floor(msLeft / 3_600_000);
  const tight = msLeft < 2 * 3_600_000; // còn dưới 2 tiếng để tới lấy

  return (
    // Dùng Modal chung: portal ra <body> nên không bị lớp cha nào cắt, và đã xử lý
    // cuộn/căn giữa cho nội dung cao hơn màn hình.
    <Modal
      onClose={onCancel}
      closeOnBackdrop={!busy}
      className="bg-white rounded-3xl w-full max-w-lg shadow-2xl"
    >
          <div className="p-5 border-b border-neutral-100 flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh tin đăng động */}
          <img
            src={listing.imageUrls?.[0] ? mediaUrl(listing.imageUrls[0]) : '/banh-mi.png'}
            alt={listing.title}
            className="w-16 h-16 rounded-xl object-cover bg-neutral-100 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-neutral-900 truncate">{listing.title}</h3>
            <p className="text-xs text-neutral-500 truncate">{listing.provider.businessName}</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Cách bạn ~{(listing.distanceM / 1000).toFixed(1)} km
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            aria-label="Đóng"
            className="text-neutral-400 hover:text-neutral-700 disabled:opacity-50 shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Số lượng — đúng đơn vị của tin đăng */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-xs text-emerald-700 font-semibold">Bạn yêu cầu nhận</p>
            <p className="text-2xl font-extrabold text-emerald-900 mt-0.5">
              {quantity} {unit}
            </p>
            <p className="text-[11px] text-emerald-700/80 mt-1">
              Kho hiện còn {listing.quantityRemaining} {unit}. Phần chưa phát hết sẽ được hoàn lại cho cửa hàng khi bạn kết thúc chuyến.
            </p>
          </div>

          {/* Chi tiết cửa hàng */}
          <div className="rounded-2xl border border-neutral-150 divide-y divide-neutral-100 text-sm">
            <div className="p-3 flex gap-2">
              <span className="material-symbols-outlined text-[18px] text-neutral-400 shrink-0">storefront</span>
              <div className="min-w-0">
                <p className="text-[11px] text-neutral-500">Địa chỉ lấy hàng</p>
                <p className="font-semibold text-neutral-800">{listing.pickupAddress}</p>
                {listing.lat != null && listing.lng != null && (
                  <a
                    href={mapsPlaceUrl(listing.lat, listing.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    Mở Google Maps
                  </a>
                )}
              </div>
            </div>

            <div className="p-3 flex gap-2">
              <span className="material-symbols-outlined text-[18px] text-neutral-400 shrink-0">schedule</span>
              <div className="min-w-0">
                <p className="text-[11px] text-neutral-500">Khung giờ nhận hàng</p>
                <p className="font-semibold text-neutral-800">
                  {fmtTime(listing.pickupStartTime)} → {fmtTime(listing.pickupEndTime)}
                </p>
                {tight && (
                  <p className="text-xs font-bold text-amber-700 mt-0.5">
                    {msLeft > 0
                      ? `Chỉ còn khoảng ${hoursLeft > 0 ? `${hoursLeft} giờ` : 'dưới 1 giờ'} để tới lấy.`
                      : 'Đã quá giờ nhận hàng.'}
                  </p>
                )}
              </div>
            </div>

            {listing.storageConditions && (
              <div className="p-3 flex gap-2">
                <span className="material-symbols-outlined text-[18px] text-neutral-400 shrink-0">ac_unit</span>
                <div className="min-w-0">
                  <p className="text-[11px] text-neutral-500">Điều kiện bảo quản</p>
                  <p className="font-semibold text-neutral-800">{listing.storageConditions}</p>
                </div>
              </div>
            )}

            {listing.allergenNotes && (
              <div className="p-3 flex gap-2 bg-amber-50/60">
                <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0">warning</span>
                <div className="min-w-0">
                  <p className="text-[11px] text-amber-700">Cảnh báo dị ứng — phải báo cho người nhận</p>
                  <p className="font-semibold text-amber-900">{listing.allergenNotes}</p>
                </div>
              </div>
            )}
          </div>

          {/* Hậu quả nếu bỏ ngang — nói trước khi cam kết, không để shipper bất ngờ */}
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
            <span className="material-symbols-outlined text-[18px] text-rose-600 shrink-0">gpp_maybe</span>
            <p className="text-[11px] text-rose-900 leading-relaxed">
              Sau khi nhà cung cấp <strong>duyệt</strong>, kho sẽ bị trừ để dành hàng cho bạn. Nếu lúc đó
              bạn huỷ chuyến, bạn sẽ <strong>bị trừ {BULK_CANCEL_PENALTY} điểm uy tín</strong>. Huỷ khi
              yêu cầu còn đang chờ duyệt thì không bị trừ.
            </p>
          </div>

          {/* Cam kết trách nhiệm */}
          <label className="flex items-start gap-3 p-4 rounded-2xl border-2 border-neutral-200 cursor-pointer hover:bg-neutral-50 transition-colors has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50/50">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={busy}
              className="mt-0.5 w-4 h-4 accent-emerald-700 shrink-0"
            />
            <span className="text-xs text-neutral-700 leading-relaxed">
              Tôi cam kết <strong>giao đúng người, đúng nơi đã ghim</strong>, giữ đúng điều kiện bảo quản trên
              đường vận chuyển, ghi nhận trung thực số phần đã phát tại từng điểm, và{' '}
              <strong>không bán lại hay sử dụng cho mục đích cá nhân</strong>. Tôi hiểu rằng khai báo sai hoặc
              không hoàn thành chuyến sẽ bị trừ điểm uy tín và có thể bị khoá quyền nhận giao sỉ.
            </span>
          </label>
        </div>

        <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-3 bg-white border border-neutral-200 text-neutral-700 rounded-xl font-bold text-sm hover:bg-neutral-100 disabled:opacity-50"
          >
            Quay lại
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !agreed}
            title={!agreed ? 'Cần tích cam kết trước khi gửi' : undefined}
            className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-extrabold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <span className="animate-spin border-2 border-white/40 border-t-white rounded-full w-4 h-4" />
                Đang gửi…
              </>
            ) : (
              'Xác nhận gửi yêu cầu'
            )}
          </button>
          </div>
    </Modal>
  );
}
