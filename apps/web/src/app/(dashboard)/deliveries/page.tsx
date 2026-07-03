'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  useVolunteerMe,
  useMyOffers,
  useActiveDelivery,
  useShipperStats,
  useDeliveryHistory,
  useSetAvailability,
  useAcceptOffer,
  useRejectOffer,
  useUpdateDeliveryStatus,
  useCancelDelivery,
  useFailDelivery,
  useUpdateMyLocation,
  useOfferSocket,
  type ActiveDelivery,
  type DeliveryHistoryItem,
  type TaskOffer,
} from '@/hooks/useDeliveries';
import { mediaUrl, mapsDirUrl, haversineKm } from '@/lib/utils';

const DeliveryRouteMap = dynamic(() => import('@/components/map/DeliveryRouteMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-neutral-100 animate-pulse" />,
});

const HCM = { lng: 106.6297, lat: 10.8231 };

const RANK_LABEL: Record<string, string> = {
  newcomer: 'Tân binh',
  active: 'Năng nổ',
  experienced: 'Kỳ cựu',
  expert: 'Chuyên gia',
};

function StatTile({ icon, value, label, accent }: { icon: string; value: string | number; label: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-150 p-4 flex flex-col gap-1">
      <span className={`material-symbols-outlined text-[22px] ${accent ?? 'text-emerald-600'}`}>{icon}</span>
      <span className="font-extrabold text-2xl text-neutral-900 leading-none">{value}</span>
      <span className="text-[11px] text-neutral-500 font-medium">{label}</span>
    </div>
  );
}

// Bước trạng thái giao hàng + hành động kế tiếp
const NEXT_STATUS: Record<string, { next: string; label: string; needsPhoto: boolean }> = {
  assigned: { next: 'heading_to_provider', label: 'Bắt đầu đến lấy hàng', needsPhoto: false },
  heading_to_provider: { next: 'qc_completed', label: 'Đã lấy hàng & kiểm tra (QC)', needsPhoto: true },
  qc_completed: { next: 'in_transit', label: 'Bắt đầu giao cho người nhận', needsPhoto: false },
  in_transit: { next: 'delivered', label: 'Hoàn tất giao hàng', needsPhoto: true },
};

const STEPS = [
  { key: 'assigned', label: 'Đã nhận' },
  { key: 'heading_to_provider', label: 'Đến lấy' },
  { key: 'qc_completed', label: 'QC' },
  { key: 'in_transit', label: 'Đang giao' },
  { key: 'delivered', label: 'Hoàn tất' },
];

function getLocation(): Promise<{ lng: number; lat: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(HCM);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      () => resolve(HCM), // từ chối quyền → mặc định trung tâm HCM
      { timeout: 8000 },
    );
  });
}

function OfferCountdown({ expiresAt }: { expiresAt: string }) {
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

// Popup nổi bật (kiểu Grab/Xanh SM) khi có đơn mời — bật ngay qua socket.
function OfferPopup({
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
              <span className="text-neutral-700"><b>Giao:</b> {offer.delivery.reservation.receiver.address ?? '—'}</span>
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

export default function DeliveriesPage() {
  const { data: me, isLoading: meLoading } = useVolunteerMe();
  const { data: active } = useActiveDelivery();
  const { data: offers } = useMyOffers(!active); // chỉ poll offers khi chưa có đơn đang giao
  const { data: stats } = useShipperStats(!!me?.isShipper);
  const { data: history } = useDeliveryHistory({ limit: 3, enabled: !!me?.isShipper });
  const setAvailability = useSetAvailability();
  const acceptOffer = useAcceptOffer();
  const rejectOffer = useRejectOffer();
  const updateStatus = useUpdateDeliveryStatus();
  const cancelDelivery = useCancelDelivery();
  const failDelivery = useFailDelivery();
  const updateMyLocation = useUpdateMyLocation();

  // Popup nhận đơn realtime: nghe socket + hiện đơn mới nhất chưa bị bỏ qua.
  const canReceive = !!me?.isAvailable && !active;
  useOfferSocket(canReceive);
  const [dismissedOffers, setDismissedOffers] = useState<Set<string>>(new Set());
  const popupOffer = canReceive ? offers?.find((o) => !dismissedOffers.has(o.id)) : undefined;
  const dismissOffer = (id: string) => setDismissedOffers((prev) => new Set(prev).add(id));

  // Khi đang giao đơn → theo dõi GPS liên tục và đẩy vị trí để người nhận xem trực tiếp.
  // watchPosition tự bắn khi tài xế di chuyển; throttle gửi mạng tối đa 1 lần / 10s.
  const activeId = active?.id;
  useEffect(() => {
    if (!activeId || typeof navigator === 'undefined' || !navigator.geolocation) return;
    let cancelled = false;
    let lastSent = 0;
    const send = (lng: number, lat: number, force = false) => {
      if (cancelled) return;
      const now = Date.now();
      if (!force && now - lastSent < 10_000) return; // tiết kiệm pin/băng thông
      lastSent = now;
      updateMyLocation.mutate({ lng, lat });
    };
    // Gửi ngay vị trí hiện tại
    navigator.geolocation.getCurrentPosition(
      (pos) => send(pos.coords.longitude, pos.coords.latitude, true),
      () => {},
      { timeout: 8000, maximumAge: 10_000 },
    );
    // Theo dõi liên tục — cập nhật mỗi khi shipper di chuyển
    const watchId = navigator.geolocation.watchPosition(
      (pos) => send(pos.coords.longitude, pos.coords.latitude),
      () => {},
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
    return () => { cancelled = true; navigator.geolocation.clearWatch(watchId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [pendingNext, setPendingNext] = useState<string | null>(null);
  const [issueMode, setIssueMode] = useState(false);
  const [issueReason, setIssueReason] = useState('');
  const [openMapId, setOpenMapId] = useState<string | null>(null); // offer đang mở xem lộ trình

  // Trước khi lấy hàng → huỷ (trả đơn); sau khi lấy hàng → báo thất bại
  async function handleIssue() {
    if (!active) return;
    const beforePickup = active.status === 'assigned' || active.status === 'heading_to_provider';
    try {
      if (beforePickup) {
        await cancelDelivery.mutateAsync({ deliveryId: active.id, reason: issueReason.trim() || undefined });
        toast.success('Đã huỷ nhận đơn — đơn được chuyển lại cho shipper khác.');
      } else {
        if (!issueReason.trim()) { toast.error('Vui lòng nhập lý do giao thất bại'); return; }
        await failDelivery.mutateAsync({ deliveryId: active.id, reason: issueReason.trim() });
        toast.success('Đã báo giao thất bại.');
      }
      setIssueMode(false);
      setIssueReason('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Thao tác thất bại';
      toast.error(msg);
    }
  }

  async function handleToggle() {
    if (!me) return;
    try {
      if (me.isAvailable) {
        await setAvailability.mutateAsync({ isAvailable: false });
        toast.success('Đã tắt nhận đơn');
      } else {
        const loc = await getLocation();
        await setAvailability.mutateAsync({ isAvailable: true, ...loc });
        toast.success('Đã bật sẵn sàng — bạn sẽ nhận được đơn giao gần bạn');
      }
    } catch {
      toast.error('Không cập nhật được trạng thái');
    }
  }

  async function handleAccept(deliveryId: string) {
    try {
      await acceptOffer.mutateAsync(deliveryId);
      toast.success('Đã nhận đơn! Bắt đầu hành trình giao hàng.');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Nhận đơn thất bại (có thể đã có người khác nhận).';
      toast.error(msg);
    }
  }

  async function handleReject(deliveryId: string) {
    try {
      await rejectOffer.mutateAsync({ deliveryId });
      toast.info('Đã bỏ qua đơn này');
    } catch {
      toast.error('Thao tác thất bại');
    }
  }

  async function advance(d: ActiveDelivery, photo?: File) {
    const step = NEXT_STATUS[d.status];
    if (!step) return;
    try {
      await updateStatus.mutateAsync({ deliveryId: d.id, status: step.next, photo });
      toast.success(step.next === 'delivered' ? 'Giao hàng hoàn tất! +5 điểm cống hiến 🎉' : 'Đã cập nhật trạng thái');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Cập nhật thất bại';
      toast.error(msg);
    }
  }

  function onAdvanceClick(d: ActiveDelivery) {
    const step = NEXT_STATUS[d.status];
    if (!step) return;
    if (step.needsPhoto) {
      setPendingNext(d.id);
      photoInputRef.current?.click();
    } else {
      void advance(d);
    }
  }

  if (meLoading) {
    return (
      <div className="min-h-screen bg-neutral-50/50 flex items-center justify-center py-20">
        <span className="animate-spin border-4 border-emerald-600 border-t-transparent rounded-full w-10 h-10" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      {popupOffer && (
        <OfferPopup
          offer={popupOffer}
          busy={acceptOffer.isPending || rejectOffer.isPending}
          onAccept={() =>
            acceptOffer.mutate(popupOffer.deliveryId, {
              onSuccess: () => toast.success('Đã nhận đơn! Bắt đầu đến lấy hàng.'),
              onError: () => toast.error('Đơn đã được người khác nhận hoặc đã hết hạn.'),
            })
          }
          onReject={() => {
            rejectOffer.mutate({ deliveryId: popupOffer.deliveryId });
            dismissOffer(popupOffer.id);
          }}
          onClose={() => dismissOffer(popupOffer.id)}
        />
      )}
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-10 space-y-8">
        {/* Header + availability toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-extrabold text-3xl text-neutral-900">Trung tâm giao hàng</h1>
            <p className="text-sm text-neutral-500 mt-1">
              {me ? (
                <>
                  Hạng {me.rank} • {me.dedicationPoints} điểm cống hiến
                  {me.avgRating != null && ` • ${me.avgRating.toFixed(1)}★`}
                </>
              ) : (
                'Tài xế tình nguyện'
              )}
            </p>
          </div>

          <button
            onClick={handleToggle}
            disabled={setAvailability.isPending || !!active}
            className={`flex items-center gap-3 px-5 py-3 rounded-2xl font-bold text-sm transition-all shadow-sm disabled:opacity-60 ${
              me?.isAvailable
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${me?.isAvailable ? 'bg-white animate-pulse' : 'bg-neutral-400'}`} />
            {me?.isAvailable ? 'Đang sẵn sàng' : 'Đang tắt'}
          </button>
        </div>

        {/* Bảng thành tích shipper (kiểu dashboard tài xế) */}
        {me?.isShipper && stats && (
          <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-lg text-neutral-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">workspace_premium</span>
                Thành tích của bạn
              </h2>
              <span className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold">
                Hạng {RANK_LABEL[stats.rank] ?? stats.rank}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatTile icon="local_shipping" value={stats.totalDelivered} label="Đã giao" />
              <StatTile icon="today" value={stats.todayDelivered} label="Hôm nay" />
              <StatTile icon="route" value={`${stats.totalKm} km`} label="Tổng quãng đường" />
              <StatTile icon="verified" value={stats.completionRate != null ? `${stats.completionRate}%` : '—'} label="Tỉ lệ hoàn thành" />
              <StatTile icon="redeem" value={stats.dedicationPoints} label="Điểm cống hiến" accent="text-honey-500" />
              <StatTile icon="star" value={stats.avgRating != null ? stats.avgRating.toFixed(1) : '—'} label="Đánh giá" accent="text-amber-500" />
            </div>
          </div>
        )}

        {/* Cảnh báo chưa được duyệt làm shipper hoặc không phải shipper */}
        {me && !me.isShipper && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col items-start gap-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600">info</span>
              <p className="text-sm text-amber-900 font-medium">
                Tài khoản của bạn không có chuyên môn <strong>shipper</strong>, hoặc chưa được xác minh. 
                Bạn không thể nhận đơn giao hàng.
              </p>
            </div>
            {/* Thêm link cho đầu bếp/phục vụ qua trang Bếp ăn cộng đồng */}
            <a 
              href="/campaigns" 
              className="mt-2 ml-9 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white font-bold rounded-xl text-sm shadow-sm hover:bg-amber-700 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">soup_kitchen</span>
              Chuyển đến Bếp ăn cộng đồng
            </a>
          </div>
        )}

        {/* Input ảnh proof ẩn (dùng chung cho QC / hoàn tất) */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file && active && pendingNext === active.id) {
              void advance(active, file);
            }
            setPendingNext(null);
          }}
        />

        {/* ĐƠN ĐANG GIAO */}
        {active ? (
          <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-neutral-100 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-neutral-100 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={active.reservation.listing.imageUrls[0] || '/food_bread.png'}
                  alt={active.reservation.listing.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-neutral-900 truncate">
                  {active.reservation.listing.title}
                </h3>
                <p className="text-xs text-neutral-500 truncate">
                  {active.reservation.listing.pickupAddress}
                </p>
              </div>
            </div>

            {/* Steps */}
            <div className="p-6">
              <div className="relative flex justify-between mb-8">
                {STEPS.map((s) => {
                  const curIdx = STEPS.findIndex((x) => x.key === active.status);
                  const myIdx = STEPS.findIndex((x) => x.key === s.key);
                  const done = myIdx <= curIdx;
                  return (
                    <div key={s.key} className="flex flex-col items-center gap-1.5 z-10 flex-1">
                      <div
                        className={`w-5 h-5 rounded-full border-4 ${
                          done ? 'bg-emerald-600 border-emerald-200' : 'bg-white border-neutral-200'
                        }`}
                      />
                      <span className={`text-[10px] font-bold ${done ? 'text-emerald-800' : 'text-neutral-400'}`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
                <div className="absolute top-[9px] left-0 right-0 h-1 bg-neutral-100 -z-0">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{
                      width: `${(STEPS.findIndex((x) => x.key === active.status) / (STEPS.length - 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Receiver info */}
              <div className="bg-neutral-50 rounded-2xl p-4 flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase">Người nhận</p>
                  <p className="font-bold text-neutral-800 text-sm">
                    {active.reservation.receiver.user.fullName}
                  </p>
                </div>
                {active.reservation.receiver.user.phone && (
                  <a
                    href={`tel:${active.reservation.receiver.user.phone}`}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-emerald-700 hover:bg-emerald-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">call</span>
                    Gọi
                  </a>
                )}
              </div>

              {/* Bản đồ lộ trình lấy → giao */}
              {active.coords?.pickupLat != null &&
                active.coords?.pickupLng != null &&
                active.coords?.deliveryLat != null &&
                active.coords?.deliveryLng != null && (
                  <div className="h-56 rounded-2xl overflow-hidden border border-neutral-150 mb-5">
                    <DeliveryRouteMap
                      pickup={{ lat: active.coords.pickupLat, lng: active.coords.pickupLng }}
                      delivery={{ lat: active.coords.deliveryLat, lng: active.coords.deliveryLng }}
                      shipper={me?.currentLocation ?? null}
                    />
                  </div>
                )}

              {/* Điều hướng tới điểm đến hiện tại */}
              {(() => {
                const toPickup = active.status === 'assigned' || active.status === 'heading_to_provider';
                const c = active.coords;
                const tLat = toPickup ? c?.pickupLat : c?.deliveryLat;
                const tLng = toPickup ? c?.pickupLng : c?.deliveryLng;
                const label = toPickup ? 'Điểm lấy hàng' : 'Điểm giao hàng';
                const addr = toPickup ? active.reservation.listing.pickupAddress : active.reservation.receiver.address;
                const fromMe =
                  me?.currentLocation && tLat != null && tLng != null
                    ? haversineKm(me.currentLocation, { lat: tLat, lng: tLng })
                    : null;
                return (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] text-emerald-700 font-bold uppercase">{label}</p>
                        {addr && <p className="text-sm font-semibold text-neutral-800">{addr}</p>}
                        <p className="text-xs text-neutral-500 mt-1">
                          {fromMe != null && <>Cách bạn ~{fromMe.toFixed(1)} km</>}
                          {active.distanceKm != null && <>{fromMe != null ? ' · ' : ''}Lấy→giao ~{active.distanceKm} km</>}
                        </p>
                      </div>
                      {tLat != null && tLng != null && (
                        <a
                          href={mapsDirUrl(tLat, tLng)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-bold"
                        >
                          <span className="material-symbols-outlined text-[18px]">directions</span> Điều hướng
                        </a>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Advance button */}
              {NEXT_STATUS[active.status] ? (
                <button
                  onClick={() => onAdvanceClick(active)}
                  disabled={updateStatus.isPending}
                  className="w-full py-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {updateStatus.isPending ? (
                    <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-5 h-5" />
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[20px]">
                        {NEXT_STATUS[active.status].needsPhoto ? 'photo_camera' : 'arrow_forward'}
                      </span>
                      {NEXT_STATUS[active.status].label}
                    </>
                  )}
                </button>
              ) : (
                <div className="text-center py-3 text-emerald-700 font-bold">Đơn đã hoàn tất ✓</div>
              )}

              {/* Huỷ nhận đơn (trước khi lấy hàng) / Báo giao thất bại (sau khi lấy hàng) */}
              {NEXT_STATUS[active.status] && (() => {
                const beforePickup = active.status === 'assigned' || active.status === 'heading_to_provider';
                const busy = cancelDelivery.isPending || failDelivery.isPending;
                if (!issueMode) {
                  return (
                    <button
                      onClick={() => setIssueMode(true)}
                      className="w-full mt-3 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      {beforePickup ? 'Huỷ nhận đơn' : 'Báo giao thất bại'}
                    </button>
                  );
                }
                return (
                  <div className="mt-3 bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-bold text-rose-700">
                      {beforePickup
                        ? 'Huỷ nhận đơn? Đơn sẽ được chuyển lại cho shipper khác. (lý do tuỳ chọn)'
                        : 'Báo giao thất bại — vui lòng nhập lý do:'}
                    </p>
                    <textarea
                      value={issueReason}
                      onChange={(e) => setIssueReason(e.target.value)}
                      rows={2}
                      placeholder={beforePickup ? 'Lý do (tuỳ chọn)' : 'VD: Người nhận không có mặt, không liên lạc được...'}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-300"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleIssue}
                        disabled={busy}
                        className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                      >
                        {busy ? 'Đang xử lý...' : beforePickup ? 'Xác nhận huỷ' : 'Xác nhận thất bại'}
                      </button>
                      <button
                        onClick={() => { setIssueMode(false); setIssueReason(''); }}
                        className="px-4 py-2.5 text-neutral-500 text-sm font-bold"
                      >
                        Quay lại
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          /* DANH SÁCH OFFER */
          <div className="space-y-4">
            <h2 className="font-extrabold text-xl text-neutral-900">
              Đơn giao gần bạn {offers && offers.length > 0 ? `(${offers.length})` : ''}
            </h2>

            {!me?.isAvailable && (
              <div className="text-center py-12 bg-white rounded-3xl border border-neutral-200">
                <span className="material-symbols-outlined text-neutral-300 text-[56px]">bedtime</span>
                <p className="font-bold text-neutral-700 mt-3">Bạn đang tắt nhận đơn</p>
                <p className="text-xs text-neutral-500 mt-1">Bật &quot;Sẵn sàng&quot; ở góc trên để nhận đơn giao gần bạn.</p>
              </div>
            )}

            {me?.isAvailable && (!offers || offers.length === 0) && (
              <div className="text-center py-12 bg-white rounded-3xl border border-neutral-200">
                <span className="material-symbols-outlined text-neutral-300 text-[56px]">inbox</span>
                <p className="font-bold text-neutral-700 mt-3">Chưa có đơn nào</p>
                <p className="text-xs text-neutral-500 mt-1">
                  Khi có người đặt thực phẩm cần giao gần bạn, đơn sẽ hiện ở đây (tự làm mới).
                </p>
              </div>
            )}

            {me?.isAvailable &&
              offers?.map((o) => (
                <div key={o.id} className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden bg-neutral-100 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={o.delivery.reservation.listing.imageUrls[0] || '/food_bread.png'}
                        alt={o.delivery.reservation.listing.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-extrabold text-neutral-900 truncate">
                        {o.delivery.reservation.listing.title}
                      </h3>
                      <p className="text-xs text-neutral-500 truncate flex items-center gap-1 mt-0.5">
                        <span className="material-symbols-outlined text-[14px]">place</span>
                        {o.delivery.reservation.listing.pickupAddress}
                      </p>
                      <p className="text-xs text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
                        {(() => {
                          const c = o.delivery.coords;
                          const fromMe =
                            me?.currentLocation && c?.pickupLat != null && c?.pickupLng != null
                              ? haversineKm(me.currentLocation, { lat: c.pickupLat, lng: c.pickupLng })
                              : null;
                          return (
                            <>
                              {fromMe != null && <span className="font-semibold text-emerald-700">Cách bạn ~{fromMe.toFixed(1)} km</span>}
                              {o.delivery.distanceKm != null && <span>· Lấy→giao ~{o.delivery.distanceKm} km</span>}
                            </>
                          );
                        })()}
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Hết hạn sau <OfferCountdown expiresAt={o.expiresAt} />
                      </p>
                    </div>
                    {o.delivery.coords?.pickupLat != null && o.delivery.coords?.pickupLng != null && (
                      <a
                        href={mapsDirUrl(o.delivery.coords.pickupLat, o.delivery.coords.pickupLng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Điều hướng tới điểm lấy hàng"
                        className="shrink-0 w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-[20px]">directions</span>
                      </a>
                    )}
                  </div>

                  {/* Xem trước lộ trình lấy → giao */}
                  {o.delivery.coords?.pickupLat != null &&
                    o.delivery.coords?.pickupLng != null &&
                    o.delivery.coords?.deliveryLat != null &&
                    o.delivery.coords?.deliveryLng != null && (
                      <div className="mt-3">
                        <button
                          onClick={() => setOpenMapId(openMapId === o.deliveryId ? null : o.deliveryId)}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">map</span>
                          {openMapId === o.deliveryId ? 'Ẩn lộ trình' : 'Xem lộ trình'}
                        </button>
                        {openMapId === o.deliveryId && (
                          <div className="h-48 rounded-2xl overflow-hidden border border-neutral-150 mt-2">
                            <DeliveryRouteMap
                              pickup={{ lat: o.delivery.coords.pickupLat, lng: o.delivery.coords.pickupLng }}
                              delivery={{ lat: o.delivery.coords.deliveryLat, lng: o.delivery.coords.deliveryLng }}
                              shipper={me?.currentLocation ?? null}
                            />
                          </div>
                        )}
                      </div>
                    )}

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => handleReject(o.deliveryId)}
                      disabled={rejectOffer.isPending}
                      className="flex-1 py-3 border border-neutral-200 text-neutral-600 rounded-xl font-bold text-sm hover:bg-neutral-50 disabled:opacity-50"
                    >
                      Bỏ qua
                    </button>
                    <button
                      onClick={() => handleAccept(o.deliveryId)}
                      disabled={acceptOffer.isPending}
                      className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                    >
                      Nhận đơn
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* LỊCH SỬ GIAO HÀNG */}
        {me?.isShipper && history && history.meta.total > 0 && (
          <div className="space-y-4 mt-8">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-xl text-neutral-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">history</span>
                Lịch sử giao hàng
              </h2>
              <Link
                href="/deliveries/history"
                className="text-sm font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                Xem tất cả ({history.meta.total})
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </Link>
            </div>
            <div className="space-y-3">
              {history.items.map((h) => <HistoryRow key={h.id} h={h} />)}
            </div>
            {history.meta.total > 3 && (
              <div className="pt-2">
                <Link
                  href="/deliveries/history"
                  className="w-full py-3 bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50 rounded-2xl font-bold text-sm flex items-center justify-center transition-colors shadow-sm"
                >
                  Xem thêm các đơn cũ hơn
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ h }: { h: DeliveryHistoryItem }) {
  const delivered = h.status === 'delivered';
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 flex items-center gap-4">
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-neutral-100 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={h.deliveryProofUrl ? mediaUrl(h.deliveryProofUrl) : h.reservation.listing.imageUrls[0] || '/food_bread.png'}
          alt={h.reservation.listing.title}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-neutral-900 truncate">{h.reservation.listing.title}</h3>
        <p className="text-xs text-neutral-500 truncate flex items-center gap-1 mt-0.5">
          <span className="material-symbols-outlined text-[14px]">person</span>
          Giao cho {h.reservation.receiver.user.fullName}
          {h.distanceKm != null && <span className="text-neutral-400">· {h.distanceKm} km</span>}
        </p>
        <p className="text-[11px] text-neutral-400 mt-0.5">
          {h.deliveredAt ? new Date(h.deliveredAt).toLocaleString('vi-VN') : new Date(h.createdAt).toLocaleDateString('vi-VN')}
        </p>
        {!delivered && h.failedReason && <p className="text-[11px] text-rose-600 mt-0.5">Lý do: {h.failedReason}</p>}
      </div>
      <span className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold ${delivered ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>
        {delivered ? 'Đã giao' : 'Thất bại'}
      </span>
    </div>
  );
}
