'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useProviderBulkRuns,
  useApproveBulkRun,
  useRejectBulkRun,
  useAddBulkStop,
  type BulkRun,
} from '@/hooks/useBulkRuns';
import { errMsg } from '@/lib/utils';

const STATUS_VI: Record<BulkRun['status'], { label: string; cls: string }> = {
  requested: { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Đã duyệt — chờ lấy hàng', cls: 'bg-sky-100 text-sky-700' },
  picked_up: { label: 'Đang phát trên tuyến', cls: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'Hoàn tất', cls: 'bg-emerald-600 text-white' },
  rejected: { label: 'Đã từ chối', cls: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-neutral-200 text-neutral-600' },
};

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

  const visible = (runs ?? []).filter((r) => !['cancelled', 'rejected'].includes(r.status)).slice(0, 8);
  if (visible.length === 0) return null; // không có gì để duyệt/theo dõi → không chiếm chỗ

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
        Tình nguyện viên nhận ≥10 phần một lần và phát tại nhiều điểm. Duyệt xong kho sẽ trừ tương ứng; phần phát dư được hoàn lại khi chuyến kết thúc.
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

          {/* Tiến độ khi chuyến đang chạy */}
          {(r.status === 'picked_up' || r.status === 'completed') && (
            <div className="text-[11px] font-bold text-neutral-600">
              Đã phát {r.quantityDistributed}/{r.quantity} phần tại{' '}
              {r.stops.filter((s) => s.servedQty > 0).length} điểm
            </div>
          )}

          {/* Điểm phát đã ghim */}
          {r.stops.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.stops.map((s, i) => (
                <span
                  key={s.id}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    s.servedQty > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600'
                  }`}
                  title={s.address ?? undefined}
                >
                  {i + 1}. {s.label}
                  {s.servedQty > 0 ? ` ✓${s.servedQty}` : ''}
                </span>
              ))}
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
              {/* NCC gợi ý điểm phát ngay từ khi duyệt (dùng vị trí cửa hàng khó biết → nhập nhanh theo địa chỉ đã biết) */}
              <ProviderQuickStop
                busy={addStop.isPending}
                onAdd={(label) =>
                  void act(async () => {
                    // NCC ghim nhanh theo tên — toạ độ tạm dùng điểm lấy hàng của run (shipper chỉnh sau trên tuyến)
                    const c = r.pickupCoords;
                    if (!c) throw new Error('Tin chưa có toạ độ điểm lấy.');
                    await addStop.mutateAsync({ runId: r.id, label, lng: c.lng, lat: c.lat });
                  }, 'Đã thêm gợi ý điểm phát.')
                }
              />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Ô nhập nhanh gợi ý điểm phát của NCC (tên điểm; vị trí chính xác shipper chỉnh trên tuyến). */
function ProviderQuickStop({ busy, onAdd }: { busy: boolean; onAdd: (label: string) => void }) {
  const [label, setLabel] = useState('');
  return (
    <div className="flex gap-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Gợi ý điểm phát (vd: KTX khu B, xóm trọ đường số 8)..."
        className="flex-1 border border-neutral-200 rounded-xl p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <button
        onClick={() => {
          if (!label.trim()) return;
          onAdd(label.trim());
          setLabel('');
        }}
        disabled={busy || !label.trim()}
        className="px-3 py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 disabled:opacity-50"
      >
        + Gợi ý
      </button>
    </div>
  );
}
