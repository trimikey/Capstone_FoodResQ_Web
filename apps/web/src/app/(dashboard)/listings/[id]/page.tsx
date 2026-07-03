'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useListing, useListings } from '@/hooks/useListings';
import { useCreateReservation } from '@/hooks/useReservation';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

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
  bakery: '/banh-mi-ngot-thap-cam.png',
  cooked_meal: '/com-ga-hoi-an.png',
  fresh_fruit: '/food_salad.png',
  vegetables: '/food_salad.png',
};

function fallbackImage(category: string): string {
  return CATEGORY_FALLBACK_IMAGE[category] ?? '/banh-mi-lua-mach-tuoi.png';
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export default function ListingDetailPage({ params }: Props) {
  const router = useRouter();
  const { id } = React.use(params);

  const { data: listing, isLoading, isError } = useListing(id);
  const createReservation = useCreateReservation();

  // Gợi ý "có thể bạn quan tâm" — listing thật gần trung tâm, loại trừ chính nó
  const { data: nearby } = useListings({ lat: 10.8231, lng: 106.6297, radiusKm: 10 });
  const related = (nearby ?? []).filter((l) => l.id !== id).slice(0, 4);

  const [quantity, setQuantity] = useState(1);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [reservationResult, setReservationResult] = useState<{
    reservationId: string;
    qrToken: string;
    qrExpiresAt: string;
  } | null>(null);

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
    try {
      const res = await createReservation.mutateAsync({
        listingId: id,
        quantity,
        requestDelivery: deliveryMethod === 'delivery',
      });
      setReservationResult({
        reservationId: res.reservationId,
        qrToken: res.qrToken,
        qrExpiresAt: res.qrExpiresAt,
      });
      toast.success('Đặt chỗ thành công! Đang chuyển hướng đến trang theo dõi...');
      setTimeout(() => {
        router.push(`/reservations/${res.reservationId}`);
      }, 1500);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Đặt chỗ thất bại';
      toast.error(msg);
    }
  };

  const dateObj = new Date(listing.pickupEndTime);
  const formattedEndTime = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
  const isSoldOut = listing.quantityRemaining <= 0;

  return (
    <div className="min-h-full bg-surface py-8 px-4 sm:px-8 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-on-surface-variant/70">
        <Link href="/listings" className="hover:text-primary transition-colors">Trang chủ</Link>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="capitalize">{CATEGORIES[listing.category] || listing.category}</span>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="text-on-surface font-semibold truncate max-w-[200px]">{listing.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Product Image & Details */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="relative rounded-3xl overflow-hidden aspect-[4/3] bg-surface-container shadow-md border border-outline-variant/10 group">
            <img
              src={listing.imageUrls[0] || fallbackImage(listing.category)}
              alt={listing.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute top-4 left-4 flex gap-2">
              <span className="bg-black/50 backdrop-blur-md text-white font-label-lg px-4 py-2 rounded-full">
                Còn {listing.quantityRemaining} {listing.quantityUnit}
              </span>
              <span className="bg-primary/95 text-white font-label-lg px-4 py-2 rounded-full shadow-sm">
                Cứu trợ 0đ
              </span>
              {listing.isSurpriseBag && (
                <span className="bg-honey-500/95 text-white font-label-lg px-4 py-2 rounded-full shadow-sm inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-[18px]">redeem</span> Túi bất ngờ
                </span>
              )}
            </div>
          </div>

          {/* Three Selling points pills */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 p-4 bg-surface-container-low rounded-2xl border border-outline-variant/15 text-center sm:text-left transition-colors hover:bg-surface-container-high/40">
              <span className="material-symbols-outlined text-primary text-[28px]">eco</span>
              <div>
                <p className="font-label-lg text-sm text-on-surface font-semibold">Giảm lãng phí</p>
                <p className="text-[11px] text-on-surface-variant/70 hidden sm:block">Cứu thực phẩm dư</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 p-4 bg-surface-container-low rounded-2xl border border-outline-variant/15 text-center sm:text-left transition-colors hover:bg-surface-container-high/40">
              <span className="material-symbols-outlined text-primary text-[28px]">schedule</span>
              <div>
                <p className="font-label-lg text-sm text-on-surface font-semibold">Nhận trước</p>
                <p className="text-[11px] text-on-surface-variant/70 hidden sm:block">{formattedEndTime}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 p-4 bg-surface-container-low rounded-2xl border border-outline-variant/15 text-center sm:text-left transition-colors hover:bg-surface-container-high/40">
              <span className="material-symbols-outlined text-primary text-[28px]">volunteer_activism</span>
              <div>
                <p className="font-label-lg text-sm text-on-surface font-semibold">Yêu thương</p>
                <p className="text-[11px] text-on-surface-variant/70 hidden sm:block">Kết nối cộng đồng</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Reservation Form / QR */}
        <div className="lg:col-span-5 flex flex-col gap-6">
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
                  <p className="font-label-sm text-xs text-on-surface font-semibold">{listing.storageConditions || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px] bg-primary/10 p-2 rounded-xl">warning</span>
                <div>
                  <p className="text-[11px] text-on-surface-variant/60 font-semibold uppercase tracking-wider">Dị ứng</p>
                  <p className="font-label-sm text-xs text-on-surface font-semibold">{listing.allergenNotes || 'Không'}</p>
                </div>
              </div>
            </div>

            {/* Success QR Code block */}
            {reservationResult ? (
              <div className="flex flex-col items-center gap-5 border-t border-outline-variant/10 pt-5 text-center animate-in fade-in slide-in-from-bottom duration-300">
                <div className="w-full bg-emerald-500/10 text-emerald-700 py-3 rounded-2xl flex items-center justify-center gap-2 font-semibold">
                  <span className="material-symbols-outlined">check_circle</span>
                  Đặt chỗ thành công!
                </div>

                <div className="p-4 bg-white rounded-3xl border border-outline-variant/20 shadow-md">
                  <QRCodeSVG value={reservationResult.qrToken} size={220} level="H" includeMargin />
                </div>

                <div className="space-y-1">
                  <p className="font-label-lg text-sm text-on-surface font-bold">Trình mã QR cho nhà cung cấp</p>
                  <p className="font-label-sm text-xs text-on-surface-variant/80">
                    Hiệu lực đến: {new Date(reservationResult.qrExpiresAt).toLocaleString('vi-VN')}
                  </p>
                </div>

                <div className="w-full flex gap-3">
                  <button
                    onClick={() => router.push('/listings')}
                    className="flex-1 py-3 bg-surface-container text-on-surface rounded-2xl font-label-lg text-sm font-semibold transition-transform active:scale-[0.98]"
                  >
                    Tiếp tục tìm
                  </button>
                  <button
                    onClick={() => router.push('/reservations')}
                    className="flex-1 py-3 bg-primary text-white rounded-2xl font-label-lg text-sm font-semibold transition-transform active:scale-[0.98]"
                  >
                    Xem đơn đặt
                  </button>
                </div>
              </div>
            ) : isSoldOut ? (
              <div className="border-t border-outline-variant/10 pt-5">
                <div className="w-full bg-error/10 text-error py-4 rounded-2xl flex items-center justify-center gap-2 font-semibold">
                  <span className="material-symbols-outlined">block</span>
                  Đã hết phần
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
                      onClick={() => setDeliveryMethod('pickup')}
                      className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                        deliveryMethod === 'pickup'
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-outline-variant/15 hover:border-primary/40 bg-surface'
                      }`}
                    >
                      <div className="mt-1 flex items-center justify-center">
                        <input
                          type="radio"
                          name="deliveryMethod"
                          checked={deliveryMethod === 'pickup'}
                          onChange={() => setDeliveryMethod('pickup')}
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
                      className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                        deliveryMethod === 'delivery'
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
                    disabled={createReservation.isPending}
                    className="w-full py-4 bg-primary text-white rounded-2xl font-label-lg text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createReservation.isPending ? (
                      <>
                        <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 600" }}>shopping_bag</span>
                        Yêu cầu Đặt trước
                      </>
                    )}
                  </button>
                  <p className="text-center text-[10px] text-on-surface-variant/70 italic">
                    * Bạn sẽ nhận được mã QR để nhận hàng tại cửa hàng.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* "Có thể bạn cũng quan tâm" - dữ liệu thật */}
      {related.length > 0 && (
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
                    src={item.imageUrls[0] || fallbackImage(item.category)}
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
                    <span>Còn {item.quantityRemaining} {item.quantityUnit}</span>
                    <span>• {formatDistance(item.distanceM)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
