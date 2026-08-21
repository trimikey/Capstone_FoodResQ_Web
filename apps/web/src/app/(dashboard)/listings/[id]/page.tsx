'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useListing, useListings, type ListingDetail } from '@/hooks/useListings';
import { useCreateReservation } from '@/hooks/useReservation';
import { useMe } from '@/hooks/useProfile';
import { usePublishListing, useCancelListing, useDuplicateListing } from '@/hooks/useProviderListings';
import { UserRole } from '@foodresq/types';
import { mediaUrl, UNIT_LABEL } from '@/lib/utils';
import { api } from '@/lib/api';
import { usePickupWindow } from '@/hooks/usePickupWindow';
import {
  formatVietnamDate,
  formatVietnamDateTime,
  formatVietnamTime,
  isSameVietnamDate,
} from '@/lib/listing-form';
import { QuantityUnit } from '@foodresq/types';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { reverseGeocode } from '@/lib/geocode';

// Bản đồ chỉ tải khi người dùng thực sự mở phần chọn điểm giao (Leaflet cần window).
const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), { ssr: false });

interface Props {
  params: Promise<{ id: string }>;
}

const CATEGORIES: Record<string, string> = {
  cooked_meal: 'Đồ chín',
  bakery: 'Bánh ngọt',
  fresh_fruit: 'Trái cây',
  beverage: 'Đồ uống',
  vegetables: 'Rau củ',
  raw_protein: 'Thịt/cá sống',
  dry_goods: 'Đồ khô',
  canned_packaged: 'Đồ hộp',
  other: 'Khác',
};

const CATEGORY_FALLBACK_IMAGE: Record<string, string> = {
  bakery: '/banh-mi.png',
  cooked_meal: '/com-ga.png',
  fresh_fruit: '/rau-cu.png',
  vegetables: '/rau-cu.png',
};

function fallbackImage(category: string): string {
  return CATEGORY_FALLBACK_IMAGE[category] ?? '/hu-tieu.png';
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export default function ListingDetailPage({ params }: Props) {
  const router = useRouter();
  const { id } = React.use(params);

  const { data: listing, isLoading, isError } = useListing(id);
  const { data: me } = useMe();
  const createReservation = useCreateReservation();
  const publishListing = usePublishListing();
  const cancelListing = useCancelListing();
  const duplicateListing = useDuplicateListing();

  // Gợi ý "có thể bạn quan tâm" — listing thật gần trung tâm, loại trừ chính nó
  const { data: nearby } = useListings({ lat: 10.8231, lng: 106.6297, radiusKm: 10 });
  const related = (nearby ?? []).filter((l) => l.id !== id).slice(0, 4);

  const isProvider = me?.role === UserRole.PROVIDER;
  // Provider đang xem bài đăng của chính mình → chế độ quản lý (read-only metadata, không đặt chỗ)
  const isOwnerProvider = isProvider && me?.provider?.id === listing?.provider.id;

  const [quantity, setQuantity] = useState(1);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [showPickupConfirm, setShowPickupConfirm] = useState(false);
  // Ảnh bằng chứng khó di chuyển — BẮT BUỘC khi chọn "Cần TNV giao".
  // Shipper sẽ xem ảnh này trong popup lời mời trước khi quyết định nhận đơn.
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  // Điểm giao: mặc định là địa chỉ trong hồ sơ, nhưng người khó di chuyển có thể
  // đang nằm viện / ở nhà người thân nên cho phép ghim một vị trí khác cho đơn này.
  const [useCustomDestination, setUseCustomDestination] = useState(false);
  const [destAddress, setDestAddress] = useState('');
  const [destLng, setDestLng] = useState<number | null>(null);
  const [destLat, setDestLat] = useState<number | null>(null);
  const [locatingDest, setLocatingDest] = useState(false);
  const [reservationResult, setReservationResult] = useState<{
    reservationId: string;
    qrToken: string;
    qrExpiresAt: string;
  } | null>(null);
  const [showTimeInfo, setShowTimeInfo] = useState(false);

  // Derived values cần cho useEffect - đặt ở đây để tránh ReferenceError
  const isSoldOut = !!(listing && listing.quantityRemaining <= 0);
  // Khung giờ TỰ CẬP NHẬT: trước đây chốt Date.now() lúc mount nên mở trang sát giờ
  // đóng thì nút đặt vẫn bấm được sau khi đã quá hạn.
  const pickupWindow = usePickupWindow(
    listing?.pickupStartTime,
    listing?.pickupEndTime,
  );
  const notYetOpen = !!listing && pickupWindow.notYetOpen;
  const windowClosed = !!listing && pickupWindow.closed;

  // Auto-show time info popup when listing loads (only for non-owner/non-sold-out)
  useEffect(() => {
    if (!isLoading && listing && !isOwnerProvider && !isSoldOut && !notYetOpen && !windowClosed) {
      const timer = setTimeout(() => setShowTimeInfo(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, listing, isOwnerProvider, isSoldOut, notYetOpen, windowClosed]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 bg-surface">
        <div className="flex flex-col items-center gap-md">
          <span className="animate-spin border-4 border-primary border-t-transparent rounded-full w-10 h-10" />
          <p className="font-body-md text-on-surface-variant">Đang tải thông tin sản phẩm...</p>
        </div>
      </div>
    );
  }

  if (isError || !listing) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 bg-surface">
        <div className="flex flex-col items-center gap-md text-center">
          <span className="material-symbols-outlined text-outline-variant text-[56px]">
            search_off
          </span>
          <p className="font-headline-md text-lg text-on-surface">Không tìm thấy thực phẩm này</p>
          <p className="font-body-md text-sm text-on-surface-variant max-w-xs">
            Sản phẩm có thể đã được nhận hết hoặc không còn hiệu lực.
          </p>
          <button
            onClick={() => router.push('/listings')}
            className="px-5 py-2.5 bg-primary text-white rounded-xl font-label-lg text-sm font-semibold"
          >
            Quay lại danh sách
          </button>
        </div>
      </div>
    );
  }

  const maxQty = Math.min(listing.maxPerReservation, listing.quantityRemaining);

  const handleIncrement = () => {
    if (quantity < maxQty) setQuantity((q) => q + 1);
  };
  const handleDecrement = () => {
    if (quantity > 1) setQuantity((q) => q - 1);
  };

  const handlePreOrder = async () => {
    // Đơn cần TNV giao → bắt buộc ảnh bằng chứng khó di chuyển (BE cũng chặn).
    if (deliveryMethod === 'delivery' && !evidenceFile) {
      toast.error('Vui lòng tải ảnh bằng chứng khó di chuyển (giấy khám bệnh, ảnh chấn thương…) trước khi đặt đơn giao tận nơi.');
      return;
    }
    // Ghim điểm giao khác thì phải đủ cả toạ độ lẫn mô tả địa chỉ — TNV cần địa chỉ
    // chữ để hỏi đường, toạ độ để điều hướng.
    const wantsCustomDest = deliveryMethod === 'delivery' && useCustomDestination;
    if (wantsCustomDest && (destLng == null || destLat == null)) {
      toast.error('Vui lòng chọn điểm giao trên bản đồ.');
      return;
    }
    if (wantsCustomDest && destAddress.trim().length < 5) {
      toast.error('Vui lòng mô tả địa chỉ điểm giao (số nhà, tên bệnh viện, khoa/phòng…).');
      return;
    }
    try {
      let deliveryEvidenceUrl: string | undefined;
      if (deliveryMethod === 'delivery' && evidenceFile) {
        setUploadingEvidence(true);
        try {
          const fd = new FormData();
          fd.append('file', evidenceFile);
          const { data } = await api.post('/uploads/image?kind=delivery-evidence', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          deliveryEvidenceUrl = (data.data ?? data).url as string;
        } finally {
          setUploadingEvidence(false);
        }
      }
      const res = await createReservation.mutateAsync({
        listingId: id,
        quantity,
        requestDelivery: deliveryMethod === 'delivery',
        deliveryEvidenceUrl,
        ...(wantsCustomDest
          ? { deliveryLng: destLng!, deliveryLat: destLat!, deliveryAddress: destAddress.trim() }
          : {}),
      });
      setReservationResult({
        reservationId: res.reservationId,
        qrToken: res.qrToken,
        qrExpiresAt: res.qrExpiresAt,
      });
      // Không auto-chuyển trang — để người dùng xem QR và tự bấm "Xem đơn đặt"
      toast.success(
        deliveryMethod === 'delivery'
          ? 'Đã tạo đơn giao hàng! Hệ thống đang tìm tình nguyện viên gần điểm lấy.'
          : 'Đặt chỗ tự đến lấy thành công! Đơn này sẽ không gửi lời mời cho shipper.'
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Đặt chỗ thất bại';
      toast.error(msg);
    }
  };

  const formattedEndTime = formatVietnamTime(listing.pickupEndTime);

  // Luôn hiển thị giờ Việt Nam, kể cả khi người nhận mở app ở múi giờ khác.
  const fmtTime = formatVietnamTime;

  return (
    <div className="min-h-full bg-surface py-8 px-4 sm:px-8 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-on-surface-variant/70">
        {isOwnerProvider ? (
          <>
            <Link href="/provider" className="hover:text-primary transition-colors">Quản lý cửa hàng</Link>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-on-surface font-semibold truncate max-w-[200px]">{listing.title}</span>
          </>
        ) : (
          <>
            <Link href="/listings" className="hover:text-primary transition-colors">Trang chủ</Link>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="capitalize">{CATEGORIES[listing.category] || listing.category}</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-on-surface font-semibold truncate max-w-[200px]">{listing.title}</span>
          </>
        )}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Product Image & Details */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="relative rounded-3xl overflow-hidden aspect-[4/3] bg-surface-container shadow-md border border-outline-variant/10 group">
            <img
              src={
                (listing.imageUrls[0] && ![
                  '/banh-mi-ngot-thap-cam.png', '/com-ga-hoi-an.png', '/food_salad.png',
                  '/banh-mi-lua-mach-tuoi.png', '/food_bread.png', '/food_lunchbox.png'
                ].includes(listing.imageUrls[0]))
                  ? mediaUrl(listing.imageUrls[0])
                  : fallbackImage(listing.category)
              }
              alt={listing.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute top-4 left-4 flex gap-2">
              <span className="bg-black/50 backdrop-blur-md text-white font-label-lg text-xs px-3 py-1.5 rounded-full">
                Còn {listing.quantityRemaining} {UNIT_LABEL[listing.quantityUnit as QuantityUnit] ?? listing.quantityUnit}
              </span>
              <span className="bg-primary/95 text-white font-label-lg text-xs px-3 py-1.5 rounded-full shadow-sm">
                Cứu trợ 0đ
              </span>
              {listing.isSurpriseBag && (
                <span className="bg-honey-500/95 text-white font-label-lg text-xs px-3 py-1.5 rounded-full shadow-sm inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px]">redeem</span> Túi bất ngờ
                </span>
              )}
            </div>
          </div>

          {/* Three Selling points pills */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 p-4 bg-surface-container-low rounded-2xl border border-outline-variant/15 text-center sm:text-left transition-colors hover:bg-surface-container-high/40">
              <span className="material-symbols-outlined text-primary text-[28px]">inventory_2</span>
              <div>
                <p className="font-label-lg text-sm text-on-surface font-semibold">Còn lại</p>
                <p className="text-[11px] text-on-surface-variant/70 hidden sm:block">
                  {listing.quantityRemaining} {UNIT_LABEL[listing.quantityUnit as QuantityUnit] ?? listing.quantityUnit}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 p-4 bg-surface-container-low rounded-2xl border border-outline-variant/15 text-center sm:text-left transition-colors hover:bg-surface-container-high/40">
              <span className="material-symbols-outlined text-primary text-[28px]">schedule</span>
              <div>
                <p className="font-label-lg text-sm text-on-surface font-semibold">Giờ nhận</p>
                <p className="text-[11px] text-on-surface-variant/70 hidden sm:block">
                  {formattedEndTime}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 p-4 bg-surface-container-low rounded-2xl border border-outline-variant/15 text-center sm:text-left transition-colors hover:bg-surface-container-high/40">
              <span className="material-symbols-outlined text-primary text-[28px]">straighten</span>
              <div>
                <p className="font-label-lg text-sm text-on-surface font-semibold">Đơn vị</p>
                <p className="text-[11px] text-on-surface-variant/70 hidden sm:block">
                  {UNIT_LABEL[listing.quantityUnit as QuantityUnit] ?? listing.quantityUnit}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Reservation Form / QR (or Provider panel) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {isOwnerProvider ? (
            <ProviderManagementPanel
              listing={listing}
              onPublish={async () => {
                try { await publishListing.mutateAsync(listing.id); toast.success('Đã đăng tin'); router.refresh(); }
                catch { toast.error('Đăng tin thất bại'); }
              }}
              onCancel={async () => {
                try { await cancelListing.mutateAsync({ id: listing.id }); toast.info('Đã huỷ tin'); router.push('/provider'); }
                catch { toast.error('Huỷ thất bại'); }
              }}
              onDuplicate={async () => {
                try { await duplicateListing.mutateAsync(listing.id); toast.success('Đã tạo bản nháp mới'); router.push('/provider'); }
                catch { toast.error('Nhân bản thất bại'); }
              }}
              publishing={publishListing.isPending}
              cancelling={cancelListing.isPending}
              duplicating={duplicateListing.isPending}
            />
          ) : (
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-3xl p-6 shadow-sm flex flex-col gap-5">
            {/* Title & Provider */}
            <div className="space-y-2">
              <h2 className="font-headline-md text-headline-md text-on-surface leading-tight font-bold">
                {listing.title}
              </h2>
              <div className="flex items-center gap-2 text-on-surface-variant/90">
                <span className="material-symbols-outlined text-[18px] text-primary">store</span>
                <span className="font-label-lg text-sm font-semibold">{listing.provider.businessName}</span>
              </div>
              <div className="flex items-start gap-2 text-on-surface-variant/80 pt-1">
                <span className="material-symbols-outlined text-[18px] text-primary shrink-0">place</span>
                <span className="font-body-md text-sm">{listing.pickupAddress}</span>
              </div>
              {listing.category && (
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    <span className="material-symbols-outlined text-[14px]">category</span>
                    {CATEGORIES[listing.category] ?? listing.category}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            {listing.description && (
              <div className="space-y-1 border-t border-outline-variant/10 pt-4">
                <p className="font-label-lg text-sm text-on-surface-variant font-bold">Mô tả sản phẩm</p>
                <p className="font-body-md text-sm text-on-surface-variant/80 leading-relaxed">
                  {listing.description}
                </p>
              </div>
            )}

            {/* Storage and Expiry details grid */}
            <div className="grid grid-cols-2 gap-4 border-t border-outline-variant/10 pt-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px] bg-primary/10 p-2 rounded-xl">thermostat</span>
                <div>
                  <p className="text-[11px] text-on-surface-variant/60 font-semibold uppercase tracking-wider">Bảo quản</p>
                  <p className="font-label-sm text-xs text-on-surface font-semibold">{listing.storageConditions || 'Không yêu cầu đặc biệt'}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px] bg-primary/10 p-2 rounded-xl">schedule</span>
                <div>
                  <p className="text-[11px] text-on-surface-variant/60 font-semibold uppercase tracking-wider">Giờ nhận hàng</p>
                  <p className="font-label-sm text-xs text-on-surface font-semibold">
                    {fmtTime(listing.pickupStartTime)} – {fmtTime(listing.pickupEndTime)}
                    {(notYetOpen || windowClosed) && (
                      <span className="ml-1 text-error font-semibold">
                        ({notYetOpen ? 'chưa mở' : 'đã đóng'})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Success QR Code block */}
            {reservationResult ? (
              <div className="flex flex-col items-center gap-5 border-t border-outline-variant/10 pt-5 text-center animate-in fade-in slide-in-from-bottom duration-300">
                <div className="w-full bg-emerald-500/10 text-emerald-700 py-2.5 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm">
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                  Đặt chỗ thành công!
                </div>

                <div className="p-4 bg-white rounded-3xl border border-outline-variant/20 shadow-md">
                  <QRCodeSVG value={reservationResult.qrToken} size={220} level="H" includeMargin />
                </div>

                <div className="space-y-1">
                  <p className="font-label-lg text-sm text-on-surface font-bold">Trình mã QR cho nhà cung cấp</p>
                  <p className="font-label-sm text-xs text-on-surface-variant/80">
                    Hiệu lực đến: {formatVietnamDateTime(reservationResult.qrExpiresAt)}
                  </p>
                </div>

                <div className="w-full flex gap-3">
                  <button
                    onClick={() => router.push('/listings')}
                    className="flex-1 py-2.5 bg-surface-container text-on-surface rounded-xl font-label-lg text-sm font-semibold transition-transform active:scale-[0.98]"
                  >
                    Tiếp tục tìm
                  </button>
                  <button
                    onClick={() => router.push(`/reservations/${reservationResult.reservationId}`)}
                    className="flex-1 py-2.5 bg-primary text-white rounded-xl font-label-lg text-sm font-semibold transition-transform active:scale-[0.98]"
                  >
                    Xem đơn đặt
                  </button>
                </div>
              </div>
            ) : isSoldOut ? (
              <div className="border-t border-outline-variant/10 pt-5">
                <div className="w-full bg-error/10 text-error py-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm">
                  <span className="material-symbols-outlined text-[20px]">block</span>
                  Đã hết phần
                </div>
              </div>
            ) : notYetOpen || windowClosed ? (
              /* Ngoài khung giờ nhận hàng → không hiển thị form đặt */
              <div className="border-t border-outline-variant/10 pt-5">
                <div className="w-full bg-surface-container-high/60 text-on-surface-variant py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm text-center">
                  <span className="material-symbols-outlined text-[20px]">schedule</span>
                  {notYetOpen
                    ? `Chưa đến giờ nhận hàng — đặt được từ ${fmtTime(listing.pickupStartTime)} đến ${fmtTime(listing.pickupEndTime)}`
                    : `Đã quá giờ nhận hàng (đến ${fmtTime(listing.pickupEndTime)})`}
                </div>
              </div>
            ) : (
              /* Booking Form block */
              <div className="flex flex-col gap-5 border-t border-outline-variant/10 pt-5">
                {/* Quantity select */}
                <div className="flex items-center justify-between">
                  <span className="font-label-lg text-sm text-on-surface font-bold">Số lượng muốn nhận</span>
                  <div className="flex items-center gap-4 bg-surface-container rounded-full px-4 py-2 border border-outline-variant/10">
                    <button
                      onClick={handleDecrement}
                      disabled={quantity <= 1}
                      className="w-6 h-6 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[16px] font-bold">remove</span>
                    </button>
                    <span className="font-label-lg text-sm text-on-surface font-bold w-4 text-center">{quantity}</span>
                    <button
                      onClick={handleIncrement}
                      disabled={quantity >= maxQty}
                      className="w-6 h-6 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[16px] font-bold">add</span>
                    </button>
                  </div>
                </div>

                {/* Pickup/Delivery method select */}
                <div className="space-y-3">
                  <span className="font-label-lg text-sm text-on-surface font-bold block">Phương thức nhận hàng</span>
                  <div className="flex flex-col gap-2">
                    <label
                      onClick={() => {
                        if (deliveryMethod !== 'pickup') {
                          setDeliveryMethod('pickup');
                          setShowPickupConfirm(true);
                        }
                      }}
                      className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${deliveryMethod === 'pickup'
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-outline-variant/15 hover:border-primary/40 bg-surface'
                        }`}
                    >
                      <div className="mt-1 flex items-center justify-center">
                        <input
                          type="radio"
                          name="deliveryMethod"
                          checked={deliveryMethod === 'pickup'}
                          onChange={() => {
                            setDeliveryMethod('pickup');
                            setShowPickupConfirm(true);
                          }}
                          className="w-4 h-4 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </div>
                      <div className="flex-1 flex justify-between items-center">
                        <div>
                          <p className="font-label-lg text-sm text-on-surface font-semibold">Tôi sẽ tự đến lấy</p>
                          <p className="text-[11px] text-on-surface-variant/80 mt-[2px]">Nhận trực tiếp tại cửa hàng</p>
                        </div>
                        <span className="material-symbols-outlined text-primary text-[22px] bg-primary/10 p-1.5 rounded-xl">storefront</span>
                      </div>
                    </label>

                    <label
                      onClick={() => setDeliveryMethod('delivery')}
                      className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${deliveryMethod === 'delivery'
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-outline-variant/15 hover:border-primary/40 bg-surface'
                        }`}
                    >
                      <div className="mt-1 flex items-center justify-center">
                        <input
                          type="radio"
                          name="deliveryMethod"
                          checked={deliveryMethod === 'delivery'}
                          onChange={() => setDeliveryMethod('delivery')}
                          className="w-4 h-4 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </div>
                      <div className="flex-1 flex justify-between items-center">
                        <div>
                          <p className="font-label-lg text-sm text-on-surface font-semibold">Cần Tình nguyện viên giao</p>
                          <p className="text-[11px] text-on-surface-variant/80 mt-[2px]">Dành cho người khó di chuyển</p>
                        </div>
                        <span className="material-symbols-outlined text-primary text-[22px] bg-primary/10 p-1.5 rounded-xl">handshake</span>
                      </div>
                    </label>

                    {/* Ảnh bằng chứng khó di chuyển — bắt buộc khi cần TNV giao.
                        Shipper xem ảnh này trong popup lời mời rồi mới quyết định nhận. */}
                    {deliveryMethod === 'delivery' && (
                      <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 space-y-2">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                          <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                          Ảnh bằng chứng khó di chuyển <span className="text-rose-500">*</span>
                        </p>
                        <p className="text-[11px] leading-relaxed text-amber-800">
                          Chụp giấy khám bệnh, ảnh chấn thương (bó bột, gãy chân…) hoặc bằng chứng
                          tương tự. Tình nguyện viên sẽ xem ảnh này trước khi nhận đơn giao.
                        </p>
                        <input
                          id="delivery-evidence-input"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            setEvidenceFile(file);
                            setEvidencePreview(URL.createObjectURL(file));
                          }}
                        />
                        <div className="flex items-center gap-3">
                          {evidencePreview ? (
                            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-amber-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={evidencePreview} alt="Ảnh bằng chứng" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => { setEvidenceFile(null); setEvidencePreview(null); }}
                                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                                aria-label="Xoá ảnh"
                              >
                                <span className="material-symbols-outlined text-[13px]">close</span>
                              </button>
                            </div>
                          ) : null}
                          <label
                            htmlFor="delivery-evidence-input"
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                          >
                            <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
                            {evidenceFile ? 'Đổi ảnh khác' : 'Chụp / tải ảnh'}
                          </label>
                          {evidenceFile && (
                            <span className="min-w-0 truncate text-[11px] font-semibold text-amber-900">
                              {evidenceFile.name}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Điểm giao: mặc định lấy địa chỉ hồ sơ, nhưng người khó di chuyển
                        thường đang ở bệnh viện / nhà người thân nên cho ghim chỗ khác. */}
                    {deliveryMethod === 'delivery' && (
                      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-high/30 p-4 space-y-3">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-on-surface">
                          <span className="material-symbols-outlined text-[16px]">pin_drop</span>
                          Điểm giao hàng
                        </p>

                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="radio"
                            name="destination-mode"
                            checked={!useCustomDestination}
                            onChange={() => setUseCustomDestination(false)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-on-surface">Địa chỉ trong hồ sơ</span>
                            <span className="block truncate text-[11px] text-on-surface-variant">
                              {me?.receiver?.address || 'Hồ sơ chưa có địa chỉ — hãy chọn trên bản đồ'}
                            </span>
                          </span>
                        </label>

                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="radio"
                            name="destination-mode"
                            checked={useCustomDestination}
                            onChange={() => {
                              setUseCustomDestination(true);
                              // Mở bản đồ ở địa chỉ hồ sơ nếu có, không thì mặc định TP.HCM.
                              if (destLng == null || destLat == null) {
                                setDestLng(me?.receiver?.lng ?? 106.6297);
                                setDestLat(me?.receiver?.lat ?? 10.8231);
                              }
                            }}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-on-surface">Giao tới địa điểm khác</span>
                            <span className="block text-[11px] text-on-surface-variant">
                              Đang nằm viện, ở nhà người thân… — ghim đúng chỗ để tình nguyện viên tìm được
                            </span>
                          </span>
                        </label>

                        {useCustomDestination && (
                          <div className="space-y-2">
                            <button
                              type="button"
                              disabled={locatingDest}
                              onClick={() => {
                                if (typeof navigator === 'undefined' || !navigator.geolocation) {
                                  toast.error('Trình duyệt này không hỗ trợ định vị.');
                                  return;
                                }
                                setLocatingDest(true);
                                navigator.geolocation.getCurrentPosition(
                                  async ({ coords }) => {
                                    setDestLng(coords.longitude);
                                    setDestLat(coords.latitude);
                                    const found = await reverseGeocode(coords.latitude, coords.longitude);
                                    if (found) setDestAddress(found);
                                    setLocatingDest(false);
                                    toast.success('Đã ghim vị trí hiện tại của bạn.');
                                  },
                                  () => {
                                    setLocatingDest(false);
                                    toast.error('Không lấy được vị trí. Hãy ghim thủ công trên bản đồ.');
                                  },
                                  { enableHighAccuracy: true, timeout: 12_000 },
                                );
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-xs font-bold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                            >
                              <span className={`material-symbols-outlined text-[16px] ${locatingDest ? 'animate-spin' : ''}`}>
                                {locatingDest ? 'progress_activity' : 'my_location'}
                              </span>
                              {locatingDest ? 'Đang xác định…' : 'Dùng vị trí hiện tại'}
                            </button>

                            <input
                              value={destAddress}
                              onChange={(e) => setDestAddress(e.target.value)}
                              placeholder="Ví dụ: BV Đa khoa Khánh Hoà, Khoa Nội, giường 12"
                              maxLength={500}
                              className="w-full rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                            <p className="text-[11px] text-on-surface-variant">
                              Bấm hoặc kéo ghim trên bản đồ để chỉnh chính xác vị trí.
                            </p>
                            <div className="h-56 overflow-hidden rounded-xl border border-outline-variant/30">
                              <LocationPicker
                                lng={destLng ?? 106.6297}
                                lat={destLat ?? 10.8231}
                                address={destAddress}
                                onPick={(lng, lat, addr) => {
                                  setDestLng(lng);
                                  setDestLat(lat);
                                  if (addr) setDestAddress(addr);
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Limit info box */}
                <div className="flex gap-3 bg-surface-container-high/40 p-4 rounded-2xl border border-outline-variant/10 text-on-surface-variant text-xs">
                  <span className="material-symbols-outlined text-primary shrink-0">info</span>
                  <p className="leading-relaxed">
                    <strong>Tối đa {listing.maxPerReservation} phần / đơn.</strong> Hãy cùng chia sẻ cơ hội cho mọi người nhé!
                  </p>
                </div>

                {/* Confirm Button */}
                <div className="space-y-2">
                  <button
                    onClick={handlePreOrder}
                    disabled={createReservation.isPending || uploadingEvidence}
                    className="w-full py-3 bg-primary text-white rounded-xl font-label-lg text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createReservation.isPending || uploadingEvidence ? (
                      <>
                        <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'wght' 600" }}>shopping_bag</span>
                        Yêu cầu Đặt trước
                      </>
                    )}
                  </button>
                  <p className="text-center text-[10px] text-on-surface-variant/70 italic">
                    {deliveryMethod === 'delivery'
                      ? '* Bạn vẫn có mã QR để đối chiếu khi nhận hàng; shipper sẽ nhận lời mời nếu đang ở gần điểm lấy.'
                      : '* Đơn tự đến lấy sẽ không hiện ở màn Đơn cần giao của shipper.'}
                  </p>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* "Có thể bạn cũng quan tâm" - dữ liệu thật (chỉ cho non-provider) */}
      {!isProvider && related.length > 0 && (
        <section className="space-y-4 pt-4 border-t border-outline-variant/10">
          <h3 className="font-headline-md text-lg text-on-surface font-bold">Có thể bạn cũng quan tâm</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            {related.map((item) => (
              <div
                key={item.id}
                onClick={() => router.push(`/listings/${item.id}`)}
                className="bg-surface rounded-2xl border border-outline-variant/15 overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col"
              >
                <div className="relative h-40 bg-surface-container">
                  <img
                    src={
                      (item.imageUrls[0] && ![
                        '/banh-mi-ngot-thap-cam.png', '/com-ga-hoi-an.png', '/food_salad.png', 
                        '/banh-mi-lua-mach-tuoi.png', '/food_bread.png', '/food_lunchbox.png'
                      ].includes(item.imageUrls[0]))
                        ? mediaUrl(item.imageUrls[0])
                        : fallbackImage(item.category)
                    }
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-2 left-2 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-full">Miễn phí</span>
                </div>
                <div className="p-3 flex-1 flex flex-col justify-between gap-1">
                  <div>
                    <h4 className="font-label-lg text-sm text-on-surface font-semibold line-clamp-1">{item.title}</h4>
                    <p className="text-[11px] text-on-surface-variant/80">{item.provider.businessName}</p>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-on-surface-variant/70 mt-2">
                    <span>Còn {item.quantityRemaining} {UNIT_LABEL[item.quantityUnit as QuantityUnit] ?? item.quantityUnit}</span>
                    <span>• {formatDistance(item.distanceM)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Popup xác nhận đặt trước */}
      {showPickupConfirm && !isOwnerProvider && (
        <PickupConfirmPopup
          listing={listing}
          quantity={quantity}
          onConfirm={() => {
            setShowPickupConfirm(false);
            handlePreOrder();
          }}
          onCancel={() => {
            setShowPickupConfirm(false);
          }}
        />
      )}

      {/* Popup thông tin thời gian nhận hàng - tự động hiện khi vào trang */}
      {showTimeInfo && !isOwnerProvider && !isSoldOut && !reservationResult && (
        <TimeInfoPopup
          listing={listing}
          onClose={() => setShowTimeInfo(false)}
        />
      )}
    </div>
  );
}

/**
 * Panel quản lý cho Provider khi xem bài đăng của chính mình.
 * Hiển thị trạng thái + các thao tác: Sửa nhanh, Huỷ / Đăng lại, Nhân bản.
 */
function ProviderManagementPanel({
  listing,
  onPublish,
  onCancel,
  onDuplicate,
  publishing,
  cancelling,
  duplicating,
}: {
  listing: ListingDetail;
  onPublish: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  publishing: boolean;
  cancelling: boolean;
  duplicating: boolean;
}) {
  const STATUS_META: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Bản nháp', cls: 'bg-neutral-100 text-neutral-700' },
    active: { label: 'Đang mở', cls: 'bg-emerald-100 text-emerald-800' },
    fully_reserved: { label: 'Đã hết suất', cls: 'bg-amber-100 text-amber-800' },
    completed: { label: 'Đã hoàn tất', cls: 'bg-blue-100 text-blue-800' },
    expired: { label: 'Đã hết hạn', cls: 'bg-neutral-200 text-neutral-700' },
    cancelled: { label: 'Đã huỷ', cls: 'bg-rose-100 text-rose-700' },
  };
  const statusMeta = STATUS_META[listing.status] ?? { label: listing.status, cls: 'bg-neutral-100 text-neutral-700' };
  const remaining = listing.quantityRemaining;
  const total = remaining; // ListingDetail chỉ trả về remaining; total chỉ có ở ProviderListing view
  const unit = UNIT_LABEL[listing.quantityUnit as QuantityUnit] ?? listing.quantityUnit;
  const fmtTime = formatVietnamTime;
  const fmtDate = formatVietnamDate;
  const isExpiringSoon = new Date(listing.pickupEndTime).getTime() - Date.now() < 4 * 60 * 60 * 1000;
  const isClosed = ['completed', 'expired', 'cancelled'].includes(listing.status);

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-3xl p-6 shadow-sm flex flex-col gap-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${statusMeta.cls}`}>
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
            {statusMeta.label}
          </span>
          <span className="text-[11px] text-on-surface-variant/70 italic">Bài đăng của bạn</span>
        </div>
        <h2 className="font-headline-md text-headline-md text-on-surface leading-tight font-bold">
          {listing.title}
        </h2>
        <p className="font-body-md text-sm text-on-surface-variant/80">
          Đây là góc nhìn chi tiết dành cho chủ cửa hàng — người nhận không thể đặt chỗ bài đăng này.
        </p>
      </div>

      {/* Thống kê nhanh */}
      <div className="grid grid-cols-2 gap-3 border-t border-outline-variant/10 pt-4">
        <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/60 p-3">
          <p className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant/60">Còn lại</p>
          <p className="text-xl font-extrabold text-on-surface tabular-nums">
            {remaining}
            <span className="text-xs font-medium text-on-surface-variant/80 ml-1"> {unit} còn lại</span>
          </p>
        </div>
        <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/60 p-3">
          <p className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant/60">Trạng thái</p>
          <p className="text-base font-bold text-on-surface mt-1">
            {statusMeta.label}
            {isExpiringSoon && listing.status === 'active' && (
              <span className="text-amber-600 text-xs font-semibold ml-1">· sắp hết giờ</span>
            )}
          </p>
        </div>
      </div>

      {/* Thông tin chi tiết */}
      <div className="space-y-3 border-t border-outline-variant/10 pt-4 text-sm">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-primary text-[18px] mt-0.5 shrink-0">place</span>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant/60">Điểm nhận hàng</p>
            <p className="text-on-surface">{listing.pickupAddress}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-primary text-[18px] mt-0.5 shrink-0">schedule</span>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant/60">Khung giờ nhận</p>
            {/* Mốc đầu/cuối thường khác NGÀY nhưng trùng giờ (vd 20:50 hôm nay → 20:50 mai).
                In gộp một ngày sẽ ra "20:50–20:50" trông như khung rỗng. */}
            <p className="text-on-surface">
              {isSameVietnamDate(listing.pickupStartTime, listing.pickupEndTime) ? (
                <>
                  {fmtDate(listing.pickupStartTime)} · {fmtTime(listing.pickupStartTime)}–{fmtTime(listing.pickupEndTime)}
                </>
              ) : (
                <>
                  Từ {fmtDate(listing.pickupStartTime)} {fmtTime(listing.pickupStartTime)}
                  {' → '}
                  {fmtDate(listing.pickupEndTime)} {fmtTime(listing.pickupEndTime)}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-primary text-[18px] mt-0.5 shrink-0">category</span>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant/60">Danh mục</p>
            <p className="text-on-surface">{CATEGORIES[listing.category] ?? listing.category}</p>
          </div>
        </div>
        {listing.storageConditions && (
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-primary text-[18px] mt-0.5 shrink-0">thermostat</span>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant/60">Bảo quản</p>
              <p className="text-on-surface">{listing.storageConditions}</p>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="space-y-2 border-t border-outline-variant/10 pt-4">
        {listing.status === 'draft' ? (
          <button
            onClick={onPublish}
            disabled={publishing}
            className="w-full py-2.5 bg-primary text-white rounded-xl font-label-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
            {publishing ? 'Đang đăng...' : 'Đăng bài ngay'}
          </button>
        ) : !isClosed ? (
          <>
            <button
              onClick={onCancel}
              disabled={cancelling}
              className="w-full py-2.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl font-label-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              {cancelling ? 'Đang huỷ...' : 'Huỷ bài đăng'}
            </button>
            <p className="text-[11px] text-on-surface-variant/70 text-center italic">
              * Bài đăng đã có người đặt — huỷ sẽ hoàn lại suất cho người nhận.
            </p>
          </>
        ) : (
          <button
            onClick={onDuplicate}
            disabled={duplicating}
            className="w-full py-2.5 bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 rounded-xl font-label-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">content_copy</span>
            {duplicating ? 'Đang tạo...' : 'Đăng lại (nhân bản thành bản nháp mới)'}
          </button>
        )}

        <Link
          href="/provider"
          className="w-full py-2.5 bg-surface-container text-on-surface rounded-xl font-label-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Quay lại bảng điều khiển
        </Link>
      </div>
    </div>
  );
}

// Popup xác nhận khi chọn "Tôi sẽ tự đến lấy"
function PickupConfirmPopup({
  listing,
  quantity,
  onConfirm,
  onCancel,
}: {
  listing: ListingDetail;
  quantity: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const unit = UNIT_LABEL[listing.quantityUnit as QuantityUnit] ?? listing.quantityUnit;
  const now = Date.now();
  /** Khớp system_configs QR_VALIDITY_MINUTES — QR chỉ sống 30 phút KỂ TỪ LÚC ĐẶT. */
  const qrValidityMs = 30 * 60 * 1000;

  // Đặt xong là đi lấy được NGAY (hoặc chờ tới giờ mở cửa nếu chưa mở) — không
  // có lý do đẩy giờ nhận lên +30 phút như bản cũ.
  const pickupStartTime = new Date(listing.pickupStartTime).getTime();
  const pickupEndTime = new Date(listing.pickupEndTime).getTime();
  const effectiveStartTime = Math.max(now, pickupStartTime);

  // Hạn phải có mặt = QR hết hạn = BÂY GIỜ + 30 phút (bản cũ lấy nhầm
  // "giờ đóng cửa − 30 phút", ra mốc chẳng liên quan tới lúc người dùng đặt).
  // Không vượt quá giờ đóng cửa: sát giờ đóng thì mốc chính là giờ đóng.
  const deadlineToArrive = Math.min(now + qrValidityMs, pickupEndTime);
  // Gấp khi cửa hàng sắp đóng trước cả khi QR hết hạn.
  const isUrgent = pickupEndTime < now + qrValidityMs;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[10vh] px-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0 rounded-t-2xl">
          <button onClick={onCancel} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[18px]">close</span>
          </button>
          <div className="flex items-center gap-3 pr-8">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isUrgent ? 'bg-amber-500/30' : 'bg-white/20'}`}>
              <span className="material-symbols-outlined text-white text-[18px]">storefront</span>
            </div>
            <h3 className="font-extrabold text-white text-base">Xác nhận đặt trước</h3>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="px-5 py-4 space-y-3">
            {/* Thông tin đơn hàng */}
            <div className="bg-neutral-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Món</span>
                <span className="text-sm font-bold text-neutral-900">{listing.title}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Số lượng</span>
                <span className="text-sm font-bold text-neutral-900">
                  {quantity} {unit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Giờ nhận hàng</span>
                <span className="text-sm font-bold text-neutral-900">
                  {formatVietnamTime(effectiveStartTime)} - {formatVietnamTime(pickupEndTime)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Địa điểm</span>
                <span className="text-sm font-bold text-neutral-900 text-right max-w-[200px]">{listing.pickupAddress}</span>
              </div>
            </div>

            {/* Cảnh báo thời gian */}
            <div className={`flex items-start gap-3 p-4 rounded-2xl ${isUrgent ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`}>
              <span className={`material-symbols-outlined text-[20px] ${isUrgent ? 'text-rose-600' : 'text-amber-600'}`}>
                schedule
              </span>
              <div className="flex-1">
                {isUrgent ? (
                  <>
                    <p className="text-sm font-bold text-rose-700">⚠️ Sắp hết giờ nhận hàng!</p>
                    <p className="text-xs text-rose-600 mt-1">
                      Cửa hàng đóng lúc {formatVietnamTime(deadlineToArrive)} — bạn cần đến trước giờ đó.
                      Nếu không, đơn sẽ chuyển cho người khác và bạn bị trừ điểm uy tín.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-amber-700">Lưu ý về thời gian</p>
                    <p className="text-xs text-amber-600 mt-1">
                      Mã QR có hiệu lực <b>30 phút</b> kể từ khi đặt — bạn cần đến trước{' '}
                      {formatVietnamTime(deadlineToArrive)} để nhận hàng. Không đến đúng giờ sẽ bị trừ điểm uy tín.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-neutral-100 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            Đóng
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl text-sm font-bold text-white transition-colors ${isUrgent ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          >
            Xác nhận đặt
          </button>
        </div>
      </div>
    </div>
  );
}

// Popup thông tin thời gian nhận hàng - tự động hiện khi vào trang
function TimeInfoPopup({
  listing,
  onClose,
}: {
  listing: ListingDetail;
  onClose: () => void;
}) {
  const now = Date.now();
  /** Khớp system_configs QR_VALIDITY_MINUTES — QR sống 30 phút kể từ lúc đặt. */
  const qrValidityMs = 30 * 60 * 1000;

  // pickupStartTime và pickupEndTime từ listing (mỗi tin đăng khác nhau)
  const pickupStartTime = new Date(listing.pickupStartTime).getTime();
  const pickupEndTime = new Date(listing.pickupEndTime).getTime();

  // Thời hạn đến = QR hết hạn = bây giờ + 30 phút, nhưng không quá giờ đóng cửa
  // (chưa đến trước mốc này thì đơn tự huỷ để dành suất cho người khác).
  const deadlineToArrive = Math.min(now + qrValidityMs, pickupEndTime);
  // Gấp khi cửa hàng đóng trước cả khi QR hết hạn. Bản cũ so 30p < 30p nên
  // không bao giờ true — cảnh báo đỏ chưa từng hiện.
  const isUrgent = pickupEndTime < now + qrValidityMs;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0 rounded-t-2xl">
          <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[18px]">close</span>
          </button>
          <div className="flex items-center gap-3 pr-8">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-[18px]">schedule</span>
            </div>
            <h3 className="font-extrabold text-white text-base">Thông tin nhận hàng</h3>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="px-5 py-4 space-y-3">
            {/* Thông tin thời gian */}
            <div className="bg-neutral-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Giờ nhận hàng</span>
                <span className="text-sm font-bold text-neutral-900">
                  {formatVietnamTime(pickupStartTime)} - {formatVietnamTime(pickupEndTime)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Thời hạn đến</span>
                <span className="text-sm font-bold text-rose-600">
                  Trước {formatVietnamTime(deadlineToArrive)}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-sm text-neutral-500">Địa điểm</span>
                <span className="text-sm font-bold text-neutral-900 text-right flex-1">{listing.pickupAddress}</span>
              </div>
            </div>

            {/* Cảnh báo thời gian */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <span className="material-symbols-outlined text-[20px] text-amber-600 shrink-0">
                warning
              </span>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-700">Lưu ý quan trọng</p>
                <p className="text-xs text-amber-600 mt-1 leading-relaxed">
                  Nếu bạn không đến nhận trước <strong>{formatVietnamTime(deadlineToArrive)}</strong>, đơn đặt sẽ tự động bị hủy để dành suất cho người khác. Bạn cũng sẽ bị trừ điểm uy tín.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-neutral-100">
          <button
            onClick={onClose}
            className="w-full py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}
