'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  useVolunteerMe,
  useMyDeliveryShifts,
  useNearbyDeliveries,
  useClaimDelivery,
  useActiveDelivery,
  useShipperStats,
  useDeliveryHistory,
  useUpdateDeliveryStatus,
  useCancelDelivery,
  useFailDelivery,
  useUpdateMyLocation,
  type ActiveDelivery,
  type DeliveryHistoryItem,
} from '@/hooks/useDeliveries';
import { useMyPickupOrders, type MyPickupOrder } from '@/hooks/useCampaigns';
import PickupOrderCard from '@/components/deliveries/PickupOrderCard';
import ConfirmPickupModal from '@/components/deliveries/ConfirmPickupModal';
import { mediaUrl, mapsDirUrl, haversineKm, UNIT_LABEL } from '@/lib/utils';
import { StatTile } from '@/components/shared/StatTile';
import { Spinner } from '@/components/shared/Spinner';

const QrScanModal = dynamic(() => import('@/components/deliveries/QrScanModal'), { ssr: false });
const HandoverConfirmModal = dynamic(
  () => import('@/components/deliveries/HandoverConfirmModal'),
  { ssr: false },
);

import DeliveryShiftPanel from './DeliveryShiftPanel';

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


// Bước trạng thái giao hàng + hành động kế tiếp
// needsQr: bước hoàn tất phải quét mã QR trên màn hình người nhận (bàn giao đúng người)
const NEXT_STATUS: Record<string, { next: string; label: string; needsPhoto: boolean; needsQr?: boolean }> = {
  assigned: { next: 'heading_to_provider', label: 'Bắt đầu đến lấy hàng', needsPhoto: false },
  heading_to_provider: { next: 'qc_completed', label: 'Đã lấy hàng & kiểm tra (QC)', needsPhoto: true },
  qc_completed: { next: 'in_transit', label: 'Bắt đầu giao cho người nhận', needsPhoto: false },
  in_transit: { next: 'delivered', label: 'Quét mã của người nhận để hoàn tất', needsPhoto: false, needsQr: true },
};

const STEPS = [
  { key: 'assigned', label: 'Đã nhận' },
  { key: 'heading_to_provider', label: 'Đến lấy' },
  { key: 'qc_completed', label: 'QC' },
  { key: 'in_transit', label: 'Đang giao' },
  { key: 'delivered', label: 'Hoàn tất' },
];

function deliveryTitle(delivery: Pick<ActiveDelivery, 'reservation' | 'campaignTransport'> | DeliveryHistoryItem) {
  return delivery.reservation?.listing.title ?? delivery.campaignTransport?.campaignTitle ?? 'Chuyến giao chiến dịch';
}

function deliveryImage(delivery: Pick<ActiveDelivery, 'reservation'> | DeliveryHistoryItem) {
  return delivery.reservation?.listing.imageUrls?.[0] ?? null;
}

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


export default function DeliveriesPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useVolunteerMe();
  const { data: active } = useActiveDelivery();
  // MÔ HÌNH MỚI: shipper trong ca tự xem danh sách đơn quanh mình và chọn đơn —
  // không còn chờ lời mời tuần tự 15s, không còn nút bật/tắt sẵn sàng.
  const { data: myShifts } = useMyDeliveryShifts();
  const [gps, setGps] = useState<{ lng: number; lat: number } | null>(null);
  const { data: nearby, isLoading: nearbyLoading } = useNearbyDeliveries(!active ? gps : null);
  const claimDelivery = useClaimDelivery();
  const { data: stats } = useShipperStats(!!me?.isShipper);
  const { data: history } = useDeliveryHistory({ limit: 3, enabled: !!me?.isShipper });
  const { data: pickupData } = useMyPickupOrders(!!me?.isShipper);
  const updateStatus = useUpdateDeliveryStatus();
  const cancelDelivery = useCancelDelivery();
  const failDelivery = useFailDelivery();
  const updateMyLocation = useUpdateMyLocation();

  // Popup nhận đơn realtime giờ do ShipperOfferWatcher (mount ở layout) đảm nhiệm
  // trên MỌI trang — trang này chỉ hiển thị danh sách offer bên dưới.

  // Khi đang giao đơn → theo dõi GPS liên tục và đẩy vị trí để người nhận xem trực tiếp.
  // watchPosition tự bắn khi tài xế di chuyển; throttle gửi mạng tối đa 1 lần / 10s.
  // liveLoc: vị trí GPS tức thì (không throttle) để marker shipper trên bản đồ tự di chuyển.
  // GPS cho danh sách đơn gần: lấy khi vào trang, làm mới mỗi 2 phút.
  useEffect(() => {
    let mounted = true;
    const refresh = () => void getLocation().then((loc) => { if (mounted) setGps(loc); });
    refresh();
    const t = setInterval(refresh, 120_000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  const [liveLoc, setLiveLoc] = useState<{ lng: number; lat: number } | null>(null);
  /** Đơn nguyên liệu đang mở hộp thoại xác nhận đã lấy. */
  const [pickingUp, setPickingUp] = useState<MyPickupOrder | null>(null);
  const pickupOrders = pickupData ?? [];
  const pendingPickups = pickupOrders.filter(
    (o) => !o.pickup && o.delivery?.status !== 'delivered',
  );
  const activeId = active?.id;
  useEffect(() => {
    if (!activeId || typeof navigator === 'undefined' || !navigator.geolocation) return;
    let cancelled = false;
    let lastSent = 0;
    const send = (lng: number, lat: number, force = false) => {
      if (cancelled) return;
      setLiveLoc({ lng, lat }); // cập nhật marker trên bản đồ ngay, không chờ throttle
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
  const [qrScanOpen, setQrScanOpen] = useState(false); // modal quét QR người nhận (bước hoàn tất)
  // Mã QR đã quét đúng, đang chờ shipper ĐỐI CHIẾU người nhận rồi mới bàn giao
  // (cùng luật với đơn tự đến lấy: quét trúng mã chưa chắc đúng người cầm máy).
  const [handoverToken, setHandoverToken] = useState<string | null>(null);
  const [issueMode, setIssueMode] = useState(false);
  const [issueReason, setIssueReason] = useState('');
  const [openMapId, setOpenMapId] = useState<string | null>(null); // offer đang mở xem lộ trình
  const activeTitle = active ? deliveryTitle(active) : '';
  const activeImage = active ? deliveryImage(active) : null;
  const activeRecipient = active?.reservation?.receiver?.user ?? null;

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

  async function advance(d: ActiveDelivery, photo?: File, qrToken?: string) {
    const step = NEXT_STATUS[d.status];
    if (!step) return;
    try {
      await updateStatus.mutateAsync({ deliveryId: d.id, status: step.next, photo, qrToken });
      setQrScanOpen(false);
      setHandoverToken(null);
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
    if (step.needsQr && d.source === 'reservation') {
      setQrScanOpen(true);
    } else if (step.needsQr || step.needsPhoto) {
      setPendingNext(d.id);
      photoInputRef.current?.click();
    } else {
      void advance(d);
    }
  }

  if (meLoading) {
    return (
      <div className="min-h-screen bg-neutral-50/50 flex items-center justify-center py-20">
        <Spinner size="lg" className="text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      {/* Modal quét mã QR người nhận — bước hoàn tất giao hàng */}
      {qrScanOpen && active && (
        <QrScanModal
          title="Quét mã của người nhận"
          hint={`Nhờ ${active.reservation?.receiver?.user.fullName ?? 'người nhận'} mở trang theo dõi đơn và đưa mã QR để xác nhận bàn giao đúng người.`}
          busy={updateStatus.isPending}
          // Quét xong KHÔNG hoàn tất ngay: mở bước đối chiếu người nhận trước.
          // Đơn của chiến dịch không có hồ sơ người nhận nên vẫn chốt thẳng.
          onResult={(token) => {
            setQrScanOpen(false);
            if (active.reservation) setHandoverToken(token);
            else void advance(active, undefined, token);
          }}
          onClose={() => setQrScanOpen(false)}
        />
      )}

      {/* Đối chiếu người nhận rồi mới bàn giao — giống bước quét QR đơn tự đến lấy */}
      {handoverToken && active && (
        <HandoverConfirmModal
          delivery={active}
          busy={updateStatus.isPending}
          onConfirm={() => void advance(active, undefined, handoverToken)}
          onCancel={() => setHandoverToken(null)}
        />
      )}
      {pickingUp && (
        <ConfirmPickupModal
          order={pickingUp}
          onClose={() => setPickingUp(null)}
          // Chốt xong thì đơn rời khỏi danh sách "chờ lấy" — đưa thẳng sang lịch sử
          // để shipper thấy biên nhận vừa ghi, thay vì đứng trước một chỗ trống.
          onDone={() => {
            setPickingUp(null);
            router.push('/deliveries/history?tab=pickups');
          }}
        />
      )}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-12 py-6 md:py-10 space-y-6 md:space-y-8">
        {/* Header + availability toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-extrabold text-3xl text-neutral-900">Trung tâm giao hàng</h1>
              <Link
                href="/deliveries/bulk"
                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-full text-xs font-extrabold flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                Giao sỉ nhiều điểm
              </Link>
            </div>
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

          {/* Nút bật/tắt sẵn sàng đã bỏ: trạng thái nhận đơn giờ đi theo CA đã đăng ký.
              Chip này chỉ phản ánh, không bấm được — muốn đổi thì sửa lịch ca bên dưới. */}
          {(() => {
            const nowVn = new Date(Date.now() + 7 * 3600_000);
            const hour = nowVn.getUTCHours();
            const period = hour < 6 ? 'midnight' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
            const todayKey = nowVn.toISOString().slice(0, 10);
            const onDuty = (myShifts?.slots ?? []).some((sl) => sl.workDate === todayKey && sl.period === period);
            return (
              <div
                className={`min-h-12 w-full sm:w-auto justify-center flex items-center gap-3 px-5 py-3 rounded-2xl font-bold text-sm shadow-sm ${
                  onDuty ? 'bg-emerald-600 text-white' : 'bg-white text-neutral-700 border border-neutral-200'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${onDuty ? 'bg-white animate-pulse' : 'bg-neutral-400'}`} />
                {onDuty ? 'Đang trong ca giao hàng' : 'Ngoài ca — đăng ký ca để nhận đơn'}
              </div>
            );
          })()}
        </div>

        {/* Bảng thành tích shipper (kiểu dashboard tài xế) */}
        {me?.isShipper && stats && (
          <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-3xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-lg text-neutral-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">workspace_premium</span>
                Thành tích của bạn
              </h2>
              <span className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold">
                Hạng {RANK_LABEL[stats.rank] ?? stats.rank}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
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
            <div className="p-4 sm:p-6 border-b border-neutral-100 flex items-center gap-3 sm:gap-4">
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-neutral-100 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeImage ? mediaUrl(activeImage) : '/food_bread.png'}
                  alt={activeTitle}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-neutral-900 truncate">
                  {activeTitle}
                </h3>
                <p className="text-xs text-neutral-500 truncate">
                  {active.pickup.address ?? 'Chưa có địa chỉ lấy hàng'}
                </p>
              </div>
            </div>

            {/* Cảnh báo pickup time — chỉ hiện khi có thông tin giờ lấy hàng (campaign transport) */}
            {active.source === 'campaign_transport' && active.campaignTransport && (
              <div className="mx-6 mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <span className="material-symbols-outlined text-amber-600 text-[20px] mt-0.5 shrink-0">schedule</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-amber-800">
                    Thông tin lấy hàng từ nhà cung cấp
                  </p>
                  {active.campaignTransport.pickupStartTime && (
                    <p className="text-sm font-extrabold text-amber-900 mt-1">
                      ⏰ Đến lấy:{' '}
                      <span className="bg-amber-200 px-2 py-0.5 rounded-lg">
                        {active.campaignTransport.pickupStartTime}
                        {active.campaignTransport.pickupEndTime
                          ? ` – ${active.campaignTransport.pickupEndTime}`
                          : ''}
                      </span>
                    </p>
                  )}
                  {active.campaignTransport.providerName && (
                    <p className="text-xs text-amber-700 mt-1">
                      Nhà cung cấp: <span className="font-semibold">{active.campaignTransport.providerName}</span>
                    </p>
                  )}
                  {active.campaignTransport.providerAddress && (
                    <p className="text-xs text-amber-700">
                      Địa chỉ: {active.campaignTransport.providerAddress}
                    </p>
                  )}
                  {active.status !== 'qc_completed' && active.status !== 'in_transit' && (
                    <p className="text-[11px] text-amber-600 mt-2 italic">
                      ⚠️ Đến muộn từ 60 phút trở lên sẽ bị trừ 10 điểm trust.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Steps */}
            <div className="p-4 sm:p-6">
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

              <div className="bg-neutral-50 rounded-2xl p-4 flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase">
                    {active.source === 'campaign_transport' ? 'Bếp nhận hàng' : 'Người nhận'}
                  </p>
                  <p className="font-bold text-neutral-800 text-sm">
                    {activeRecipient?.fullName ?? active.campaignTransport?.campaignTitle ?? 'Điểm giao chiến dịch'}
                  </p>
                  {active.source === 'campaign_transport' && active.destination.address && (
                    <p className="text-xs text-neutral-500 mt-1">{active.destination.address}</p>
                  )}
                </div>
                {activeRecipient?.phone && (
                  <a
                    href={`tel:${activeRecipient.phone}`}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-emerald-700 hover:bg-emerald-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">call</span>
                    Gọi
                  </a>
                )}
              </div>

              {/* Bản đồ lộ trình lấy → giao (marker shipper chạy theo GPS trực tiếp) */}
              {(active.coords?.pickupLat != null || active.coords?.deliveryLat != null || liveLoc || me?.currentLocation) && (
                <div className="h-56 rounded-2xl overflow-hidden border border-neutral-150 mb-5">
                  <DeliveryRouteMap
                    pickup={
                      active.coords?.pickupLat != null && active.coords?.pickupLng != null
                        ? { lat: active.coords.pickupLat, lng: active.coords.pickupLng }
                        : null
                    }
                    delivery={
                      active.coords?.deliveryLat != null && active.coords?.deliveryLng != null
                        ? { lat: active.coords.deliveryLat, lng: active.coords.deliveryLng }
                        : null
                    }
                    shipper={liveLoc ?? me?.currentLocation ?? null}
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
                const addr = toPickup ? active.pickup.address : active.destination.address;
                const myLoc = liveLoc ?? me?.currentLocation;
                const fromMe =
                  myLoc && tLat != null && tLng != null
                    ? haversineKm(myLoc, { lat: tLat, lng: tLng })
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
                          className="shrink-0 min-h-11 flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-bold"
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
                    <Spinner size="sm" className="text-white" />
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[20px]">
                        {NEXT_STATUS[active.status].needsQr && active.source === 'reservation'
                          ? 'qr_code_scanner'
                          : NEXT_STATUS[active.status].needsPhoto || NEXT_STATUS[active.status].needsQr
                            ? 'photo_camera'
                            : 'arrow_forward'}
                      </span>
                      {NEXT_STATUS[active.status].needsQr && active.source === 'campaign_transport'
                        ? 'Chụp ảnh bàn giao cho bếp'
                        : NEXT_STATUS[active.status].label}
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
          /* DANH SÁCH ĐƠN CHỜ — shipper tự chọn (thay lời mời tuần tự 15s) */
          <div className="space-y-4">
            <DeliveryShiftPanel />

            <h2 className="font-extrabold text-xl text-neutral-900">
              Đơn giao gần bạn {nearby && nearby.length > 0 ? `(${nearby.length})` : ''}
            </h2>

            {!gps && (
              <div className="text-center py-10 bg-white rounded-3xl border border-neutral-200">
                <span className="material-symbols-outlined text-neutral-300 text-[48px]">my_location</span>
                <p className="font-bold text-neutral-700 mt-3">Đang xác định vị trí của bạn…</p>
                <p className="text-xs text-neutral-500 mt-1">Cho phép trình duyệt truy cập GPS để xem đơn trong bán kính 5km.</p>
              </div>
            )}

            {gps && !nearbyLoading && (!nearby || nearby.length === 0) && (
              <div className="text-center py-12 bg-white rounded-3xl border border-neutral-200">
                <span className="material-symbols-outlined text-neutral-300 text-[56px]">inbox</span>
                <p className="font-bold text-neutral-700 mt-3">Chưa có đơn nào quanh bạn</p>
                <p className="text-xs text-neutral-500 mt-1">
                  Đơn trong bán kính 5km sẽ hiện ở đây (tự làm mới mỗi 20 giây). Bạn chỉ nhận được đơn thuộc ca đã đăng ký.
                </p>
              </div>
            )}

            {gps &&
              nearby?.map((o) => (
                <div key={o.deliveryId} className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-4 sm:p-5">
                  <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center gap-4">
                    <div className="w-full min-[420px]:w-16 h-36 min-[420px]:h-16 rounded-2xl overflow-hidden bg-neutral-100 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={o.imageUrls[0] ? mediaUrl(o.imageUrls[0]) : '/food_bread.png'}
                        onError={(e) => {
                          if (!e.currentTarget.src.endsWith('/food_bread.png')) e.currentTarget.src = '/food_bread.png';
                        }}
                        alt={o.listingTitle}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-extrabold text-neutral-900 truncate">{o.listingTitle}</h3>
                      <p className="text-xs text-neutral-500 truncate flex items-center gap-1 mt-0.5">
                        <span className="material-symbols-outlined text-[14px]">storefront</span>
                        Lấy tại: {o.pickupAddress}
                      </p>
                      {o.deliveryAddress && (
                        <p className="text-xs text-neutral-500 truncate flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-[14px]">place</span>
                          Giao đến: {o.deliveryAddress}
                        </p>
                      )}
                      <p className="text-xs text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-emerald-700">Cách bạn ~{o.distanceKm} km</span>
                        {o.tripKm != null && <span>· Lấy→giao ~{o.tripKm} km</span>}
                      </p>
                      {/* Giờ hẹn giao — khác đơn giao ngay */}
                      {o.deliveryScheduledAt ? (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">
                          <span className="material-symbols-outlined text-[13px]">schedule</span>
                          Hẹn giao {new Date(o.deliveryScheduledAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </p>
                      ) : (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                          <span className="material-symbols-outlined text-[13px]">bolt</span>
                          Giao ngay
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bằng chứng người nhận khó di chuyển — xem trước khi nhận đơn */}
                  {o.deliveryEvidenceUrl && (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900">
                        <span className="material-symbols-outlined text-[16px]">accessible</span>
                        Bằng chứng người nhận khó di chuyển
                      </p>
                      <a href={mediaUrl(o.deliveryEvidenceUrl)} target="_blank" rel="noreferrer" className="mt-2 block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mediaUrl(o.deliveryEvidenceUrl)}
                          alt="Bằng chứng khó di chuyển của người nhận"
                          className="h-32 w-full rounded-xl border border-amber-200 object-cover"
                        />
                      </a>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      try {
                        await claimDelivery.mutateAsync(o.deliveryId);
                        toast.success('Bạn đã nhận đơn — tới điểm lấy hàng nhé!');
                      } catch (err: unknown) {
                        const msg = (err as { response?: { data?: { error?: { message?: string } } } })
                          ?.response?.data?.error?.message ?? 'Không nhận được đơn này';
                        toast.error(msg);
                      }
                    }}
                    disabled={!o.canClaim || claimDelivery.isPending}
                    title={
                      o.busyWithCampaign
                        ? 'Bạn đã xác nhận ca chiến dịch trong khung giờ này'
                        : !o.canClaim
                          ? 'Đơn này nằm ngoài ca bạn đã đăng ký'
                          : undefined
                    }
                    className="mt-4 w-full min-h-12 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {claimDelivery.isPending
                      ? 'Đang nhận…'
                      : o.canClaim
                        ? 'Nhận đơn này'
                        : o.busyWithCampaign
                          ? 'Bận ca chiến dịch khung giờ này'
                          : 'Ngoài ca đã đăng ký'}
                  </button>
                </div>
              ))}
          </div>
        )}


        {/* ĐƠN LẤY NGUYÊN LIỆU CHIẾN DỊCH
            Không phải bản ghi `deliveries` nên không nằm trong luồng nhận/giao ở trên,
            nhưng vẫn là "đơn phải đi lấy" của shipper — gom về đây để quản lý một chỗ. */}
        {me?.isShipper && pendingPickups.length > 0 && (
          <div className="space-y-4 mt-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-extrabold text-xl text-neutral-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">inventory</span>
                Đơn lấy nguyên liệu
              </h2>
              <Link
                href="/deliveries/history?tab=pickups"
                className="text-sm font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                Đơn đã lấy
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </Link>
            </div>
            <div className="space-y-3">
              {pendingPickups.map((o) => (
                <PickupOrderCard key={o.id} order={o} onConfirm={setPickingUp} />
              ))}
            </div>
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
  const recipient = h.reservation?.receiver?.user.fullName ?? h.campaignTransport?.campaignTitle ?? 'Bếp chiến dịch';
  const image = h.deliveryProofUrl ?? deliveryImage(h);
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 flex items-center gap-4">
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-neutral-100 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image ? mediaUrl(image) : '/food_bread.png'}
          alt={deliveryTitle(h)}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-neutral-900 truncate">{deliveryTitle(h)}</h3>
        <p className="text-xs text-neutral-500 truncate flex items-center gap-1 mt-0.5">
          <span className="material-symbols-outlined text-[14px]">person</span>
          Giao cho {recipient}
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
