'use client';

import { useMemo, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  Truck,
  User,
  XCircle,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Download,
  QrCode,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  useProviderOrder,
  useProviderCancelReservation,
} from '@/hooks/useProviderListings';
import { UNIT_LABEL } from '@/lib/utils';
import { QuantityUnit } from '@foodresq/types';
import { SafeImage } from '@/components/shared/SafeImage';
import ProviderHeaderCard from '@/components/provider/ProviderHeaderCard';
import CancelReservationModal from '@/components/reservations/CancelReservationModal';

const STATUS_META: Record<
  string,
  {
    label: string;
    badge: string;
    bar: string;
    description: string;
    icon: any;
    tone: string;
    group: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  }
> = {
  pending: {
    label: 'Chờ xác nhận',
    badge: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-400',
    description: 'Đơn đang chờ provider xác nhận.',
    icon: Clock,
    tone: 'amber',
    group: 'pending',
  },
  confirmed: {
    label: 'Đã xác nhận',
    badge: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-400',
    description: 'Đã xác nhận — người nhận có thể đến lấy trong khung giờ pickup.',
    icon: CheckCircle2,
    tone: 'emerald',
    group: 'confirmed',
  },
  picked_up: {
    label: 'Đã lấy hàng',
    badge: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-400',
    description: 'Đã lấy hàng, đang chờ xác minh giao đúng người.',
    icon: Package,
    tone: 'amber',
    group: 'confirmed',
  },
  in_transit: {
    label: 'Đang giao',
    badge: 'bg-sky-100 text-sky-700',
    bar: 'bg-sky-400',
    description: 'Đơn giao (shipper) đang trên đường vận chuyển.',
    icon: Truck,
    tone: 'sky',
    group: 'confirmed',
  },
  completed: {
    label: 'Hoàn thành',
    badge: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-500',
    description: 'Đã hoàn tất — cảm ơn bạn đã giúp giảm lãng phí thực phẩm.',
    icon: CheckCircle2,
    tone: 'emerald',
    group: 'completed',
  },
  cancelled: {
    label: 'Đã hủy',
    badge: 'bg-neutral-100 text-neutral-500',
    bar: 'bg-neutral-300',
    description: 'Đơn đã được hủy.',
    icon: XCircle,
    tone: 'neutral',
    group: 'cancelled',
  },
  expired: {
    label: 'Hết hạn',
    badge: 'bg-neutral-100 text-neutral-500',
    bar: 'bg-neutral-300',
    description: 'Đơn đã quá hạn nhận (QR hết hạn).',
    icon: AlertTriangle,
    tone: 'neutral',
    group: 'cancelled',
  },
  no_show: {
    label: 'Không đến',
    badge: 'bg-rose-100 text-rose-700',
    bar: 'bg-rose-400',
    description: 'Người nhận không đến lấy — đã phạt trust và hoàn stock.',
    icon: AlertTriangle,
    tone: 'rose',
    group: 'cancelled',
  },
};

const FALLBACK_IMAGE: Record<string, string> = {
  bakery: '/food_bread.png',
  cooked_meal: '/food_lunchbox.png',
  fresh_fruit: '/food_salad.png',
  vegetables: '/food_salad.png',
};

const DELIVERY_STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending_assignment: { label: 'Đang tìm shipper', tone: 'amber' },
  assigned: { label: 'Đã phân công shipper', tone: 'sky' },
  heading_to_provider: { label: 'Shipper đang đến lấy', tone: 'sky' },
  qc_completed: { label: 'Đã QC, đang giao', tone: 'sky' },
  in_transit: { label: 'Đang giao', tone: 'sky' },
  delivered: { label: 'Đã giao', tone: 'emerald' },
  failed: { label: 'Giao thất bại', tone: 'rose' },
  cancelled: { label: 'Đã hủy giao', tone: 'neutral' },
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

interface PageProps {
  // Next.js 15: `params` là Promise, cần dùng `use()` để unwrap.
  params: Promise<{ id: string }>;
}

export default function ProviderOrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: order, isLoading, isError, refetch } = useProviderOrder(id);
  const [cancelOpen, setCancelOpen] = useState(false);

  const meta = order ? STATUS_META[order.status] : undefined;
  const canCancel = order ? ['pending', 'confirmed'].includes(order.status) : false;
  const cancelMutation = useProviderCancelReservation();

  const qtyLabel = useMemo(() => {
    if (!order) return '';
    const unit = UNIT_LABEL[order.listing.quantityUnit as QuantityUnit] ?? order.listing.quantityUnit;
    return `${order.quantity} ${unit}`;
  }, [order]);

  if (!order && isLoading) {
    return (
      <div className="flex-1 min-w-0 bg-[#FAFBF9]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 lg:px-10 py-6 md:py-10 space-y-6">
          <div className="h-32 bg-white rounded-3xl border border-neutral-100 shimmer" />
          <div className="h-40 bg-white rounded-3xl border border-neutral-100 shimmer" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="h-72 bg-white rounded-2xl border border-neutral-100 shimmer lg:col-span-2" />
            <div className="h-72 bg-white rounded-2xl border border-neutral-100 shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="flex-1 min-w-0 bg-gradient-to-br from-rose-50 via-[#FAFBF9] to-[#FAFBF9]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 lg:px-10 py-10 md:py-16">
          <div className="relative bg-white rounded-3xl border border-neutral-100 p-10 text-center shadow-sm overflow-hidden">
            <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-rose-200/30 blur-3xl" />
            <div className="relative">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-rose-100 to-rose-200 flex items-center justify-center shadow-inner">
                <AlertTriangle className="text-rose-500" size={36} />
              </div>
              <p className="font-extrabold text-neutral-800 mt-5 text-lg">
                Không tải được chi tiết đơn
              </p>
              <p className="text-sm text-neutral-500 mt-2 max-w-sm mx-auto">
                Có thể đơn không tồn tại, đã bị xoá hoặc phiên đăng nhập đã hết hạn.
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  onClick={() => refetch()}
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-sm font-semibold shadow-md shadow-emerald-200 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  Thử lại
                </button>
                <Link
                  href="/provider/orders"
                  className="px-5 py-2.5 rounded-full bg-white border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 shadow-sm transition-all"
                >
                  Quay lại danh sách
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const code = order.id.slice(0, 8).toUpperCase();
  const cover = order.listing.imageUrls?.[0] || FALLBACK_IMAGE[order.listing.category] || '/food_salad.png';
  const StatusIcon = meta?.icon ?? Clock;

  const deliveryMeta = order.delivery ? DELIVERY_STATUS_LABEL[order.delivery.status] : undefined;

  // Gradient + decoration theo tone (giúp hero "sinh động")
  const TONE_BG: Record<string, string> = {
    emerald: 'from-emerald-50 via-emerald-50/60 to-white',
    amber: 'from-amber-50 via-amber-50/60 to-white',
    sky: 'from-sky-50 via-sky-50/60 to-white',
    rose: 'from-rose-50 via-rose-50/60 to-white',
    neutral: 'from-neutral-50 via-white to-white',
  };
  const TONE_GLOW: Record<string, string> = {
    emerald: 'bg-emerald-200/40',
    amber: 'bg-amber-200/40',
    sky: 'bg-sky-200/40',
    rose: 'bg-rose-200/40',
    neutral: 'bg-neutral-200/40',
  };
  const toneBg = TONE_BG[meta?.tone ?? 'neutral'] ?? TONE_BG.neutral;
  const toneGlow = TONE_GLOW[meta?.tone ?? 'neutral'] ?? TONE_GLOW.neutral;

  return (
    <div className="flex-1 min-w-0 bg-[#FAFBF9]">
      <div className="max-w-5xl mx-auto px-4 md:px-8 lg:px-10 py-6 md:py-10 space-y-6">
        <ProviderHeaderCard
          eyebrow="Theo dõi đơn"
          title={`Đơn #${code}`}
          description={order.listing.title}
          crumbs={[
            { label: 'Trang chủ', href: '/provider' },
            { label: 'Đơn hàng', href: '/provider/orders' },
            { label: `#${code}` },
          ]}
          cta={
            <>
              <Link
                href="/provider/orders"
                className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2.5 bg-white rounded-full border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-700 transition-colors shadow-sm hover:shadow hover:-translate-y-0.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Danh sách đơn
              </Link>
              {meta?.group === 'confirmed' && (
                <Link
                  href="/provider/scan"
                  className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-full text-sm font-semibold shadow-md shadow-emerald-200 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
                  Mở máy quét QR
                </Link>
              )}
            </>
          }
        />

        {/* Status hero — gradient + decorative blobs + ring glow */}
        <section
          className={`relative overflow-hidden rounded-3xl border border-neutral-100 bg-gradient-to-br ${toneBg} p-6 md:p-8 shadow-sm`}
        >
          {/* Decorative blurred blobs */}
          <div className={`pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full ${toneGlow} blur-3xl`} />
          <div className={`pointer-events-none absolute -bottom-20 -left-10 w-48 h-48 rounded-full ${toneGlow} blur-3xl opacity-70`} />
          {/* Subtle grid pattern */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(0,0,0,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.5) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          <div className="relative flex items-start gap-4">
            <div
              className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                meta?.tone === 'emerald'
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white'
                  : meta?.tone === 'amber'
                  ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white'
                  : meta?.tone === 'sky'
                  ? 'bg-gradient-to-br from-sky-500 to-sky-700 text-white'
                  : meta?.tone === 'rose'
                  ? 'bg-gradient-to-br from-rose-500 to-rose-700 text-white'
                  : 'bg-gradient-to-br from-neutral-400 to-neutral-600 text-white'
              }`}
            >
              <StatusIcon size={26} />
              <span
                className={`absolute inset-0 rounded-2xl ring-1 ${
                  meta?.tone === 'emerald'
                    ? 'ring-emerald-300/60'
                    : meta?.tone === 'amber'
                    ? 'ring-amber-300/60'
                    : meta?.tone === 'sky'
                    ? 'ring-sky-300/60'
                    : meta?.tone === 'rose'
                    ? 'ring-rose-300/60'
                    : 'ring-neutral-300/60'
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl md:text-2xl font-extrabold text-neutral-900 tracking-tight">
                  {meta?.label}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide shadow-sm ${meta?.badge}`}
                >
                  #{code}
                </span>
              </div>
              <p className="text-sm text-neutral-700 mt-1.5 leading-relaxed">
                {meta?.description}
              </p>
              {order.notes && (
                <p className="text-xs italic text-neutral-600 mt-2.5 border-l-2 border-neutral-300 pl-3 bg-white/60 backdrop-blur-sm rounded-r-md py-1.5">
                  "{order.notes}"
                </p>
              )}
              {order.cancelReason && (
                <p className="text-xs italic text-rose-700 mt-2.5 border-l-2 border-rose-300 pl-3 bg-rose-50/80 backdrop-blur-sm rounded-r-md py-1.5">
                  Lý do huỷ: {order.cancelReason}
                </p>
              )}
            </div>
          </div>

          {canCancel && (
            <div className="relative mt-6 pt-5 border-t border-neutral-200/60 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setCancelOpen(true)}
                className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-sm font-semibold transition-all shadow-sm hover:shadow hover:-translate-y-0.5"
              >
                <XCircle className="h-4 w-4" />
                Huỷ đơn này
              </button>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Số lượng sẽ được hoàn về tin đăng.{' '}
                <span className="font-semibold text-neutral-800">Người nhận không bị trừ trust.</span>
              </p>
            </div>
          )}
        </section>

        {cancelOpen && order && (
          <CancelReservationModal
            mode="provider"
            reservationId={order.id}
            listingTitle={order.listing.title}
            receiverName={order.receiver.user.fullName}
            quantityLabel={qtyLabel}
            isPending={cancelMutation.isPending}
            onConfirm={async (reason) => {
              await cancelMutation.mutateAsync({ id: order.id, reason });
              setCancelOpen(false);
              router.refresh();
              void refetch();
            }}
            onClose={() => setCancelOpen(false)}
          />
        )}

        {/* Body grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
          {/* LEFT: Item + receiver + times */}
          <div className="lg:col-span-2 space-y-4 md:space-y-5">
            {/* Listing */}
            <Card title="Món đã đăng" icon={Package}>
              {/* Cover lớn gradient overlay */}
              <div className="relative -mt-1 -mx-1 mb-4 rounded-xl overflow-hidden h-40 md:h-44">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <SafeImage
                  src={cover}
                  alt={order.listing.title}
                  className="absolute inset-0 w-full h-full object-cover scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white text-base md:text-lg truncate drop-shadow">
                      {order.listing.title}
                    </p>
                    {order.listing.description && (
                      <p className="text-xs text-white/85 mt-0.5 line-clamp-1">
                        {order.listing.description}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur text-emerald-700 text-[11px] font-bold shadow shrink-0">
                    <Package className="h-3 w-3" />
                    {qtyLabel}
                  </span>
                </div>
                {/* Top-right ribbon category */}
                <span className="absolute top-3 right-3 inline-flex items-center px-2.5 py-1 rounded-full bg-black/40 backdrop-blur text-white text-[10px] font-bold uppercase tracking-wider border border-white/20">
                  {order.listing.category}
                </span>
              </div>

              {order.listing.storageConditions && (
                <p className="text-xs text-neutral-600 -mt-2 mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-100">
                  🧊 Bảo quản: <span className="font-medium">{order.listing.storageConditions}</span>
                </p>
              )}
              {order.listing.allergenNotes && (
                <p className="text-xs text-rose-700 mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-100">
                  ⚠️ Dị ứng: <span className="font-medium">{order.listing.allergenNotes}</span>
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <InfoRow
                  icon={MapPin}
                  label="Địa điểm lấy"
                  value={order.listing.pickupAddress}
                />
                <InfoRow
                  icon={CalendarClock}
                  label="Khung giờ pickup"
                  value={`${formatDateTime(order.listing.pickupStartTime)}\n→ ${formatDateTime(order.listing.pickupEndTime)}`}
                />
              </div>
            </Card>

            {/* Receiver */}
            <Card title="Người nhận" icon={User}>
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 shadow-md shadow-emerald-200/50">
                    <div className="w-full h-full rounded-full bg-white overflow-hidden grid place-items-center text-emerald-700 font-extrabold text-xl">
                      {order.receiver.user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={order.receiver.user.avatarUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        order.receiver.user.fullName.charAt(0).toUpperCase()
                      )}
                    </div>
                  </div>
                  {/* Online dot */}
                  <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-neutral-900 truncate">
                    {order.receiver.user.fullName}
                  </p>
                  <p className="text-sm text-neutral-600 inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-emerald-600" />
                    {order.receiver.user.phone ?? '—'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="inline-flex flex-col items-center justify-center w-16 py-1.5 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/70 shadow-sm">
                    <Star className="h-3 w-3 text-emerald-600 fill-emerald-500" />
                    <span className="text-base font-extrabold text-emerald-700 leading-tight tabular-nums">
                      {order.receiver.user.trustScore}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600/70">
                      trust
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Delivery / Shipper */}
            {order.delivery && (
              <Card title="Vận chuyển" icon={Truck}>
                {/* Banner gradient với badge trạng thái */}
                <div className="relative -mt-1 -mx-1 mb-4 rounded-xl overflow-hidden bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white">
                    <Truck className="h-5 w-5" />
                    <span className="text-sm font-bold">Đơn có giao hàng</span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md ring-1 ring-white/40 ${
                      deliveryMeta?.tone === 'emerald'
                        ? 'bg-emerald-400 text-emerald-900'
                        : deliveryMeta?.tone === 'amber'
                        ? 'bg-amber-300 text-amber-900'
                        : deliveryMeta?.tone === 'rose'
                        ? 'bg-rose-400 text-rose-900'
                        : deliveryMeta?.tone === 'sky'
                        ? 'bg-sky-300 text-sky-900'
                        : 'bg-white/90 text-neutral-700'
                    }`}
                  >
                    {deliveryMeta?.label ?? order.delivery.status}
                  </span>
                </div>

                {/* Route preview: pickup → dropoff */}
                <div className="relative rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 mb-4">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-[19px] top-[28px] bottom-[28px] w-px bg-gradient-to-b from-emerald-400 via-amber-400 to-rose-400"
                  />
                  <div className="relative flex items-start gap-3 mb-4 last:mb-0">
                    <div className="relative z-10 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white shadow shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-700">
                        Điểm lấy
                      </p>
                      <p className="text-sm text-neutral-800">{order.delivery.pickupAddress}</p>
                    </div>
                  </div>
                  <div className="relative flex items-start gap-3">
                    <div className="relative z-10 w-5 h-5 rounded-full bg-rose-500 border-2 border-white shadow shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-rose-700">
                        Điểm giao
                      </p>
                      <p className="text-sm text-neutral-800">{order.delivery.deliveryAddress}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {order.delivery.assignedAt && (
                    <InfoRow
                      icon={Clock}
                      label="Phân công lúc"
                      value={formatDateTime(order.delivery.assignedAt)}
                    />
                  )}
                  {order.delivery.pickedUpAt && (
                    <InfoRow
                      icon={Package}
                      label="Shipper lấy lúc"
                      value={formatDateTime(order.delivery.pickedUpAt)}
                    />
                  )}
                  {order.delivery.completedAt && (
                    <InfoRow
                      icon={CheckCircle2}
                      label="Giao xong lúc"
                      value={formatDateTime(order.delivery.completedAt)}
                    />
                  )}
                </div>

                {order.delivery.shipper && (
                  <div className="relative mt-4 rounded-2xl bg-gradient-to-r from-sky-50 via-sky-50/40 to-white border border-sky-100 p-3.5 flex items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-br from-sky-400 to-sky-600 shadow">
                        <div className="w-full h-full rounded-full bg-white grid place-items-center text-sky-700 font-bold overflow-hidden">
                          {order.delivery.shipper.user.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={order.delivery.shipper.user.avatarUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            (order.delivery.shipper.user.fullName ?? 'S').charAt(0).toUpperCase()
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-sky-700">
                        Shipper phụ trách
                      </p>
                      <p className="font-bold text-neutral-900 truncate">
                        {order.delivery.shipper.user.fullName}
                      </p>
                      <p className="text-xs text-neutral-600 inline-flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-sky-600" />
                        {order.delivery.shipper.user.phone ?? '—'}
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* RIGHT: Timeline */}
          <div className="space-y-4 md:space-y-5">
            <Card title="Lịch sử" icon={Clock}>
              <ol className="relative pl-9 space-y-5">
                {/* Vertical line — nằm giữa rìa trái content, KHÔNG đè lên text */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-[14px] top-1.5 bottom-1.5 w-px bg-gradient-to-b from-emerald-400 via-neutral-200 to-transparent"
                />
                <TimelineRow
                  icon={CheckCircle2}
                  label="Đặt đơn"
                  when={formatDateTime(order.createdAt)}
                  tone="emerald"
                  done
                />
                {order.pickedUpAt && (
                  <TimelineRow
                    icon={Package}
                    label="Đã lấy hàng"
                    when={formatDateTime(order.pickedUpAt)}
                    tone="amber"
                    done
                  />
                )}
                {order.completedAt && (
                  <TimelineRow
                    icon={CheckCircle2}
                    label="Hoàn thành"
                    when={formatDateTime(order.completedAt)}
                    tone="emerald"
                    done
                  />
                )}
                {order.cancelledAt && (
                  <TimelineRow
                    icon={XCircle}
                    label="Đã huỷ"
                    when={formatDateTime(order.cancelledAt)}
                    tone="rose"
                    done
                  />
                )}
                {order.qrExpiresAt && !order.completedAt && !order.cancelledAt && (
                  <TimelineRow
                    icon={RotateCcw}
                    label="QR hết hạn"
                    when={formatDateTime(order.qrExpiresAt)}
                    tone="neutral"
                    done={false}
                  />
                )}
              </ol>
            </Card>

            <Card title="Mã QR đơn" icon={ShieldCheck}>
              {order.qrToken && !order.completedAt && !order.cancelledAt ? (
                <OrderQrBlock qrToken={order.qrToken} orderCode={code} />
              ) : (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto rounded-full bg-neutral-100 grid place-items-center">
                    <QrCode className="h-7 w-7 text-neutral-400" />
                  </div>
                  <p className="font-semibold text-neutral-700 mt-3">
                    QR đã hết hạn / bị thu hồi
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    Đơn đang ở trạng thái{' '}
                    <span className="font-bold">{meta?.label}</span> nên mã QR không còn hiệu lực.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderQrBlock({ qrToken, orderCode }: { qrToken: string; orderCode: string }) {
  const canvasId = `order-qr-${orderCode}`;
  const handleDownload = () => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `foodresq-order-${orderCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="relative flex flex-col items-center text-center">
      {/* QR with animated scan-line + corner accents */}
      <div className="relative bg-gradient-to-br from-[#236c2a] via-[#2e8a37] to-[#1a4f1f] p-1 rounded-2xl shadow-lg shadow-emerald-200/60">
        <div className="relative bg-white rounded-xl p-3 overflow-hidden">
          <QRCodeCanvas
            id={canvasId}
            value={qrToken}
            size={180}
            bgColor="#ffffff"
            fgColor="#0f172a"
            level="M"
            marginSize={1}
          />
          {/* Animated scan line */}
          <div className="pointer-events-none absolute inset-3 rounded-md overflow-hidden">
            <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-500 to-transparent shadow-[0_0_12px_2px_rgba(34,197,94,0.6)] qr-scan" />
          </div>
          {/* Corner accents */}
          <span className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-emerald-500 rounded-tl-sm" />
          <span className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-emerald-500 rounded-tr-sm" />
          <span className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-emerald-500 rounded-bl-sm" />
          <span className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-emerald-500 rounded-br-sm" />
        </div>
      </div>

      {/* Order code chip */}
      <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
        <QrCode className="h-3 w-3 text-emerald-700" />
        <span className="font-mono text-xs font-bold text-emerald-700">{orderCode}</span>
      </div>

      {/* Download */}
      <button
        onClick={handleDownload}
        className="mt-4 group inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-semibold shadow-md shadow-emerald-200 transition-all active:scale-95"
      >
        <Download className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
        Tải ảnh QR
      </button>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <section className="relative bg-white rounded-2xl border border-neutral-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 p-5 overflow-hidden">
      {/* Subtle gradient strip trên đầu card */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent opacity-60" />
      <h3 className="text-sm font-extrabold text-neutral-800 mb-4 inline-flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white grid place-items-center shadow shadow-emerald-200/70">
          <Icon size={15} />
        </span>
        <span className="tracking-tight">{title}</span>
      </h3>
      {children}
    </section>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-lg bg-neutral-100 text-neutral-600 grid place-items-center shrink-0">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-500">
          {label}
        </p>
        <p className="text-sm text-neutral-800 whitespace-pre-line break-words">{value}</p>
      </div>
    </div>
  );
}

function TimelineRow({
  icon: Icon,
  label,
  when,
  tone,
  done,
}: {
  icon: any;
  label: string;
  when: string;
  tone: 'emerald' | 'amber' | 'rose' | 'neutral';
  done: boolean;
}) {
  const toneCls =
    tone === 'emerald'
      ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow shadow-emerald-200'
      : tone === 'amber'
      ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow shadow-amber-200'
      : tone === 'rose'
      ? 'bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow shadow-rose-200'
      : 'bg-white text-neutral-400 border border-dashed border-neutral-300';
  return (
    <li className="relative pl-1">
      <span
        className={`absolute -left-[27px] top-0.5 w-7 h-7 rounded-full grid place-items-center ring-4 ring-white ${
          done ? toneCls : 'bg-white border border-dashed border-neutral-300 text-neutral-400'
        }`}
      >
        <Icon size={12} />
      </span>
      <p className="text-sm font-semibold text-neutral-800">{label}</p>
      <p className="text-xs text-neutral-500 leading-relaxed">{when}</p>
    </li>
  );
}
