'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { useListings } from '@/hooks/useListings';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import {
  BULK_MIN_QTY,
  BULK_CANCEL_PENALTY,
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
import { errMsg, mediaUrl, UNIT_LABEL } from '@/lib/utils';
import { QuantityUnit } from '@foodresq/types';
import { Spinner } from '@/components/shared/Spinner';
import { Modal } from '@/components/shared/Modal';
import BulkRunConfirmModal from '@/components/deliveries/BulkRunConfirmModal';
import BulkStopForm from '@/components/deliveries/BulkStopForm';
import RunDeadline from '@/components/deliveries/RunDeadline';

const DeliveryRouteMap = dynamic(() => import('@/components/map/DeliveryRouteMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-neutral-100 animate-pulse" />,
});

// Bán kính tìm tin cho giao sỉ — khớp bán kính mời shipper của đơn lẻ (5km), để
// shipper không phải chạy quá xa chỉ để lấy hàng.
const BULK_RADIUS_KM = 5;

const STATUS_VI: Record<BulkRun['status'], { label: string; cls: string }> = {
  requested: { label: 'Chờ nhà cung cấp duyệt', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Đã duyệt — đến lấy hàng', cls: 'bg-sky-100 text-sky-700' },
  picked_up: { label: 'Đang phát trên tuyến', cls: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'Hoàn tất', cls: 'bg-emerald-600 text-white' },
  rejected: { label: 'Bị từ chối', cls: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-neutral-200 text-neutral-600' },
};

/** Một điểm phát trong danh sách: hiện QR code + log số phần đã phát. */
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

      {/* Serve form */}
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
  const [confirming, setConfirming] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const active = useMemo(() => (runs ?? []).find(isActiveRun) ?? null, [runs]);
  const history = useMemo(() => (runs ?? []).filter((r) => !isActiveRun(r)).slice(0, 5), [runs]);

  // Tin quanh VỊ TRÍ THẬT của shipper, không phải một điểm cố định giữa thành phố —
  // shipper ở Thủ Đức mà hiện tin Quận 1 thì không đi lấy nổi.
  const { data: volunteer } = useVolunteerMe();
  const origin = volunteer?.currentLocation ?? null;
  const { data: nearby, isLoading: loadingNearby } = useListings(
    origin ? { lat: origin.lat, lng: origin.lng, radiusKm: BULK_RADIUS_KM } : {},
    !!origin,
  );
  // Mốc thời gian chốt lúc mở trang — chỉ dùng để LỌC HIỂN THỊ. Kiểm tra quyết định
  // vẫn nằm ở validate() lúc bấm gửi và ở backend, nên tin hết hạn giữa chừng không lọt.
  const [openedAt] = useState(() => Date.now());
  // Chỉ hiện tin còn đủ hàng, còn hiệu lực và chưa quá giờ nhận — tránh để shipper
  // chọn rồi mới bị backend từ chối.
  const eligible = useMemo(
    () =>
      (nearby ?? [])
        .filter(
          (l) =>
            l.quantityRemaining >= BULK_MIN_QTY &&
            l.status === 'active' &&
            new Date(l.pickupEndTime).getTime() > openedAt,
        )
        .slice(0, 12),
    [nearby, openedAt],
  );
  const picked = useMemo(
    () => eligible.find((l) => l.id === selectedListing) ?? null,
    [eligible, selectedListing],
  );
  const pickedUnit = picked
    ? UNIT_LABEL[picked.quantityUnit as QuantityUnit] ?? picked.quantityUnit
    : 'phần';

  /** Kiểm tra đầu vào trước khi mở popup xác nhận. Trả lỗi đầu tiên gặp phải. */
  const validate = (): string | null => {
    if (!picked) return 'Chọn một tin thực phẩm.';
    const q = Number(quantity);
    if (!quantity || Number.isNaN(q) || q <= 0) return 'Nhập số lượng muốn nhận.';
    if (q < BULK_MIN_QTY) return `Giao sỉ tối thiểu ${BULK_MIN_QTY} ${pickedUnit}.`;
    if (q > picked.quantityRemaining) {
      return `Kho chỉ còn ${picked.quantityRemaining} ${pickedUnit} — không đủ cho yêu cầu này.`;
    }
    if (new Date(picked.pickupEndTime).getTime() <= Date.now()) {
      return 'Tin này đã quá giờ nhận hàng.';
    }
    return null;
  };

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

              {/* Hạn chót giai đoạn — hết hạn hệ thống tự đóng và hoàn kho */}
              <RunDeadline
                deadlineAt={active.deadlineAt}
                label={
                  active.status === 'requested'
                    ? 'để NCC duyệt'
                    : active.status === 'approved'
                      ? 'để bạn đến lấy hàng'
                      : 'để phát xong'
                }
              />

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
                  {/* Chỉ ghim điểm sau khi được duyệt — lúc còn chờ duyệt thì chưa
                      chắc có hàng, lên tuyến trước là công cốc nếu NCC từ chối. */}
                  {['approved', 'picked_up'].includes(active.status) && (
                    <button onClick={() => setShowAddStop((v) => !v)} className="text-xs font-bold text-emerald-700 hover:underline">
                      + Ghim điểm phát
                    </button>
                  )}
                </div>
                {showAddStop && (
                  <BulkStopForm
                    busy={addStop.isPending}
                    defaultCoords={active.pickupCoords}
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
                    {active.status === 'requested'
                      ? 'Ghim điểm phát sau khi nhà cung cấp duyệt. Nhà cung cấp cũng có thể gợi ý sẵn điểm cho bạn.'
                      : 'Chưa có điểm phát nào — ghim điểm trên tuyến để bắt đầu.'}
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
                  {/* Chuyến ĐÃ DUYỆT: kho đã bị giữ cho bạn → huỷ là bị trừ điểm.
                      Phải xác nhận rõ trước khi gọi API, không để bấm nhầm. */}
                  <button
                    onClick={() => setConfirmCancel(true)}
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
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-extrabold text-neutral-900">Tạo yêu cầu giao sỉ</p>
              {origin && (
                <span className="text-[11px] text-neutral-400">
                  Trong bán kính {BULK_RADIUS_KM} km quanh bạn
                </span>
              )}
            </div>
            {!origin ? (
              /* Chưa có toạ độ → không thể biết tin nào gần. Bật sẵn sàng sẽ ghi lại GPS. */
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-900">Chưa xác định được vị trí của bạn</p>
                <p className="text-xs text-amber-800/80 mt-1 leading-relaxed">
                  Hãy bật <strong>&ldquo;Đang sẵn sàng&rdquo;</strong> ở trang Tổng quan để cập nhật vị trí.
                  Hệ thống cần vị trí để chỉ hiện những cửa hàng bạn đi lấy được.
                </p>
                <Link
                  href="/deliveries"
                  className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold"
                >
                  <span className="material-symbols-outlined text-[16px]">my_location</span>
                  Tới trang Tổng quan
                </Link>
              </div>
            ) : loadingNearby ? (
              <p className="text-sm text-neutral-400">Đang tìm tin quanh bạn…</p>
            ) : eligible.length === 0 ? (
              <p className="text-sm text-neutral-400">
                Chưa có tin nào còn đủ {BULK_MIN_QTY} phần trong bán kính {BULK_RADIUS_KM} km quanh bạn. Quay lại sau nhé.
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
                      <p className="text-[11px] text-neutral-500 truncate">{l.provider.businessName}</p>
                      <p className="text-[11px] text-neutral-400 truncate">{l.pickupAddress}</p>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-[11px] font-bold text-emerald-700">
                          Còn {l.quantityRemaining} {UNIT_LABEL[l.quantityUnit as QuantityUnit] ?? l.quantityUnit}
                        </p>
                        <span className="text-[10px] text-neutral-400 shrink-0">
                          ~{(l.distanceM / 1000).toFixed(1)} km
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Đơn vị bám theo tin đang chọn (phần / cái / lít / kg…) */}
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
                      placeholder={
                        picked
                          ? `Số ${pickedUnit} muốn nhận (${BULK_MIN_QTY}–${picked.quantityRemaining})`
                          : 'Chọn tin thực phẩm trước'
                      }
                      inputMode="numeric"
                      disabled={!picked}
                      className="w-full border border-neutral-200 rounded-xl p-3 pr-16 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-50 disabled:text-neutral-400"
                    />
                    {picked && quantity && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400">
                        {pickedUnit}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const err = validate();
                      if (err) return toast.error(err);
                      setConfirming(true);
                    }}
                    disabled={requestRun.isPending}
                    className="px-5 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-extrabold disabled:opacity-50"
                  >
                    Tiếp tục
                  </button>
                </div>
                {picked && (
                  <p className="text-[11px] text-neutral-400 -mt-1">
                    Bạn sẽ xem lại chi tiết cửa hàng và xác nhận cam kết ở bước tiếp theo.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Xác nhận huỷ chuyến đã duyệt — nêu rõ mức trừ điểm */}
        {confirmCancel && active && (
          <Modal
            onClose={() => setConfirmCancel(false)}
            closeOnBackdrop={!cancelRun.isPending}
            className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl"
          >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined">gpp_maybe</span>
                  </div>
                  <h3 className="font-bold text-lg text-neutral-900">Huỷ chuyến giao sỉ?</h3>
                </div>

                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-bold text-rose-900">
                    Bạn sẽ bị trừ {BULK_CANCEL_PENALTY} điểm uy tín
                  </p>
                  <p className="text-xs text-rose-800/80 mt-1 leading-relaxed">
                    Nhà cung cấp đã duyệt và giữ {active.quantity} phần cho bạn — số hàng này bị khoá,
                    khách lẻ không đặt được. Huỷ lúc này gây lãng phí nên bị tính như huỷ trễ.
                  </p>
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setConfirmCancel(false)}
                    disabled={cancelRun.isPending}
                    className="flex-1 py-3 bg-white border border-neutral-200 text-neutral-700 rounded-xl font-bold text-sm hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Giữ chuyến
                  </button>
                  <button
                    onClick={() =>
                      void act(async () => {
                        await cancelRun.mutateAsync(active.id);
                        setConfirmCancel(false);
                      }, 'Đã huỷ chuyến — kho được hoàn lại.')
                    }
                    disabled={cancelRun.isPending}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                  >
                    {cancelRun.isPending ? 'Đang huỷ…' : 'Vẫn huỷ'}
                  </button>
                </div>
          </Modal>
        )}

        {/* Popup xác nhận: chi tiết cửa hàng + cam kết trách nhiệm */}
        {confirming && picked && (
          <BulkRunConfirmModal
            listing={picked}
            quantity={Number(quantity)}
            busy={requestRun.isPending}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              // Kiểm tra lại ngay trước khi gửi: kho có thể đã đổi trong lúc mở popup
              const err = validate();
              if (err) {
                setConfirming(false);
                return toast.error(err);
              }
              void act(async () => {
                await requestRun.mutateAsync({
                  listingId: picked.id,
                  quantity: Number(quantity),
                });
                setConfirming(false);
                setQuantity('');
                setSelectedListing(null);
              }, 'Đã gửi yêu cầu — chờ nhà cung cấp duyệt.');
            }}
          />
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
