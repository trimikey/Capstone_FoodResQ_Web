'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { MyPickupOrder } from '@/hooks/useCampaigns';
import { formatVnDate } from '@/lib/vn-date';
import { mediaUrl } from '@/lib/utils';

/**
 * Một ĐƠN LẤY NGUYÊN LIỆU của chiến dịch, hiển thị trong Trung tâm giao hàng.
 *
 * Trước đây đơn nằm rải trong màn "Vào nhiệm vụ" của từng chiến dịch — shipper nhận
 * ca ở hai chiến dịch thì phải mở hai màn mới biết hôm nay phải đi lấy những gì.
 * Gom về đây để quản lý đơn ở một chỗ, cùng chỗ với đơn giao hàng.
 */

const DELIVERY_SHORT_LABEL: Record<string, string> = {
  pending_assignment: 'đang tìm shipper',
  assigned: 'shipper đã nhận',
  heading_to_provider: 'shipper đang tới lấy',
  qc_completed: 'shipper đã lấy hàng',
  in_transit: 'đang trên đường về bếp',
  delivered: 'đã giao về bếp',
  failed: 'chuyến thất bại',
  cancelled: 'đã huỷ',
};

interface Props {
  order: MyPickupOrder;
  onConfirm: (order: MyPickupOrder) => void;
}

export default function PickupOrderCard({ order, onConfirm }: Props) {
  // Thu gọn mặc định: shipper nhận ca vài chiến dịch thì mỗi đơn chiếm gần một màn hình,
  // phải cuộn rất lâu mới thấy hết. Dòng tóm tắt đủ để chọn đơn, chi tiết mở khi cần.
  const [open, setOpen] = useState(false);
  const pickup = order.pickup;
  const deliveredByShipper = order.delivery?.status === 'delivered';
  const done = !!pickup || deliveredByShipper;
  // Chuyến do shipper vận chuyển đang chạy → người này không phải đi lấy, chỉ theo dõi.
  const handledByDelivery =
    !!order.delivery &&
    !deliveredByShipper &&
    ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'].includes(
      order.delivery.status ?? '',
    );

  const shortfall =
    pickup && pickup.requestedKg != null && pickup.receivedKg != null
      ? Math.round((pickup.requestedKg - pickup.receivedKg) * 10) / 10
      : 0;

  const timeWindow = order.pickupStartTime
    ? `${order.pickupStartTime}${order.pickupEndTime ? `–${order.pickupEndTime}` : ''}`
    : null;

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
        done ? 'border-emerald-200' : 'border-neutral-200'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/campaigns/${order.campaignId}`}
              className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600 hover:bg-neutral-200"
            >
              {order.campaignTitle}
            </Link>
            {timeWindow && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                {timeWindow}
              </span>
            )}
            {done && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                Đã lấy
              </span>
            )}
            {shortfall > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                <span className="material-symbols-outlined text-[12px]">warning</span>
                Thiếu {shortfall} kg
              </span>
            )}
            {handledByDelivery && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                <span className="material-symbols-outlined text-[12px]">local_shipping</span>
                {DELIVERY_SHORT_LABEL[order.delivery?.status ?? ''] ?? 'có shipper vận chuyển'}
              </span>
            )}
          </div>
          <h3 className="mt-1 font-bold text-neutral-900">Lấy nguyên liệu: {order.providerName}</h3>
          {/* Dòng tóm tắt khi thu gọn — vừa đủ để quyết định mở đơn nào. */}
          {!open && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500">
              {order.quantityKg != null && (
                <span className="font-bold text-emerald-700">Cần lấy {order.quantityKg} kg</span>
              )}
              {order.ingredientName && <span>{order.ingredientName}</span>}
              {order.distanceKm != null && <span>{order.distanceKm} km</span>}
              <span className="truncate">{order.providerAddress || 'Chưa có địa chỉ'}</span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <span
              className={`material-symbols-outlined text-[15px] transition-transform ${open ? 'rotate-180' : ''}`}
            >
              expand_more
            </span>
            {open ? 'Thu gọn' : 'Chi tiết'}
          </button>
          {!done && !handledByDelivery && (
            <button
              type="button"
              onClick={() => onConfirm(order)}
              disabled={!order.checkedIn}
              title={order.checkedIn ? undefined : 'Cần điểm danh tại bếp chiến dịch trước'}
              className="rounded-xl bg-[#236c2a] px-4 py-2 text-xs font-bold text-white hover:bg-[#1a4f1f] disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
            >
              Đã lấy — chụp ảnh &amp; nhập kg
            </button>
          )}
        </div>
      </div>

      {!open ? null : (
      <>
      {/* Cần lấy gì, bao nhiêu */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {order.ingredientName && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
            {order.ingredientName}
          </span>
        )}
        {order.quantityKg != null && (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
            Cần lấy {order.quantityKg} kg
          </span>
        )}
        {order.expectedServings != null && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
            ≈ {order.expectedServings} suất
          </span>
        )}
        {order.requireColdChain && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
            <span className="material-symbols-outlined text-[12px]">ac_unit</span>
            Chuỗi lạnh &lt; 5°C
          </span>
        )}
        {order.requireQcPhoto && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
            <span className="material-symbols-outlined text-[12px]">photo_camera</span>
            Bắt buộc ảnh QC
          </span>
        )}
      </div>

      {/* Thông tin đơn */}
      <dl className="mt-2.5 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        <InfoRow icon="event" label="Ngày lấy">
          {order.scheduledDate ? formatVnDate(String(order.scheduledDate)) : 'Theo ngày chiến dịch'}
        </InfoRow>
        <InfoRow icon="schedule" label="Khung giờ hẹn">
          {timeWindow ?? 'Chưa hẹn giờ — liên hệ NCC'}
        </InfoRow>
        <InfoRow icon="route" label="Quãng đường">
          {order.distanceKm != null ? `${order.distanceKm} km (NCC → bếp)` : 'Chưa có toạ độ'}
        </InfoRow>
        <InfoRow icon="call" label="Liên hệ NCC">
          {order.providerPhone ? (
            <a href={`tel:${order.providerPhone}`} className="font-bold text-emerald-700 hover:underline">
              {order.providerPhone}
            </a>
          ) : (
            'Chưa có số điện thoại'
          )}
        </InfoRow>
        <div className="sm:col-span-2">
          <InfoRow icon="storefront" label="Địa chỉ lấy hàng">
            <span className="text-neutral-700">{order.providerAddress || 'Chưa có địa chỉ'}</span>
            {order.lng != null && order.lat != null && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 inline-flex items-center gap-0.5 font-bold text-emerald-700 hover:underline"
              >
                <span className="material-symbols-outlined text-[13px]">directions</span>
                Chỉ đường
              </a>
            )}
          </InfoRow>
        </div>
        <div className="sm:col-span-2">
          <InfoRow icon="soup_kitchen" label="Chở về bếp">
            <span className="text-neutral-700">{order.kitchenAddress}</span>
          </InfoRow>
        </div>
      </dl>

      {order.message && (
        <p className="mt-2 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-[11px] text-neutral-600">
          <b>Lời nhắn của bếp:</b> {order.message}
        </p>
      )}

      {!done && !handledByDelivery && !order.checkedIn && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
          <span className="material-symbols-outlined text-[14px]">lock</span>
          Điểm danh tại bếp chiến dịch trước rồi mới xác nhận lấy hàng được.
          {order.assignmentId && (
            <Link href={`/my-tasks/${order.assignmentId}`} className="ml-1 font-bold underline">
              Mở màn điểm danh
            </Link>
          )}
        </p>
      )}

      {/* Biên nhận đã lấy */}
      {pickup && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2">
          {pickup.photoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mediaUrl(pickup.photoUrl)}
              alt="Nguyên liệu đã lấy"
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 text-[11px]">
            <p className="font-bold text-emerald-800">
              Thực nhận {pickup.receivedKg} kg
              {pickup.requestedKg != null && ` / đặt ${pickup.requestedKg} kg`}
            </p>
            <p className="text-neutral-500">
              {pickup.byName || 'Bạn'} chốt lúc {new Date(pickup.confirmedAt).toLocaleString('vi-VN')}
            </p>
            {pickup.note && <p className="mt-0.5 text-neutral-600">{pickup.note}</p>}
          </div>
        </div>
      )}
      </>
      )}

      {/* Nhắc điểm danh hiện cả khi thu gọn — nếu không, nút bị mờ mà không rõ vì sao. */}
      {!open && !done && !handledByDelivery && !order.checkedIn && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
          <span className="material-symbols-outlined text-[14px]">lock</span>
          Điểm danh tại bếp chiến dịch trước rồi mới xác nhận lấy hàng được.
          {order.assignmentId && (
            <Link href={`/my-tasks/${order.assignmentId}`} className="ml-1 font-bold underline">
              Mở màn điểm danh
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="material-symbols-outlined mt-0.5 text-[14px] text-neutral-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">{label}</dt>
        <dd className="text-neutral-700">{children}</dd>
      </div>
    </div>
  );
}
