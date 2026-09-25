'use client';

import { useMemo } from 'react';
import { FOOD_CATEGORY_LABEL, type FoodCategory } from '@foodresq/types';
import { useSupplierMatchesNear, type SupplierMatch } from '@/hooks/useCampaigns';
import { normalizeVi, supplyScore } from '@/lib/supply-match';

/**
 * Bước "Nguyên liệu & nhà cung cấp" trong form TẠO chiến dịch: mỗi nguyên liệu tổ
 * chức khai được gắn với một NCC gần bếp. Gửi chiến dịch xong, form gửi luôn đơn
 * xin nguyên liệu tới từng NCC — admin chỉ duyệt chiến dịch khi NCC đã nhận lời đủ,
 * tránh duyệt một chiến dịch không có nguồn nguyên liệu.
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

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-900">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <span className="material-symbols-outlined text-[18px]">verified</span>
          Admin chỉ duyệt chiến dịch khi nhà cung cấp đã nhận lời đủ nguyên liệu
        </p>
        <p className="mt-1">
          Chọn NCC cho từng nguyên liệu bên dưới. Gửi chiến dịch xong, mỗi NCC nhận một đơn xin
          đúng món đó. NCC nào từ chối, bạn gửi lại cho NCC khác ở tab <b>Nhà cung cấp</b>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-neutral-600">Bán kính tìm NCC quanh bếp:</span>
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
        <span className="ml-auto text-xs font-semibold text-neutral-500">
          {pickedCount}/{named.length} nguyên liệu đã chọn NCC
        </span>
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

      <label className="flex cursor-pointer gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <input
          type="checkbox"
          checked={waiver}
          onChange={(e) => onWaiverChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
        />
        <span className="text-xs text-amber-900">
          <span className="font-extrabold">Cam kết sử dụng phi thương mại.</span> Nguyên liệu nhận về chỉ dùng
          cho mục đích từ thiện, không kinh doanh dưới mọi hình thức. Cam kết này đi kèm mọi đơn gửi NCC.
        </span>
      </label>
    </div>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
          <span className={`material-symbols-outlined text-[18px] ${pick ? 'text-emerald-600' : 'text-neutral-300'}`}>
            {pick ? 'check_circle' : 'radio_button_unchecked'}
          </span>
          {item.name}
          <span className="font-normal text-neutral-500">· {qty}</span>
        </p>
      </div>
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
