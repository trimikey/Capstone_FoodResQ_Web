'use client';

import { useMemo } from 'react';
import { FOOD_CATEGORY_LABEL, type FoodCategory } from '@foodresq/types';
import { useSupplierMatchesNear, type SupplierMatch } from '@/hooks/useCampaigns';
import { normalizeVi, supplyScore } from '@/lib/supply-match';

/**
 * Bước "Nguyên liệu & nhà cung cấp" trong form TẠO chiến dịch — cùng nội dung với form
 * "Yêu cầu cung cấp thực phẩm đầu vào" ở tab Nhà cung cấp: ngày + ca nhận, tiêu chuẩn
 * an toàn thực phẩm, ghi chú, và một NCC cho từng nguyên liệu. Gửi chiến dịch xong,
 * form gửi luôn đơn xin nguyên liệu tới từng NCC — admin chỉ duyệt chiến dịch khi NCC
 * đã nhận lời đủ.
 */

export interface SupplierPick {
  providerId: string;
  businessName: string;
  distanceKm: number;
}

export interface SupplyRow {
  name: string;
  quantity?: number;
  unit?: string;
}

/** Ca nhận nguyên liệu — BE chỉ nhận đúng 3 khung này (khớp 3 ca vận hành). */
export const PICKUP_WINDOWS = [
  { period: 'morning', label: 'Ca sáng', start: '06:00', end: '12:00' },
  { period: 'afternoon', label: 'Ca chiều', start: '12:00', end: '18:00' },
  { period: 'evening', label: 'Ca tối', start: '18:00', end: '00:00' },
] as const;

export interface SupplierRequestDetails {
  neededDate: string;
  neededFrom: string;
  neededTo: string;
  requireAtvstpCert: boolean;
  requireColdChain: boolean;
  requireQcPhoto: boolean;
  note: string;
}

/** Khoá ổn định cho một nguyên liệu (tên bỏ dấu) — dùng để lưu lựa chọn NCC. */
export function supplyKey(name: string): string {
  return normalizeVi(name);
}

const RADIUS_PRESETS = [2, 5, 10, 20];

interface Props {
  lng: number;
  lat: number;
  supplies: SupplyRow[];
  picks: Record<string, SupplierPick>;
  onPick: (key: string, pick: SupplierPick | null) => void;
  radiusKm: number;
  onRadiusChange: (km: number) => void;
  details: SupplierRequestDetails;
  onDetailsChange: (patch: Partial<SupplierRequestDetails>) => void;
  /** Ngày vận hành đầu/cuối — nguyên liệu phải về bếp trong khoảng này hoặc trước đó. */
  minDate: string;
  maxDate: string;
  waiver: boolean;
  onWaiverChange: (v: boolean) => void;
}

export default function SupplierRequestStep({
  lng,
  lat,
  supplies,
  picks,
  onPick,
  radiusKm,
  onRadiusChange,
  details,
  onDetailsChange,
  minDate,
  maxDate,
  waiver,
  onWaiverChange,
}: Props) {
  const named = supplies.filter((s) => s.name.trim());
  const { data, isLoading } = useSupplierMatchesNear({ lng, lat }, { radiusKm, enabled: named.length > 0 });
  const matches = useMemo(() => data?.matches ?? [], [data]);

  if (named.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-bold">Chiến dịch chưa khai nguyên liệu cần</p>
        <p className="mt-1 text-xs">
          Quay lại bước &ldquo;Thực đơn &amp; số suất&rdquo; để thêm nguyên liệu (tên, số lượng, đơn vị) — hệ
          thống sẽ gợi ý nhà cung cấp gần bếp và gửi đơn xin nguyên liệu cùng lúc với chiến dịch.
        </p>
      </div>
    );
  }

  const pickedCount = named.filter((s) => picks[supplyKey(s.name)]).length;
  const inputCls =
    'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-900">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <span className="material-symbols-outlined text-[18px]">verified</span>
          Admin chỉ duyệt chiến dịch khi nhà cung cấp đã nhận lời đủ nguyên liệu
        </p>
        <p className="mt-1">
          Gửi chiến dịch xong, mỗi NCC nhận một đơn xin đúng món đã chọn bên dưới. NCC nào từ
          chối, bạn gửi lại cho NCC khác ở tab <b>Nhà cung cấp</b>.
        </p>
      </div>

      {/* ── 1. Chi tiết đơn yêu cầu (áp dụng cho mọi đơn) ── */}
      <section className="space-y-3 rounded-2xl border border-neutral-200 p-4">
        <h4 className="flex items-center gap-2 border-b border-neutral-100 pb-2 text-sm font-extrabold text-neutral-900">
          <span className="material-symbols-outlined text-[18px] text-emerald-600">assignment</span>
          1. Chi tiết đơn yêu cầu nguyên liệu
        </h4>

        <div>
          <p className="mb-1 text-xs font-bold text-neutral-700">
            Ngày &amp; ca cần nhận tại bếp <span className="text-rose-500">*</span>
          </p>
          <input
            type="date"
            value={details.neededDate}
            min={minDate}
            max={maxDate}
            onChange={(e) => onDetailsChange({ neededDate: e.target.value })}
            className={inputCls}
            aria-label="Ngày cần nhận nguyên liệu"
          />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PICKUP_WINDOWS.map((w) => {
              const selected = details.neededFrom === w.start && details.neededTo === w.end;
              return (
                <button
                  key={w.period}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onDetailsChange({ neededFrom: w.start, neededTo: w.end })}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    selected
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-emerald-300'
                  }`}
                >
                  <span className="block text-xs font-extrabold">{w.label}</span>
                  <span className="text-[11px] font-semibold">
                    {w.start}–{w.end === '00:00' ? '24:00' : w.end}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">
            Thành lịch hẹn lấy hàng khi NCC chấp nhận — nên chọn ca trước ca nấu đầu tiên.
          </p>
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-neutral-700">
            <span className="material-symbols-outlined text-[16px] text-emerald-600">verified_user</span>
            Tiêu chuẩn an toàn thực phẩm bắt buộc
          </p>
          <div className="space-y-2 rounded-xl bg-neutral-50 p-3">
            <Check
              checked={details.requireAtvstpCert}
              onChange={(v) => onDetailsChange({ requireAtvstpCert: v })}
              label="NCC phải có giấy chứng nhận ATVSTP"
            />
            <Check
              checked={details.requireColdChain}
              onChange={(v) => onDetailsChange({ requireColdChain: v })}
              label="Vận chuyển chuỗi lạnh (thùng giữ nhiệt < 5°C)"
            />
            <Check
              checked={details.requireQcPhoto}
              onChange={(v) => onDetailsChange({ requireQcPhoto: v })}
              label="Shipper phải chụp ảnh QC nguyên liệu lúc nhận"
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-bold text-neutral-700">Ghi chú cho NCC &amp; shipper</p>
          <textarea
            value={details.note}
            onChange={(e) => onDetailsChange({ note: e.target.value })}
            rows={2}
            maxLength={500}
            placeholder="Vd: cần sơ chế sạch trước khi đóng gói nếu là rau củ."
            className={`${inputCls} resize-none`}
          />
          <p className="mt-0.5 text-right text-[11px] text-neutral-400">{details.note.length}/500</p>
        </div>
      </section>

      {/* ── 2. NCC cho từng nguyên liệu ── */}
      <section className="space-y-3 rounded-2xl border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 pb-2">
          <h4 className="flex items-center gap-2 text-sm font-extrabold text-neutral-900">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">location_on</span>
            2. Nhà cung cấp cho từng nguyên liệu
          </h4>
          <span className="ml-auto text-xs font-semibold text-neutral-500">
            {pickedCount}/{named.length} đã chọn NCC
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-neutral-600">Bán kính quanh bếp:</span>
          {RADIUS_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRadiusChange(r)}
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
                radiusKm === r
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-emerald-300'
              }`}
            >
              {r} km
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
        ) : matches.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-500">
            Không có nhà cung cấp nào đang đăng thực phẩm trong bán kính {radiusKm} km quanh bếp — thử nới bán kính.
          </p>
        ) : (
          named.map((item) => (
            <SupplyPickerRow
              key={supplyKey(item.name)}
              item={item}
              matches={matches}
              pick={picks[supplyKey(item.name)] ?? null}
              onPick={(p) => onPick(supplyKey(item.name), p)}
            />
          ))
        )}
      </section>

      <label className="flex cursor-pointer gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <input
          type="checkbox"
          checked={waiver}
          onChange={(e) => onWaiverChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
        />
        <span className="text-xs text-amber-900">
          <span className="font-extrabold">Cam kết sử dụng phi thương mại.</span> Nguyên liệu nhận về chỉ dùng
          cho mục đích từ thiện xã hội, không kinh doanh dưới mọi hình thức. Cam kết đi kèm mọi đơn gửi NCC.
        </span>
      </label>
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
      />
      <span className="text-xs text-neutral-700">{label}</span>
    </label>
  );
}

/** Một nguyên liệu + ô chọn NCC; NCC đang đăng đúng món xếp đầu và gắn nhãn. */
function SupplyPickerRow({
  item,
  matches,
  pick,
  onPick,
}: {
  item: SupplyRow;
  matches: SupplierMatch[];
  pick: SupplierPick | null;
  onPick: (p: SupplierPick | null) => void;
}) {
  const ranked = useMemo(
    () =>
      matches
        .map((m) => ({ m, score: supplyScore({ name: item.name, quantity: null, unit: null }, m) }))
        .sort((a, b) => b.score - a.score || a.m.distanceKm - b.m.distanceKm),
    [item.name, matches],
  );
  const qty = item.quantity != null ? `${item.quantity} ${item.unit?.trim() || 'kg'}` : 'chưa ghi số lượng';

  return (
    <div className={`rounded-2xl border p-3 ${pick ? 'border-emerald-200 bg-emerald-50/40' : 'border-neutral-200 bg-white'}`}>
      <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-neutral-900">
        <span className={`material-symbols-outlined text-[18px] ${pick ? 'text-emerald-600' : 'text-neutral-300'}`}>
          {pick ? 'check_circle' : 'radio_button_unchecked'}
        </span>
        {item.name}
        <span className="font-normal text-neutral-500">· {qty}</span>
      </p>
      <select
        value={pick?.providerId ?? ''}
        onChange={(e) => {
          const m = matches.find((x) => x.providerId === e.target.value);
          onPick(m ? { providerId: m.providerId, businessName: m.businessName, distanceKm: m.distanceKm } : null);
        }}
        className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
        aria-label={`Nhà cung cấp cho ${item.name}`}
      >
        <option value="">— Chọn nhà cung cấp —</option>
        {ranked.map(({ m, score }) => (
          <option key={m.providerId} value={m.providerId}>
            {score >= 2 ? '★ ' : ''}
            {m.businessName} · {m.distanceKm} km
            {score >= 2
              ? ' · đang đăng món này'
              : score === 1
                ? ' · cùng nhóm hàng'
                : m.categories.length > 0
                  ? ` · bán ${m.categories.map((c) => FOOD_CATEGORY_LABEL[c as FoodCategory] ?? c).join(', ')}`
                  : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
