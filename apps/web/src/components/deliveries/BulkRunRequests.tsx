'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useProviderBulkRuns,
  useApproveBulkRun,
  useRejectBulkRun,
  useAddBulkStop,
  useUpdateBulkStop,
  useRemoveBulkStop,
  type BulkRun,
} from '@/hooks/useBulkRuns';
import { errMsg, mapsPlaceUrl } from '@/lib/utils';
import BulkStopForm from '@/components/deliveries/BulkStopForm';
import RunDeadline from '@/components/deliveries/RunDeadline';

const STATUS_VI: Record<BulkRun['status'], { label: string; cls: string }> = {
  requested: { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Đã duyệt — chờ lấy hàng', cls: 'bg-sky-100 text-sky-700' },
  picked_up: { label: 'Đang phát trên tuyến', cls: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'Hoàn tất', cls: 'bg-emerald-600 text-white' },
  rejected: { label: 'Đã từ chối', cls: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-neutral-200 text-neutral-600' },
};

const RANK_VI: Record<string, { label: string; cls: string }> = {
  newcomer:    { label: 'Mới bắt đầu',    cls: 'bg-neutral-100 text-neutral-600' },
  active:      { label: 'Hoạt động',       cls: 'bg-sky-100 text-sky-700' },
  experienced: { label: 'Có kinh nghiệm', cls: 'bg-violet-100 text-violet-700' },
  expert:      { label: 'Chuyên gia',      cls: 'bg-amber-100 text-amber-700' },
};

function shipperInitials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(-2).join('').toUpperCase();
}

function failRate(stats: BulkRun['shipperStats']): string {
  if (!stats) return '—';
  const total = stats.deliveredOrders + stats.failedOrders;
  if (total === 0) return '—';
  return `${Math.round((stats.failedOrders / total) * 100)}%`;
}

function failRateWarn(stats: BulkRun['shipperStats']): boolean {
  if (!stats) return false;
  const total = stats.deliveredOrders + stats.failedOrders;
  return total > 0 && stats.failedOrders / total > 0.3;
}

/**
 * Khối "Yêu cầu giao sỉ" cho trang quản lý của nhà cung cấp:
 * duyệt/từ chối yêu cầu ≥10 phần và theo dõi tiến độ phát của các chuyến đang chạy.
 */
export default function BulkRunRequests() {
  const { data: runs } = useProviderBulkRuns();
  const approve = useApproveBulkRun();
  const reject = useRejectBulkRun();
  const addStop = useAddBulkStop();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [addingStopFor, setAddingStopFor] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showProfileFor, setShowProfileFor] = useState<string | null>(null);
  const [expandedDone, setExpandedDone] = useState<string | null>(null);

  // Đang cần theo dõi vs đã xong — chuyến hoàn tất chỉ để tra cứu nên gấp lại,
  // tránh đẩy các yêu cầu đang chờ duyệt xuống dưới màn hình.
  const active = (runs ?? []).filter((r) => ['requested', 'approved', 'picked_up'].includes(r.status));
  const done = (runs ?? []).filter((r) => r.status === 'completed').slice(0, 10);
  if (active.length === 0 && done.length === 0) return null;

  const visible = active;
  const pendingCount = visible.filter((r) => r.status === 'requested').length;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errMsg(e, 'Thao tác thất bại.'));
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-neutral-150 shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-amber-600">local_shipping</span>
        <p className="font-extrabold text-neutral-900">
          Yêu cầu giao sỉ {pendingCount > 0 && <span className="text-amber-600">({pendingCount} chờ duyệt)</span>}
        </p>
      </div>
      <p className="text-xs text-neutral-500 -mt-1">
        Tình nguyện viên nhận nhiều phần một lần và phát tại nhiều điểm. Duyệt xong kho sẽ trừ tương ứng; phần dư chưa phát được hoàn lại khi chuyến kết thúc.
      </p>

      {visible.map((r) => (
        <div key={r.id} className="border border-neutral-150 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-neutral-800 truncate">
                {r.quantity} phần · {r.listing.title}
              </p>
              <p className="text-[11px] text-neutral-500 truncate">
                TNV: {r.shipper?.user.fullName ?? '—'}
                {r.shipper?.user.phone ? ` · ${r.shipper.user.phone}` : ''}
                {r.shipper ? ` · ${r.shipper.dedicationPoints} điểm cống hiến` : ''}
              </p>
              {r.note && <p className="text-[11px] text-neutral-500 italic truncate">“{r.note}”</p>}
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold shrink-0 ${STATUS_VI[r.status].cls}`}>
              {STATUS_VI[r.status].label}
            </span>
          </div>

          {/* Hạn chót giai đoạn hiện tại — tránh yêu cầu treo hoặc chuyến kéo dài */}
          <RunDeadline
            deadlineAt={r.deadlineAt}
            label={
              r.status === 'requested'
                ? 'để bạn duyệt'
                : r.status === 'approved'
                  ? 'để TNV đến lấy hàng'
                  : 'để TNV phát xong'
            }
          />

          {/* Tiến độ khi chuyến đang chạy */}
          {(r.status === 'picked_up' || r.status === 'completed') && (
            <div className="text-[11px] font-bold text-neutral-600">
              Đã phát {r.quantityDistributed}/{r.quantity} phần tại{' '}
              {r.stops.filter((s) => s.servedQty > 0).length} điểm
            </div>
          )}

          {/* Điểm phát đã ghim — xem chi tiết, sửa hoặc gỡ khi chưa phát */}
          {r.stops.length > 0 && (
            <div className="rounded-xl border border-neutral-150 divide-y divide-neutral-100">
              {r.stops.map((s, i) => (
                // Đã lấy hàng → tuyến thuộc quyền shipper, NCC chỉ xem
                <StopRow key={s.id} runId={r.id} index={i} stop={s} readOnly={r.status !== 'requested' && r.status !== 'approved'} />
              ))}
            </div>
          )}

          {/* Hồ sơ uy tín của TNV — NCC cần căn cứ trước khi giao cả lô hàng */}
          {r.status === 'requested' && (
            <div className="rounded-xl bg-neutral-50 border border-neutral-150 p-3">
              <button
                onClick={() => setShowProfileFor(showProfileFor === r.id ? null : r.id)}
                className="w-full flex items-center justify-between gap-2 text-xs font-bold text-neutral-700"
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">badge</span>
                  Hồ sơ tình nguyện viên
                </span>
                <span className={`material-symbols-outlined text-[18px] transition-transform ${showProfileFor === r.id ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>

              {showProfileFor === r.id && (
                <div className="mt-3 space-y-3">
                  {r.shipper ? (
                    <>
                      {/* Danh tính */}
                      <div className="flex items-center gap-3">
                        {/* Ưu tiên: avatarUrl → faceImageUrl (eKYC) → initials */}
                        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 overflow-hidden">
                          {(r.shipper.user.avatarUrl ?? r.shipper.faceImageUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.shipper.user.avatarUrl ?? r.shipper.faceImageUrl ?? ''}
                              alt={r.shipper.user.fullName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-sm font-extrabold text-emerald-700 select-none">
                              {shipperInitials(r.shipper.user.fullName)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center flex-wrap gap-1.5">
                            <p className="text-sm font-extrabold text-neutral-800">{r.shipper.user.fullName}</p>
                            {r.shipper.rank && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${(RANK_VI[r.shipper.rank] ?? RANK_VI.newcomer).cls}`}>
                                {(RANK_VI[r.shipper.rank] ?? RANK_VI.newcomer).label}
                              </span>
                            )}
                          </div>
                          {r.shipper.user.phone && (
                            <a href={`tel:${r.shipper.user.phone}`} className="text-xs text-emerald-700 hover:underline">
                              {r.shipper.user.phone}
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Chỉ số */}
                      <div className="grid grid-cols-3 gap-2">
                        <Metric
                          label="Điểm uy tín"
                          value={r.shipper.user.trustScore ?? '—'}
                          warn={(r.shipper.user.trustScore ?? 100) <= 60}
                        />
                        <Metric
                          label="Đánh giá TB"
                          value={r.shipper.avgRating != null ? `${Number(r.shipper.avgRating).toFixed(1)} ★` : 'Chưa có'}
                        />
                        <Metric label="Điểm cống hiến" value={r.shipper.dedicationPoints} />
                        <Metric label="Chuyến sỉ đã xong" value={r.shipperStats?.completedRuns ?? 0} />
                        <Metric label="Đơn giao thành công" value={r.shipperStats?.deliveredOrders ?? 0} />
                        <Metric
                          label="Tỉ lệ thất bại"
                          value={failRate(r.shipperStats)}
                          warn={failRateWarn(r.shipperStats)}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-neutral-400">Chưa có thông tin tình nguyện viên.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {r.status === 'requested' && (
            <>
              {rejectingId === r.id ? (
                <div className="flex gap-2">
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Lý do từ chối (tuỳ chọn)..."
                    className="flex-1 border border-neutral-200 rounded-xl p-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
                  <button
                    onClick={() =>
                      void act(async () => {
                        await reject.mutateAsync({ runId: r.id, reason: rejectReason.trim() || undefined });
                        setRejectingId(null);
                        setRejectReason('');
                      }, 'Đã từ chối yêu cầu.')
                    }
                    disabled={reject.isPending}
                    className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    Từ chối
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setRejectingId(r.id)}
                    className="flex-1 py-2 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-50"
                  >
                    Từ chối
                  </button>
                  <button
                    onClick={() =>
                      void act(() => approve.mutateAsync(r.id), `Đã duyệt — kho trừ ${r.quantity} phần.`)
                    }
                    disabled={approve.isPending}
                    className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-extrabold disabled:opacity-50"
                  >
                    {approve.isPending ? 'Đang duyệt...' : `Duyệt (${r.quantity} phần)`}
                  </button>
                </div>
              )}
              {/* NCC gợi ý điểm phát ngay từ khi duyệt — chọn vị trí THẬT trên bản đồ,
                  không dùng toạ độ cửa hàng làm chỗ tạm như trước. */}
              {addingStopFor === r.id ? (
                <BulkStopForm
                  busy={addStop.isPending}
                  title="Gợi ý điểm phát cho tình nguyện viên"
                  defaultCoords={r.pickupCoords}
                  onClose={() => setAddingStopFor(null)}
                  onAdd={(p) =>
                    void act(async () => {
                      await addStop.mutateAsync({ runId: r.id, ...p });
                      setAddingStopFor(null);
                    }, 'Đã thêm gợi ý điểm phát.')
                  }
                />
              ) : (
                <button
                  onClick={() => setAddingStopFor(r.id)}
                  className="w-full py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100"
                >
                  + Gợi ý điểm phát trên bản đồ
                </button>
              )}
            </>
          )}
        </div>
      ))}

      {visible.length === 0 && (
        <p className="text-xs text-neutral-400 py-2">Không có chuyến giao sỉ nào đang chờ xử lý.</p>
      )}

      {/* Chuyến đã hoàn tất — gấp lại, chỉ mở khi cần tra cứu */}
      {done.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => setShowDone((v) => !v)}
            className="w-full flex items-center justify-between gap-2 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-800"
          >
            <span>Chuyến đã hoàn tất ({done.length})</span>
            <span className={`material-symbols-outlined text-[18px] transition-transform ${showDone ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>

          {showDone && (
            <div className="rounded-xl border border-neutral-150 divide-y divide-neutral-100">
              {done.map((r) => (
                <div key={r.id}>
                  <button
                    onClick={() => setExpandedDone(expandedDone === r.id ? null : r.id)}
                    className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-neutral-50"
                  >
                    <span className="material-symbols-outlined text-[18px] text-emerald-600 shrink-0">
                      check_circle
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-neutral-800 truncate">
                        {r.quantity} phần · {r.listing.title}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        Đã phát {r.quantityDistributed}/{r.quantity} phần tại{' '}
                        {r.stops.filter((s) => s.servedQty > 0).length} điểm
                        {r.shipper?.user.fullName ? ` · ${r.shipper.user.fullName}` : ''}
                      </p>
                    </div>
                    <span className={`material-symbols-outlined text-[18px] text-neutral-400 shrink-0 transition-transform ${expandedDone === r.id ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </button>

                  {/* Chi tiết chuyến đã xong: từng điểm phát và số phần thực tế */}
                  {expandedDone === r.id && (
                    <div className="px-3 pb-3 space-y-2">
                      <div className="text-[11px] text-neutral-500 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span>TNV: {r.shipper?.user.fullName ?? '—'}{r.shipper?.user.phone ? ` · ${r.shipper.user.phone}` : ''}</span>
                        {r.pickedUpAt && <span>Lấy hàng: {new Date(r.pickedUpAt).toLocaleString('vi-VN')}</span>}
                        {r.completedAt && <span>Kết thúc: {new Date(r.completedAt).toLocaleString('vi-VN')}</span>}
                      </div>
                      {r.stops.length === 0 ? (
                        <p className="text-[11px] text-neutral-400">Chuyến này không ghim điểm phát nào.</p>
                      ) : (
                        <div className="rounded-lg border border-neutral-150 divide-y divide-neutral-100">
                          {r.stops.map((s, i) => (
                            <StopRow key={s.id} runId={r.id} index={i} stop={s} readOnly />
                          ))}
                        </div>
                      )}
                      {r.quantityDistributed < r.quantity && (
                        <p className="text-[11px] text-amber-700">
                          {r.quantity - r.quantityDistributed} phần chưa phát đã được hoàn lại cho cửa hàng.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ô số liệu nhỏ trong hồ sơ uy tín của TNV. */
function Metric({ label, value, warn = false }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${warn ? 'border-rose-200 bg-rose-50' : 'border-neutral-200 bg-white'}`}>
      <p className={`text-sm font-extrabold ${warn ? 'text-rose-700' : 'text-neutral-800'}`}>{value}</p>
      <p className="text-[10px] text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

/**
 * Một dòng điểm phát: xem chi tiết (địa chỉ, toạ độ, số phần dự kiến/đã phát) và
 * sửa/gỡ khi điểm đó chưa phát hàng. Điểm đã phát chỉ xem — sửa sẽ làm sai sổ sách.
 */
function StopRow({
  runId,
  index,
  stop,
  readOnly = false,
}: {
  runId: string;
  index: number;
  stop: BulkRun['stops'][number];
  readOnly?: boolean;
}) {
  const update = useUpdateBulkStop();
  const remove = useRemoveBulkStop();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(stop.label);
  const [address, setAddress] = useState(stop.address ?? '');
  const [plannedQty, setPlannedQty] = useState(stop.plannedQty != null ? String(stop.plannedQty) : '');

  const served = stop.servedQty > 0;
  const busy = update.isPending || remove.isPending;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errMsg(e, 'Thao tác thất bại.'));
    }
  };

  if (editing) {
    return (
      <div className="p-3 space-y-2 bg-neutral-50">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Tên điểm phát"
          className="w-full border border-neutral-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Địa chỉ chi tiết (tuỳ chọn)"
          className="w-full border border-neutral-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          value={plannedQty}
          onChange={(e) => setPlannedQty(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="Số phần dự kiến phát tại điểm này (tuỳ chọn)"
          className="w-full border border-neutral-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <div className="flex gap-2">
          <button
            onClick={() => { setEditing(false); setLabel(stop.label); setAddress(stop.address ?? ''); }}
            disabled={busy}
            className="flex-1 py-2 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-600 hover:bg-white disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            onClick={() => {
              if (!label.trim()) return toast.error('Tên điểm phát không được để trống.');
              void run(async () => {
                await update.mutateAsync({
                  runId,
                  stopId: stop.id,
                  label: label.trim(),
                  address: address.trim(),
                  plannedQty: plannedQty ? Number(plannedQty) : undefined,
                });
                setEditing(false);
              }, 'Đã cập nhật điểm phát.');
            }}
            disabled={busy}
            className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-extrabold disabled:opacity-50"
          >
            Lưu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 flex items-start gap-2.5">
      <span
        className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-extrabold shrink-0 ${
          served ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-600'
        }`}
      >
        {served ? '✓' : index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-neutral-800 truncate">{stop.label}</p>
        {stop.address && <p className="text-[11px] text-neutral-500 truncate">{stop.address}</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-neutral-500">
          {stop.plannedQty != null && <span>Dự kiến {stop.plannedQty} phần</span>}
          {served && <span className="text-emerald-700 font-bold">Đã phát {stop.servedQty} phần</span>}
          {stop.coords && (
            <a
              href={mapsPlaceUrl(stop.coords.lat, stop.coords.lng)}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 font-bold hover:underline"
            >
              Xem bản đồ
            </a>
          )}
        </div>
      </div>

      {!served && !readOnly && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditing(true)}
            disabled={busy}
            title="Sửa điểm phát"
            className="w-7 h-7 grid place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
          </button>
          <button
            onClick={() => void run(() => remove.mutateAsync({ runId, stopId: stop.id }), 'Đã gỡ điểm phát.')}
            disabled={busy}
            title="Gỡ điểm phát"
            className="w-7 h-7 grid place-items-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      )}
    </div>
  );
}
