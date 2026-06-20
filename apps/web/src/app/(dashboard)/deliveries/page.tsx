'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  useVolunteerMe,
  useMyOffers,
  useActiveDelivery,
  useSetAvailability,
  useAcceptOffer,
  useRejectOffer,
  useUpdateDeliveryStatus,
  type ActiveDelivery,
} from '@/hooks/useDeliveries';

const HCM = { lng: 106.6297, lat: 10.8231 };

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

export default function DeliveriesPage() {
  const { data: me, isLoading: meLoading } = useVolunteerMe();
  const { data: active } = useActiveDelivery();
  const { data: offers } = useMyOffers(!active); // chỉ poll offers khi chưa có đơn đang giao
  const setAvailability = useSetAvailability();
  const acceptOffer = useAcceptOffer();
  const rejectOffer = useRejectOffer();
  const updateStatus = useUpdateDeliveryStatus();

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [pendingNext, setPendingNext] = useState<string | null>(null);

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
                      <p className="text-xs text-neutral-500 mt-1">
                        Hết hạn sau <OfferCountdown expiresAt={o.expiresAt} />
                      </p>
                    </div>
                  </div>

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
      </div>
    </div>
  );
}
