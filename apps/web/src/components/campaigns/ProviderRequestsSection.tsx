'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FOOD_CATEGORY_LABEL, type FoodCategory } from '@foodresq/types';
import {
  useProviderRequests,
  useReviewProviderRequest,
  type DemandDetails,
  type ProviderRequestItem,
} from '@/hooks/useCampaigns';
import { useProviderListings, type ProviderListing } from '@/hooks/useProviderListings';
import { supplyScore } from '@/lib/supply-match';
import { UNIT_LABEL } from '@/lib/utils';

/** Giá trị ô chọn "không trừ tin nào". */
const NO_STOCK = 'none';

/** Một tin đăng có thể bị trừ cho đơn này, kèm số đơn vị cần trừ (null = không quy ra kg được). */
interface StockOption {
  listing: ProviderListing;
  units: number | null;
  remaining: number;
  exact: boolean;
}

/** Quy kg bếp xin về đơn vị của tin — cùng luật với BE (stock-match.ts). */
function unitsForKg(l: ProviderListing, kg: number): number | null {
  if (l.quantityUnit === 'kg') return Math.round(kg * 100) / 100;
  const w = l.weightPerUnitKg != null ? Number(l.weightPerUnitKg) : NaN;
  return Number.isFinite(w) && w > 0 ? Math.ceil(kg / w) : null;
}

function stockOptionsFor(listings: ProviderListing[], d: DemandDetails | null): StockOption[] {
  const kg = Number(d?.quantityKg);
  if (!d?.ingredientName || !Number.isFinite(kg) || kg <= 0) return [];
  const now = Date.now();
  return listings
    .filter(
      (l) =>
        l.status === 'active' &&
        Number(l.quantityRemaining) > 0 &&
        new Date(l.pickupEndTime).getTime() > now,
    )
    .map((l) => ({
      listing: l,
      units: unitsForKg(l, kg),
      remaining: Number(l.quantityRemaining),
      exact:
        supplyScore(
          { name: d.ingredientName!, quantity: null, unit: null },
          { categories: [], listingTitles: [l.title] },
        ) >= 2,
    }))
    // Tin khớp đúng món lên đầu, rồi tin còn nhiều hàng.
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.remaining - a.remaining);
}

/** Tin BE sẽ tự chọn khi NCC không đổi: khớp đúng tên + quy được kg, ưu tiên còn đủ hàng. */
function defaultStockChoice(options: StockOption[]): string {
  const usable = options.filter((o) => o.exact && o.units != null);
  const enough = usable.find((o) => o.remaining >= (o.units as number));
  return (enough ?? usable[0])?.listing.id ?? NO_STOCK;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-700 border border-amber-200' },
  accepted:  { label: 'Đã đồng ý', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  rejected:  { label: 'Từ chối', cls: 'bg-rose-100 text-rose-700 border border-rose-200' },
  expired:   { label: 'Hết hạn', cls: 'bg-neutral-100 text-neutral-500 border border-neutral-200' },
};

const TRANSPORT_STATUS_LABEL: Record<string, string> = {
  pending: 'Đang tìm shipper',
  assigned: 'Shipper đã nhận chuyến',
  heading_to_provider: 'Shipper đang đến lấy hàng',
  picked_up: 'Shipper đã lấy hàng',
  in_transit: 'Đang giao đến bếp',
  delivered: 'Đã bàn giao — chờ bếp xác nhận',
  received: 'Giao thành công — bếp đã xác nhận nhận hàng',
  failed: 'Giao hàng thất bại',
};

export default function ProviderRequestsSection() {
  const { data: requests, isLoading } = useProviderRequests();
  const { data: myListings } = useProviderListings();
  const review = useReviewProviderRequest();
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  // Tin bị trừ tồn kho theo từng đơn; chưa có key = dùng lựa chọn mặc định.
  const [stockById, setStockById] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const listings = useMemo(() => myListings?.items ?? [], [myListings]);

  async function handleReview(req: ProviderRequestItem, action: 'accept' | 'reject') {
    const reqId = req.id;
    const choice = stockById[reqId] ?? defaultStockChoice(stockOptionsFor(listings, req.demandDetails));
    setReviewingId(reqId);
    try {
      const res = await review.mutateAsync({
        requestId: reqId,
        action,
        note: noteById[reqId],
        ...(action === 'accept'
          ? choice === NO_STOCK
            ? { skipStockDeduction: true }
            : { listingId: choice }
          : {}),
      });
      const cut = res.stockDeduction;
      toast.success(
        action === 'accept'
          ? cut
            ? `Đã chấp nhận — trừ ${cut.quantity} ${cut.unit} khỏi tin "${cut.listingTitle}".`
            : 'Đã chấp nhận yêu cầu hợp tác!'
          : 'Đã từ chối yêu cầu.',
      );
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Thao tác thất bại';
      toast.error(msg);
    } finally {
      setReviewingId(null);
    }
  }

  const pending = (requests ?? []).filter((r) => r.status === 'pending');
  const others = (requests ?? []).filter((r) => r.status !== 'pending');

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-neutral-100 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!requests?.length) {
    return (
      <div className="bg-neutral-50 rounded-xl p-8 text-center border border-neutral-200">
        <span className="material-symbols-outlined text-5xl text-neutral-300">inbox</span>
        <p className="mt-3 font-semibold text-neutral-600">Chưa có yêu cầu nào</p>
        <p className="text-sm text-neutral-400 mt-1">
          Khi tổ chức gửi yêu cầu hợp tác, bạn sẽ thấy ở đây.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Yêu cầu chờ duyệt */}
      {pending.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500 text-xl">pending_actions</span>
            <h3 className="font-bold text-neutral-800">Yêu cầu chờ duyệt ({pending.length})</h3>
          </div>
          {pending.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              note={noteById[req.id] ?? ''}
              onNote={(v) => setNoteById((p) => ({ ...p, [req.id]: v }))}
              onAccept={() => handleReview(req, 'accept')}
              onReject={() => handleReview(req, 'reject')}
              loading={reviewingId === req.id}
              stockOptions={stockOptionsFor(listings, req.demandDetails)}
              stockChoice={stockById[req.id]}
              onStockChoice={(v) => setStockById((p) => ({ ...p, [req.id]: v }))}
            />
          ))}
        </section>
      )}

      {/* Đã xử lý */}
      {others.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-neutral-400 text-xl">history</span>
            <h3 className="font-bold text-neutral-500">Đã xử lý ({others.length})</h3>
          </div>
          {others.slice(0, 10).map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              note={noteById[req.id] ?? ''}
              onNote={() => undefined}
              onAccept={() => undefined}
              onReject={() => undefined}
              loading={false}
              compact
            />
          ))}
        </section>
      )}
    </div>
  );
}

function RequestCard({
  req,
  note,
  onNote,
  onAccept,
  onReject,
  loading,
  compact = false,
  stockOptions = [],
  stockChoice,
  onStockChoice,
}: {
  req: ProviderRequestItem;
  note: string;
  onNote: (v: string) => void;
  onAccept: () => void;
  onReject: () => void;
  loading: boolean;
  compact?: boolean;
  stockOptions?: StockOption[];
  stockChoice?: string;
  onStockChoice?: (v: string) => void;
}) {
  // Đơn ĐÃ XỬ LÝ hiển thị gọn, nhưng NCC vẫn cần tra lại chi tiết thoả thuận
  // (bếp cần gì, lịch hẹn lấy hàng, ghi chú) — bấm "Chi tiết" để bung ra.
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[req.status] ?? { label: req.status, cls: 'bg-neutral-100 text-neutral-600' };
  const orgName = req.receiver.organizationName ?? req.receiver.user.fullName;
  const isPending = req.status === 'pending';
  const date = req.createdAt ? new Date(req.createdAt).toLocaleString('vi-VN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '';
  const showDetails = !compact || expanded;

  return (
    <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-sm space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-amber-600 text-lg">storefront</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-semibold text-neutral-800 text-sm">{orgName}</p>
              {req.campaign && (
                <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                  <span className="material-symbols-outlined text-[12px]">campaign</span>
                  {req.campaign.title}
                </p>
              )}
              {req.durationMonths && (
                <p className="text-xs text-neutral-400">
                  Hợp tác {req.durationMonths} tháng · {date}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.cls}`}>
                {meta.label}
              </span>
              {compact && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700 hover:underline"
                >
                  Chi tiết
                  <span className="material-symbols-outlined text-[14px]">
                    {expanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chi tiết nhu cầu nguyên liệu bếp khai */}
      {req.demandDetails && showDetails && <DemandDetailsCard d={req.demandDetails} />}

      {/* Đã trừ tồn kho lúc chấp nhận */}
      {showDetails && req.demandDetails?.stockDeduction && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span className="material-symbols-outlined text-[16px]">inventory</span>
          <span>
            Đã trừ <b>{req.demandDetails.stockDeduction.quantity} {req.demandDetails.stockDeduction.unit}</b> khỏi
            tin &ldquo;{req.demandDetails.stockDeduction.listingTitle}&rdquo;.
          </span>
        </div>
      )}

      {/* Chọn tin đăng bị trừ tồn kho khi chấp nhận */}
      {isPending && !compact && req.demandDetails?.quantityKg != null && (
        <StockPicker
          kg={req.demandDetails.quantityKg}
          options={stockOptions}
          value={stockChoice ?? defaultStockChoice(stockOptions)}
          onChange={(v) => onStockChoice?.(v)}
        />
      )}

      {/* Lịch hẹn lấy hàng đã chốt (đơn accepted) */}
      {showDetails && req.status === 'accepted' && (req.scheduledDate || req.pickupStartTime) && (
        <div className="bg-emerald-50 rounded-lg px-3 py-2 text-sm text-emerald-800 border border-emerald-200">
          <span className="font-semibold text-[11px] uppercase tracking-wide">Lịch hẹn lấy hàng:</span>{' '}
          {req.scheduledDate
            ? new Date(req.scheduledDate).toLocaleDateString('vi-VN', { timeZone: 'UTC' })
            : ''}
          {req.pickupStartTime ? ` · ${req.pickupStartTime}${req.pickupEndTime ? `–${req.pickupEndTime}` : ''}` : ''}
          {req.needsTransport ? ' · Hệ thống tìm TNV giao hàng' : ' · TNV của bếp tự đến lấy'}
        </div>
      )}

      {/* Lời nhắn */}
      {req.message && showDetails && (
        <div className="bg-amber-50 rounded-lg px-3 py-2 text-sm text-neutral-700 border-l-2 border-amber-300">
          <span className="font-semibold text-amber-700 text-[11px] uppercase tracking-wide">Lời nhắn:</span>
          <p className="mt-1">{req.message}</p>
        </div>
      )}

      {/* Kết quả giao hàng — NCC biết bếp đã nhận thành công + số lượng thực nhận */}
      {showDetails && req.transport && (
        <div
          className={`rounded-lg px-3 py-2 text-sm border ${
            req.transport.status === 'received'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : req.transport.status === 'failed'
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-sky-50 border-sky-200 text-sky-700'
          }`}
        >
          <span className="font-semibold text-[11px] uppercase tracking-wide">Vận chuyển:</span>{' '}
          {TRANSPORT_STATUS_LABEL[req.transport.status] ?? req.transport.status}
          {req.transport.receivedAt && (
            <> · bếp xác nhận lúc {new Date(req.transport.receivedAt).toLocaleString('vi-VN')}</>
          )}
          {req.transport.receiptNote && <p className="mt-1 text-xs">Biên nhận: {req.transport.receiptNote}</p>}
          {req.transport.failureReason && <p className="mt-1 text-xs">Lý do: {req.transport.failureReason}</p>}
        </div>
      )}

      {/* Actions */}
      {isPending && !compact && (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Ghi chú phản hồi (tuỳ chọn)…"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg resize-none focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
          />
          <div className="flex gap-2">
            <button
              onClick={onReject}
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              Từ chối
            </button>
            <button
              onClick={onAccept}
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              Chấp nhận
            </button>
          </div>
        </div>
      )}

      {/* Compact: reviewed note */}
      {compact && req.reviewedNote && (
        <p className="text-xs text-neutral-500 italic">Ghi chú: {req.reviewedNote}</p>
      )}
    </div>
  );
}

/**
 * NCC chọn tin đăng sẽ bị trừ khi chấp nhận đơn — để khách lẻ không đặt tiếp số hàng
 * đã hứa cho bếp. Mặc định là tin khớp đúng tên món (cùng luật BE tự chọn).
 */
function StockPicker({
  kg,
  options,
  value,
  onChange,
}: {
  kg: number;
  options: StockOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const picked = options.find((o) => o.listing.id === value) ?? null;
  const unitOf = (o: StockOption) =>
    (UNIT_LABEL as Record<string, string>)[o.listing.quantityUnit] ?? o.listing.quantityUnit;
  const short = picked && picked.units != null && picked.remaining < picked.units;

  return (
    <div className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-600">
        <span className="material-symbols-outlined text-[15px]">inventory_2</span>
        Trừ tồn kho khi chấp nhận
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
      >
        {options.map((o) => (
          <option key={o.listing.id} value={o.listing.id} disabled={o.units == null}>
            {o.listing.title} — còn {o.remaining} {unitOf(o)}
            {o.units == null ? ' (chưa khai kg/đơn vị)' : ` · trừ ${o.units} ${unitOf(o)}`}
          </option>
        ))}
        <option value={NO_STOCK}>Không trừ — hàng lấy ngoài kho đăng trên FoodResQ</option>
      </select>
      {options.length === 0 ? (
        <p className="text-[11px] text-neutral-500">
          Bạn không có tin đăng nào đang mở — chấp nhận sẽ không trừ tồn kho.
        </p>
      ) : value === NO_STOCK ? (
        <p className="text-[11px] text-neutral-500">
          Không trừ tin nào — khách lẻ vẫn đặt được toàn bộ số hàng đang đăng.
        </p>
      ) : short ? (
        <p className="text-[11px] font-semibold text-rose-600">
          Tin này chỉ còn {picked!.remaining} {unitOf(picked!)}, không đủ {picked!.units} {unitOf(picked!)} cho đơn{' '}
          {kg} kg — chọn tin khác, cập nhật tồn kho hoặc từ chối.
        </p>
      ) : picked ? (
        <p className="text-[11px] text-emerald-700">
          Còn lại sau khi trừ: {Math.round((picked.remaining - (picked.units ?? 0)) * 100) / 100} {unitOf(picked)}.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Bảng nhu cầu nguyên liệu bếp khai lúc gửi đơn — NCC đọc để biết cần chuẩn bị gì
 * trước khi bấm đồng ý.
 */
function DemandDetailsCard({ d }: { d: DemandDetails }) {
  const standards = [
    d.requireAtvstpCert ? 'Có giấy chứng nhận ATVSTP' : null,
    d.requireColdChain ? 'Vận chuyển chuỗi lạnh (< 5°C)' : null,
    d.requireQcPhoto ? 'Shipper chụp ảnh QC lúc nhận' : null,
  ].filter((s): s is string => s !== null);

  const rows = [
    d.foodCategory
      ? { icon: 'category', label: 'Phân loại', value: FOOD_CATEGORY_LABEL[d.foodCategory as FoodCategory] ?? d.foodCategory }
      : null,
    d.ingredientName ? { icon: 'grocery', label: 'Nguyên liệu', value: d.ingredientName } : null,
    d.quantityKg != null ? { icon: 'scale', label: 'Số lượng cần', value: `${d.quantityKg} kg` } : null,
    d.expectedServings != null
      ? { icon: 'restaurant', label: 'Số suất dự kiến', value: `${d.expectedServings} suất` }
      : null,
    d.neededDate || d.neededFrom || d.neededTo
      ? {
          icon: 'schedule',
          label: 'Cần có mặt tại bếp',
          value: `${d.neededDate ? `${new Date(`${d.neededDate}T00:00:00Z`).toLocaleDateString('vi-VN', { timeZone: 'UTC' })} · ` : ''}${d.neededFrom ?? '—'} → ${d.neededTo ?? '—'}`,
        }
      : null,
  ].filter((r): r is { icon: string; label: string; value: string } => r !== null);

  if (rows.length === 0 && standards.length === 0) return null;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
        Nhu cầu nguyên liệu của bếp
      </p>

      {rows.length > 0 && (
        <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start gap-1.5">
              <span className="material-symbols-outlined mt-0.5 text-[14px] text-emerald-600">{r.icon}</span>
              <div className="min-w-0">
                <span className="text-[10px] uppercase text-neutral-400">{r.label}</span>
                <p className="text-sm font-semibold text-neutral-800 break-words">{r.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {standards.length > 0 && (
        <div className="mt-2 border-t border-emerald-200/70 pt-2">
          <p className="text-[10px] uppercase text-neutral-400">Tiêu chuẩn bếp yêu cầu</p>
          <ul className="mt-1 space-y-0.5">
            {standards.map((s) => (
              <li key={s} className="flex items-start gap-1.5 text-xs text-neutral-700">
                <span className="material-symbols-outlined text-[13px] text-emerald-600">check_small</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.waiverAcceptedAt && (
        <p className="mt-2 text-[11px] text-neutral-500">
          Bếp đã cam kết dùng phi thương mại lúc{' '}
          {new Date(d.waiverAcceptedAt).toLocaleString('vi-VN')}.
        </p>
      )}
    </div>
  );
}
