'use client';

import { Modal } from '@/components/shared/Modal';
import { mediaUrl, UNIT_LABEL } from '@/lib/utils';
import { QuantityUnit } from '@foodresq/types';
import type { BulkRun } from '@/hooks/useBulkRuns';

const STATUS_VI: Record<BulkRun['status'], { label: string; cls: string }> = {
  requested: { label: 'Chờ nhà cung cấp duyệt', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Đã duyệt — đến lấy hàng', cls: 'bg-sky-100 text-sky-700' },
  picked_up: { label: 'Đang phát trên tuyến', cls: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'Hoàn tất', cls: 'bg-emerald-600 text-white' },
  rejected: { label: 'Bị từ chối', cls: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-neutral-200 text-neutral-600' },
};

function fmt(ts: string | null | undefined) {
  if (!ts) return null;
  return new Date(ts).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Chi tiết một chuyến giao sỉ của shipper: mốc thời gian, số phần đã phát và
 * TỪNG điểm phát kèm ảnh/ghi chú.
 *
 * Toàn bộ dữ liệu đã có sẵn trong `/bulk-runs/my` (BE include stops), nên modal
 * chỉ đọc từ object truyền vào — không gọi thêm API.
 */
export default function BulkRunDetailModal({
  run,
  onClose,
}: {
  run: BulkRun;
  onClose: () => void;
}) {
  const unit =
    UNIT_LABEL[run.listing.quantityUnit as QuantityUnit] ?? run.listing.quantityUnit ?? 'phần';
  const status = STATUS_VI[run.status];
  const served = run.stops.filter((s) => s.servedQty > 0);
  const leftover = Math.max(run.quantity - run.quantityDistributed, 0);
  const progress = run.quantity > 0 ? Math.round((run.quantityDistributed / run.quantity) * 100) : 0;

  const timeline = [
    { label: 'Gửi yêu cầu', at: run.createdAt, icon: 'send' },
    { label: 'Nhà cung cấp duyệt', at: run.approvedAt, icon: 'task_alt' },
    { label: 'Đã lấy hàng', at: run.pickedUpAt, icon: 'inventory_2' },
    { label: 'Kết thúc chuyến', at: run.completedAt, icon: 'flag' },
  ].filter((t) => t.at);

  return (
    <Modal
      onClose={onClose}
      align="top"
      className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-5 border-b border-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(run.listing.imageUrls?.[0] ?? '') || '/banh-mi.png'}
          alt={run.listing.title}
          className="w-14 h-14 rounded-2xl object-cover bg-neutral-100 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-lg text-neutral-900 truncate">{run.listing.title}</h3>
          <p className="text-xs text-neutral-500 truncate">
            {run.provider?.businessName ?? 'Nhà cung cấp'} · {run.listing.pickupAddress}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${status.cls}`}>
            {status.label}
          </span>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
        {/* Tổng kết số lượng */}
        <section>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Nhận từ kho" value={`${run.quantity}`} unit={unit} />
            <Stat label="Đã phát" value={`${run.quantityDistributed}`} unit={unit} tone="emerald" />
            <Stat
              label="Trả lại kho"
              value={`${leftover}`}
              unit={unit}
              tone={leftover > 0 ? 'amber' : undefined}
            />
          </div>
          <div className="mt-3">
            <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#236c2a] transition-all"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">
              {progress}% số hàng đã tới tay người nhận · {served.length} điểm phát
            </p>
          </div>
        </section>

        {/* Lý do khi chuyến không thành */}
        {run.rejectReason && (
          <div className="flex gap-2 rounded-2xl bg-rose-50 border border-rose-100 p-3">
            <span className="material-symbols-outlined text-[18px] text-rose-600 shrink-0">info</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-rose-800">Lý do</p>
              <p className="text-xs text-rose-700 mt-0.5">{run.rejectReason}</p>
            </div>
          </div>
        )}

        {/* Mốc thời gian */}
        <section>
          <h4 className="font-bold text-sm text-neutral-900 mb-3">Diễn biến chuyến</h4>
          <ol className="space-y-0">
            {timeline.map((t, i) => (
              <li key={t.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[15px]">{t.icon}</span>
                  </span>
                  {i < timeline.length - 1 && <span className="w-px flex-1 bg-neutral-200 my-1" />}
                </div>
                <div className="pb-4 min-w-0">
                  <p className="text-sm font-semibold text-neutral-800">{t.label}</p>
                  <p className="text-[11px] text-neutral-500 tabular-nums">{fmt(t.at)}</p>
                </div>
              </li>
            ))}
          </ol>
          {run.qcPhotoUrl && (
            <div className="mt-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
                Ảnh kiểm tra lúc lấy hàng
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(run.qcPhotoUrl)}
                alt="Ảnh QC"
                className="w-full max-w-[220px] rounded-xl object-cover border border-neutral-150"
              />
            </div>
          )}
        </section>

        {/* Danh sách điểm phát */}
        <section>
          <h4 className="font-bold text-sm text-neutral-900 mb-3">
            Điểm phát{' '}
            <span className="font-normal text-neutral-500">
              ({served.length}/{run.stops.length} đã phát)
            </span>
          </h4>

          {run.stops.length === 0 ? (
            <p className="text-sm text-neutral-400 py-6 text-center border border-dashed border-neutral-200 rounded-2xl">
              Chuyến này chưa ghim điểm phát nào.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {run.stops.map((s, i) => {
                const done = s.servedQty > 0;
                return (
                  <li
                    key={s.id}
                    className={`rounded-2xl border p-3 ${
                      done ? 'border-emerald-150 bg-emerald-50/40' : 'border-neutral-150 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center shrink-0 ${
                          done ? 'bg-[#236c2a] text-white' : 'bg-neutral-200 text-neutral-600'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-neutral-900">{s.label}</p>
                        {s.address && (
                          <p className="text-[11px] text-neutral-500 mt-0.5">{s.address}</p>
                        )}
                        <p className="text-[11px] text-neutral-600 mt-1 tabular-nums">
                          Đã phát <b className="text-neutral-900">{s.servedQty}</b>
                          {s.plannedQty != null && ` / ${s.plannedQty} dự kiến`} {unit}
                          {s.servedAt && ` · ${fmt(s.servedAt)}`}
                        </p>
                        {s.note && (
                          <p className="text-[11px] text-neutral-500 mt-1 italic">“{s.note}”</p>
                        )}
                        {/* Ghi rõ ai ghim điểm — NCC và shipper đều được ghim, khi đối chiếu
                            lại chuyến thì cần biết điểm này do bên nào đặt ra. */}
                        <p className="text-[10px] text-neutral-400 mt-1">
                          Ghim bởi {s.createdBy === 'provider' ? 'nhà cung cấp' : 'shipper'}
                        </p>
                      </div>
                      {s.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mediaUrl(s.photoUrl)}
                          alt={`Minh chứng ${s.label}`}
                          className="w-16 h-16 rounded-xl object-cover border border-neutral-150 shrink-0"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </Modal>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: 'emerald' | 'amber';
}) {
  const cls =
    tone === 'emerald'
      ? 'bg-emerald-50 border-emerald-100'
      : tone === 'amber'
        ? 'bg-amber-50 border-amber-100'
        : 'bg-neutral-50 border-neutral-150';
  return (
    <div className={`rounded-2xl border p-3 ${cls}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold text-neutral-900 tabular-nums">
        {value}
        <span className="ml-1 text-[11px] font-medium text-neutral-500">{unit}</span>
      </p>
    </div>
  );
}
