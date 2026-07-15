'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { useListings } from '@/hooks/useListings';
import {
  BULK_MIN_QTY,
  isActiveRun,
  useMyBulkRuns,
  useRequestBulkRun,
  usePickupBulkRun,
  useAddBulkStop,
  useServeBulkStop,
  useCompleteBulkRun,
  useCancelBulkRun,
  type BulkRun,
  type BulkStop,
} from '@/hooks/useBulkRuns';
import { errMsg, mediaUrl } from '@/lib/utils';
import { reverseGeocode } from '@/lib/geocode';
import { Spinner } from '@/components/shared/Spinner';

const DeliveryRouteMap = dynamic(() => import('@/components/map/DeliveryRouteMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-neutral-100 animate-pulse" />,
});
const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-neutral-100 animate-pulse" />,
});

const HCM = { lng: 106.6297, lat: 10.8231 };

const STATUS_VI: Record<BulkRun['status'], { label: string; cls: string }> = {
  requested: { label: 'Chờ nhà cung cấp duyệt', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Đã duyệt — đến lấy hàng', cls: 'bg-sky-100 text-sky-700' },
  picked_up: { label: 'Đang phát trên tuyến', cls: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'Hoàn tất', cls: 'bg-emerald-600 text-white' },
  rejected: { label: 'Bị từ chối', cls: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-neutral-200 text-neutral-600' },
};

/** Form ghim điểm phát: nhãn + bản đồ kéo ghim (GPS làm điểm khởi đầu). */
function AddStopForm({ busy, onAdd, onClose }: {
  busy: boolean;
  onAdd: (p: { label: string; address?: string; lng: number; lat: number; plannedQty?: number }) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [plannedQty, setPlannedQty] = useState('');
  const [coords, setCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [address, setAddress] = useState('');
  const [locating, setLocating] = useState(false);

  const useGps = () => {
    if (!navigator.geolocation) return toast.error('Trình duyệt không hỗ trợ định vị.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const c = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setCoords(c);
        setAddress((await reverseGeocode(c.lat, c.lng)) ?? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
        setLocating(false);
      },
      () => { toast.error('Không lấy được vị trí.'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="bg-white border border-emerald-200 rounded-2xl p-4 space-y-3">
      <p className="text-sm font-bold text-neutral-800">Ghim điểm phát mới</p>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Tên điểm phát (vd: Chân cầu Sài Gòn)"
        className="w-full border border-neutral-200 rounded-xl p-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <div className="flex gap-2">
        <input
          value={plannedQty}
          onChange={(e) => setPlannedQty(e.target.value.replace(/\D/g, ''))}
          placeholder="Số phần dự kiến (tuỳ chọn)"
          inputMode="numeric"
          className="flex-1 border border-neutral-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={useGps}
          disabled={locating}
          className="shrink-0 px-3 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 disabled:opacity-50"
          title="Dùng vị trí hiện tại"
        >
          <span className={`material-symbols-outlined text-[20px] ${locating ? 'animate-pulse' : ''}`}>my_location</span>
        </button>
      </div>
      {coords ? (
        <>
          <div className="h-44 rounded-xl overflow-hidden border border-neutral-200">
            <LocationPicker
              lng={coords.lng}
              lat={coords.lat}
              onPick={(lng, lat) => {
                setCoords({ lng, lat });
                void reverseGeocode(lat, lng).then((a) => a && setAddress(a));
              }}
            />
          </div>
          {address && <p className="text-[11px] text-neutral-500">{address}</p>}
        </>
      ) : (
        <p className="text-[11px] text-amber-600 font-semibold">Bấm nút định vị để ghim vị trí điểm phát.</p>
      )}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-50">
          Đóng
        </button>
        <button
          onClick={() => {
            if (!label.trim()) return toast.error('Nhập tên điểm phát.');
            if (!coords) return toast.error('Chưa ghim vị trí.');
            onAdd({
              label: label.trim(),
              address: address || undefined,
              lng: coords.lng,
              lat: coords.lat,
              plannedQty: plannedQty ? Number(plannedQty) : undefined,
            });
          }}
          disabled={busy}
          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
        >
          {busy ? 'Đang thêm...' : 'Thêm điểm phát'}
        </button>
      </div>
    </div>
  );
}

/** Một điểm phát trong danh sách: log số phần đã phát tại điểm. */
function StopRow({ stop, index, remaining, canServe, busy, onServe }: {
  stop: BulkStop;
  index: number;
  remaining: number;
  canServe: boolean;
  busy: boolean;
  onServe: (servedQty: number, note?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const served = stop.servedQty > 0;

  return (
    <div className={`rounded-xl border p-3 ${served ? 'border-emerald-200 bg-emerald-50/50' : 'border-neutral-200 bg-white'}`}>
      <div className="flex items-center gap-2.5">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold text-white shrink-0 ${served ? 'bg-emerald-600' : 'bg-amber-500'}`}>
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-neutral-800 truncate">{stop.label}</p>
          <p className="text-[11px] text-neutral-500 truncate">
            {stop.address ?? '—'} · {stop.createdBy === 'provider' ? 'NCC ghim' : 'Shipper ghim'}
            {stop.plannedQty ? ` · dự kiến ${stop.plannedQty} phần` : ''}
          </p>
        </div>
        {served ? (
          <span className="text-xs font-extrabold text-emerald-700 shrink-0">✓ {stop.servedQty} phần</span>
        ) : canServe ? (
          <button onClick={() => setOpen((v) => !v)} className="text-xs font-bold text-emerald-700 hover:underline shrink-0">
            Phát tại đây
          </button>
        ) : null}
      </div>
      {open && canServe && (
        <div className="mt-2.5 flex gap-2">
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
            placeholder={`Số phần (còn ${remaining})`}
            inputMode="numeric"
            className="flex-1 border border-neutral-200 rounded-xl p-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={() => {
              const n = Number(qty);
              if (!n || n < 1) return toast.error('Nhập số phần đã phát.');
              if (n > remaining) return toast.error(`Chỉ còn ${remaining} phần chưa phát.`);
              onServe(n);
              setOpen(false);
              setQty('');
            }}
            disabled={busy}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
          >
            Ghi nhận
          </button>
        </div>
      )}
    </div>
  );
}

export default function BulkRunsPage() {
  const { data: runs, isLoading } = useMyBulkRuns();
  const requestRun = useRequestBulkRun();
  const pickupRun = usePickupBulkRun();
  const addStop = useAddBulkStop();
  const serveStop = useServeBulkStop();
  const completeRun = useCompleteBulkRun();
  const cancelRun = useCancelBulkRun();

  const [quantity, setQuantity] = useState('');
  const [selectedListing, setSelectedListing] = useState<string | null>(null);
  const [showAddStop, setShowAddStop] = useState(false);

  const active = useMemo(() => (runs ?? []).find(isActiveRun) ?? null, [runs]);
  const history = useMemo(() => (runs ?? []).filter((r) => !isActiveRun(r)).slice(0, 5), [runs]);

  // Listing đủ điều kiện giao sỉ quanh HCM (kho còn ≥ ngưỡng)
  const { data: nearby } = useListings({ lat: HCM.lat, lng: HCM.lng, radiusKm: 15 });
  const eligible = useMemo(
    () => (nearby ?? []).filter((l) => l.quantityRemaining >= BULK_MIN_QTY).slice(0, 12),
    [nearby],
  );

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      toast.success(okMsg);
    } catch (e) {
      toast.error(errMsg(e, 'Thao tác thất bại.'));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" className="text-emerald-600" />
      </div>
    );
  }

  const remaining = active ? active.quantity - active.quantityDistributed : 0;

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-extrabold text-3xl text-neutral-900">Giao sỉ nhiều điểm</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Nhận từ {BULK_MIN_QTY} phần trở lên và phát tại nhiều điểm trên tuyến đường của bạn.
            </p>
          </div>
          <Link href="/deliveries" className="text-sm font-bold text-emerald-700 hover:underline shrink-0">
            ← Giao đơn lẻ
          </Link>
        </div>

        {/* ── Chuyến đang chạy ── */}
        {active ? (
          <div className="bg-white rounded-3xl border border-neutral-150 shadow-sm overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-extrabold text-lg text-neutral-900 truncate">{active.listing.title}</p>
                  <p className="text-xs text-neutral-500 truncate">
                    Lấy tại: {active.listing.pickupAddress}
                    {active.provider ? ` · ${active.provider.businessName}` : ''}
                  </p>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-xs font-extrabold shrink-0 ${STATUS_VI[active.status].cls}`}>
                  {STATUS_VI[active.status].label}
                </span>
              </div>

              {/* Tiến độ phát */}
              <div>
                <div className="flex justify-between text-xs font-bold text-neutral-600 mb-1">
                  <span>Đã phát {active.quantityDistributed}/{active.quantity} phần</span>
                  <span>{remaining} phần còn lại</span>
                </div>
                <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all"
                    style={{ width: `${Math.round((active.quantityDistributed / active.quantity) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Bản đồ tuyến: điểm lấy + các điểm phát đánh số */}
              {(active.pickupCoords || active.stops.some((s) => s.coords)) && (
                <div className="h-56 rounded-2xl overflow-hidden border border-neutral-150">
                  <DeliveryRouteMap
                    pickup={active.pickupCoords ? { lat: active.pickupCoords.lat, lng: active.pickupCoords.lng } : null}
                    stops={active.stops
                      .filter((s) => s.coords)
                      .map((s) => ({ lat: s.coords!.lat, lng: s.coords!.lng, served: s.servedQty > 0 }))}
                  />
                </div>
              )}

              {/* Danh sách điểm phát */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-neutral-800">
                    Điểm phát ({active.stops.length})
                  </p>
                  {['requested', 'approved', 'picked_up'].includes(active.status) && (
                    <button onClick={() => setShowAddStop((v) => !v)} className="text-xs font-bold text-emerald-700 hover:underline">
                      + Ghim điểm phát
                    </button>
                  )}
                </div>
                {showAddStop && (
                  <AddStopForm
                    busy={addStop.isPending}
                    onClose={() => setShowAddStop(false)}
                    onAdd={(p) =>
                      void act(async () => {
                        await addStop.mutateAsync({ runId: active.id, ...p });
                        setShowAddStop(false);
                      }, 'Đã ghim điểm phát.')
                    }
                  />
                )}
                {active.stops.length === 0 && !showAddStop && (
                  <p className="text-xs text-neutral-400">
                    Chưa có điểm phát nào — bạn hoặc nhà cung cấp ghim điểm trên tuyến để bắt đầu.
                  </p>
                )}
                {active.stops.map((s, i) => (
                  <StopRow
                    key={s.id}
                    stop={s}
                    index={i}
                    remaining={remaining}
                    canServe={active.status === 'picked_up'}
                    busy={serveStop.isPending}
                    onServe={(servedQty, note) =>
                      void act(
                        () => serveStop.mutateAsync({ runId: active.id, stopId: s.id, servedQty, note }),
                        'Đã ghi nhận phát hàng.',
                      )
                    }
                  />
                ))}
              </div>

              {/* Hành động theo trạng thái */}
              {active.status === 'requested' && (
                <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-700 font-semibold">
                    Đang chờ nhà cung cấp duyệt ({active.quantity} phần). Yêu cầu tự hết hạn sau 24h.
                  </p>
                  <button
                    onClick={() => void act(() => cancelRun.mutateAsync(active.id), 'Đã huỷ yêu cầu.')}
                    disabled={cancelRun.isPending}
                    className="text-xs font-bold text-rose-600 hover:underline shrink-0 disabled:opacity-50"
                  >
                    Huỷ yêu cầu
                  </button>
                </div>
              )}
              {active.status === 'approved' && (
                <div className="space-y-2">
                  <button
                    onClick={() => void act(() => pickupRun.mutateAsync({ runId: active.id }), 'Đã xác nhận lấy hàng — bắt đầu phát!')}
                    disabled={pickupRun.isPending}
                    className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-extrabold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[20px]">inventory</span>
                    Đã nhận {active.quantity} phần từ cửa hàng
                  </button>
                  <button
                    onClick={() => void act(() => cancelRun.mutateAsync(active.id), 'Đã huỷ chuyến — kho được hoàn lại.')}
                    disabled={cancelRun.isPending}
                    className="w-full text-center text-xs font-bold text-rose-600 hover:underline disabled:opacity-50"
                  >
                    Huỷ chuyến (hoàn kho cho cửa hàng)
                  </button>
                </div>
              )}
              {active.status === 'picked_up' && (
                <button
                  onClick={() =>
                    void act(
                      () => completeRun.mutateAsync(active.id),
                      remaining > 0 ? `Đã kết thúc — ${remaining} phần dư hoàn về tin.` : 'Chuyến hoàn tất!',
                    )
                  }
                  disabled={completeRun.isPending}
                  className="w-full py-3 border-2 border-emerald-700 text-emerald-700 hover:bg-emerald-50 rounded-2xl font-extrabold text-sm disabled:opacity-50"
                >
                  {remaining > 0 ? `Kết thúc chuyến (còn dư ${remaining} phần)` : 'Hoàn tất chuyến'}
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ── Form yêu cầu chuyến mới ── */
          <div className="bg-white rounded-3xl border border-neutral-150 shadow-sm p-5 space-y-4">
            <p className="font-extrabold text-neutral-900">Tạo yêu cầu giao sỉ</p>
            {eligible.length === 0 ? (
              <p className="text-sm text-neutral-400">
                Hiện chưa có tin nào còn đủ {BULK_MIN_QTY} phần quanh khu vực. Quay lại sau nhé.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {eligible.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setSelectedListing(l.id)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        selectedListing === l.id
                          ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600'
                          : 'border-neutral-200 hover:border-emerald-300'
                      }`}
                    >
                      <p className="text-sm font-bold text-neutral-800 truncate">{l.title}</p>
                      <p className="text-[11px] text-neutral-500 truncate">{l.pickupAddress}</p>
                      <p className="text-[11px] font-bold text-emerald-700 mt-0.5">Còn {l.quantityRemaining} {l.quantityUnit}</p>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
                    placeholder={`Số phần muốn nhận (≥ ${BULK_MIN_QTY})`}
                    inputMode="numeric"
                    className="flex-1 border border-neutral-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => {
                      const q = Number(quantity);
                      if (!selectedListing) return toast.error('Chọn một tin thực phẩm.');
                      if (!q || q < BULK_MIN_QTY) return toast.error(`Giao sỉ tối thiểu ${BULK_MIN_QTY} phần.`);
                      void act(async () => {
                        await requestRun.mutateAsync({ listingId: selectedListing, quantity: q });
                        setQuantity('');
                        setSelectedListing(null);
                      }, 'Đã gửi yêu cầu — chờ nhà cung cấp duyệt.');
                    }}
                    disabled={requestRun.isPending}
                    className="px-5 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-extrabold disabled:opacity-50"
                  >
                    {requestRun.isPending ? 'Đang gửi...' : 'Gửi yêu cầu'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Lịch sử gần đây ── */}
        {history.length > 0 && (
          <div className="bg-white rounded-3xl border border-neutral-150 shadow-sm p-5 space-y-3">
            <p className="font-extrabold text-neutral-900">Chuyến gần đây</p>
            {history.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-neutral-100 last:border-0 pb-2.5 last:pb-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(r.listing.imageUrls?.[0] ?? '') || '/banh-mi.png'}
                  alt={r.listing.title}
                  className="w-10 h-10 rounded-xl object-cover bg-neutral-100 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-neutral-800 truncate">{r.listing.title}</p>
                  <p className="text-[11px] text-neutral-500">
                    {r.quantityDistributed}/{r.quantity} phần · {r.stops.filter((s) => s.servedQty > 0).length} điểm phát
                    {r.rejectReason ? ` · ${r.rejectReason}` : ''}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold shrink-0 ${STATUS_VI[r.status].cls}`}>
                  {STATUS_VI[r.status].label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
