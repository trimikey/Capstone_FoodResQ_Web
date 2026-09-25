'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FOOD_CATEGORY_LABEL, FoodCategory } from '@foodresq/types';
import {
  useSupplierMatches,
  useSendSupplyRequest,
  useSentRequests,
  type Campaign,
  type SupplierMatch,
} from '@/hooks/useCampaigns';
import { useProviderListings } from '@/hooks/useProviders';
import {
  defaultQty,
  inferCategories,
  itemUnit,
  normalizeVi,
  sameUnit,
  suppliesForProvider,
  type SupplyItem,
  type SupplySuggestion,
} from '@/lib/supply-match';

/**
 * "Đơn xin thực phẩm đầu vào" — bếp khai nhu cầu nguyên liệu rồi gửi tới NHIỀU NCC
 * cùng lúc, mỗi NCC một dòng riêng với đúng món họ bán (vựa rau → rau, vựa gạo → gạo).
 *
 * Mỗi dòng thành một `campaign_provider_requests` riêng; phần khai chung (ngày giờ nhận,
 * số suất, tiêu chuẩn, ghi chú, cam kết) đi kèm mọi đơn trong `demand_details`.
 */

const RADIUS_PRESETS = [2, 5, 10, 20];

const PICKUP_WINDOWS = [
  { label: 'Ca sáng', start: '06:00', end: '12:00' },
  { label: 'Ca chiều', start: '12:00', end: '18:00' },
  { label: 'Ca tối', start: '18:00', end: '00:00' },
] as const;

/** Mặc định bật 2 tiêu chí quan trọng nhất; chuỗi lạnh tuỳ loại thực phẩm nên để tắt. */
const DEFAULT_STANDARDS = {
  requireAtvstpCert: true,
  requireColdChain: false,
  requireQcPhoto: true,
};

/** Một NCC đã chọn + món sẽ xin từ chính NCC đó. */
interface RequestLine {
  providerId: string;
  businessName: string;
  distanceKm: number;
  /** Nguyên liệu chiến dịch mà NCC này có thể bán — để bấm chọn nhanh. */
  suggestions: SupplySuggestion[];
  ingredientName: string;
  /** Số lượng theo `unit` — tên giữ `quantityKg` cho khớp field API. */
  quantityKg: string;
  /** Đơn vị theo nguyên liệu chiến dịch khai (kg, lít, bộ…); nhập tay thì mặc định kg. */
  unit: string;
}

interface Props {
  campaigns: Campaign[];
}

export default function IngressRequestPanel({ campaigns }: Props) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState('');
  const [category, setCategory] = useState<string>('');
  const [expectedServings, setExpectedServings] = useState('');
  const [neededDate, setNeededDate] = useState('');
  const [neededFrom, setNeededFrom] = useState('');
  const [neededTo, setNeededTo] = useState('');
  const [radiusKm, setRadiusKm] = useState(5);
  const [standards, setStandards] = useState(DEFAULT_STANDARDS);
  const [note, setNote] = useState('');
  const [waiver, setWaiver] = useState(false);
  const [lines, setLines] = useState<RequestLine[]>([]);
  const [sending, setSending] = useState(false);

  const openCampaigns = useMemo(
    // Gồm cả chiến dịch CHỜ DUYỆT: admin chỉ duyệt khi NCC đã nhận lời đủ nguyên liệu,
    // nên NCC nào từ chối thì tổ chức phải gửi được đơn thay thế ngay lúc này.
    () => campaigns.filter((c) => ['pending_approval', 'approved', 'in_progress'].includes(c.status)),
    [campaigns],
  );

  // Nguyên liệu tổ chức đã khai lúc TẠO chiến dịch (supplyItems). Dữ liệu cũ có thể là mảng string.
  const selectedCampaign = openCampaigns.find((c) => c.id === campaignId) ?? null;
  const campaignSupplies = useMemo<SupplyItem[]>(() => {
    const raw = (selectedCampaign?.supplyItems ?? []) as Array<
      string | { name?: string; quantity?: number | null; unit?: string | null }
    >;
    return raw
      .map((s) =>
        typeof s === 'string'
          ? { name: s, quantity: null, unit: null }
          : { name: s.name ?? '', quantity: s.quantity ?? null, unit: s.unit ?? null },
      )
      .filter((s) => s.name.trim().length > 0);
  }, [selectedCampaign]);

  // Số còn thiếu của từng nguyên liệu (mục tiêu − đã có NCC nhận). BE chặn NCC chấp
  // nhận vượt số này, nên form phải chặn từ lúc gửi — không thì NCC nhận một đơn
  // mà bấm "Chấp nhận" chỉ ăn lỗi.
  const remainingByName = useMemo(() => {
    const map = new Map<string, { remaining: number; unit: string; target: number }>();
    for (const p of selectedCampaign?.supplyProgress ?? []) {
      map.set(normalizeVi(p.name), { remaining: p.remainingQuantity, unit: p.unit, target: p.targetQuantity });
    }
    return map;
  }, [selectedCampaign]);
  const remainingOf = (name: string) => remainingByName.get(normalizeVi(name)) ?? null;
  const isFulfilled = (name: string) => {
    const r = remainingOf(name);
    return r != null && r.remaining <= 0;
  };
  /** Số lượng nên xin: phần còn thiếu trừ đi phần các NCC khác trong đơn này đã nhận. */
  const suggestKg = (item: SupplyItem, others: RequestLine[]) => {
    const r = remainingOf(item.name);
    if (!r || !sameUnit(r.unit, itemUnit(item))) return defaultQty(item);
    const taken = others
      .filter((l) => sameName(l.ingredientName, item.name))
      .reduce((sum, l) => sum + (Number(l.quantityKg) || 0), 0);
    const left = Math.max(0, Math.round((r.remaining - taken) * 100) / 100);
    return left > 0 ? String(left) : '';
  };

  const { data: matchResult, isLoading: matching } = useSupplierMatches(campaignId || null, {
    radiusKm,
    category: category || undefined,
  });
  const { data: sentRequests } = useSentRequests();
  const sendRequest = useSendSupplyRequest();

  const matches = matchResult?.matches ?? [];
  const topMatch = matches[0] ?? null;
  const selectedIds = new Set(lines.map((l) => l.providerId));

  // Backend giữ MỘT đơn đang chờ cho mỗi (chiến dịch, NCC, món): gửi lại CÙNG món là
  // sửa đè đơn đó. Báo trước để bếp không tưởng mình vừa đặt thêm.
  const pendingByProvider = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of sentRequests ?? []) {
      if (r.campaignId === campaignId && r.status === 'pending') {
        map.set(r.providerId, [...(map.get(r.providerId) ?? []), r.demandDetails?.ingredientName ?? '']);
      }
    }
    return map;
  }, [sentRequests, campaignId]);

  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  function toggleProvider(m: SupplierMatch) {
    if (selectedIds.has(m.providerId)) {
      setLines((prev) => prev.filter((l) => l.providerId !== m.providerId));
      return;
    }
    const suggestions = suppliesForProvider(campaignSupplies, m);
    // Chỉ tự điền món NCC ĐANG ĐĂNG đúng tên — món chỉ cùng nhóm (tiệm cá ↔ thịt gà)
    // để bếp tự bấm, tránh gửi nhầm món NCC không bán. Ưu tiên món chưa NCC nào nhận.
    const exact = suggestions.filter((s) => s.exact && !isFulfilled(s.name));
    const pick =
      exact.find((s) => !lines.some((l) => sameName(l.ingredientName, s.name))) ??
      exact[0] ??
      null;
    setLines((prev) => [
      ...prev,
      {
        providerId: m.providerId,
        businessName: m.businessName,
        distanceKm: m.distanceKm,
        suggestions,
        ingredientName: pick?.name ?? '',
        quantityKg: pick ? suggestKg(pick, lines) : '',
        unit: pick ? itemUnit(pick) : 'kg',
      },
    ]);
  }

  function updateLine(providerId: string, patch: Partial<RequestLine>) {
    setLines((prev) => prev.map((l) => (l.providerId === providerId ? { ...l, ...patch } : l)));
  }

  function resetForm() {
    setCampaignId('');
    setCategory('');
    setExpectedServings('');
    setNeededDate('');
    setNeededFrom('');
    setNeededTo('');
    setRadiusKm(5);
    setStandards(DEFAULT_STANDARDS);
    setNote('');
    setWaiver(false);
    setLines([]);
  }

  async function handleSubmit() {
    if (!campaignId) return toast.error('Vui lòng chọn chiến dịch cần nguyên liệu.');
    if (lines.length === 0) return toast.error('Vui lòng chọn ít nhất một nhà cung cấp ở cột bên phải.');
    const missing = lines.find((l) => !l.ingredientName.trim());
    if (missing) return toast.error(`Chưa nhập nguyên liệu cần lấy từ ${missing.businessName}.`);
    // Không xin quá phần còn thiếu — cộng dồn các NCC cùng xin một món.
    for (const [key, info] of remainingByName) {
      const sameItem = lines.filter(
        (l) => normalizeVi(l.ingredientName) === key && sameUnit(l.unit, info.unit),
      );
      if (sameItem.length === 0) continue;
      const asked = sameItem.reduce((sum, l) => sum + (Number(l.quantityKg) || 0), 0);
      const name = sameItem[0].ingredientName.trim();
      if (info.remaining <= 0) {
        return toast.error(`Chiến dịch đã nhận đủ ${info.target} ${info.unit} ${name} — bỏ món này khỏi đơn.`);
      }
      if (asked > info.remaining) {
        return toast.error(
          `${name} chỉ còn thiếu ${info.remaining} ${info.unit}, đơn đang xin tổng ${asked} ${info.unit} — giảm số kg.`,
        );
      }
    }
    if (!waiver) return toast.error('Vui lòng xác nhận cam kết sử dụng phi thương mại.');
    if (!neededDate || !neededFrom || !neededTo) {
      return toast.error('Vui lòng chọn ngày và ca nhận nguyên liệu.');
    }
    if (neededDate && neededDate < new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)) {
      return toast.error('Ngày cần nhận không được ở quá khứ.');
    }

    const servings = Number(expectedServings);
    setSending(true);
    const failed: RequestLine[] = [];
    const errors: string[] = [];
    // Gửi lần lượt: mỗi đơn là một thông báo tới một NCC, lỗi đơn này không được
    // kéo đổ các đơn còn lại.
    for (const line of lines) {
      const qty = Number(line.quantityKg);
      try {
        await sendRequest.mutateAsync({
          providerId: line.providerId,
          campaignId,
          message: note.trim() || undefined,
          demandDetails: {
            // Nhóm thực phẩm theo MÓN của dòng này, không theo bộ lọc chung.
            foodCategory: inferCategories(line.ingredientName)[0] ?? (category || undefined),
            ingredientName: line.ingredientName.trim(),
            quantityKg: line.quantityKg && Number.isFinite(qty) && qty > 0 ? qty : undefined,
            quantityUnit: line.unit || 'kg',
            expectedServings:
              expectedServings && Number.isFinite(servings) && servings > 0 ? servings : undefined,
            neededDate: neededDate || undefined,
            neededFrom: neededFrom || undefined,
            neededTo: neededTo || undefined,
            radiusKm,
            ...standards,
            nonCommercialWaiver: true,
          },
        });
      } catch (e: unknown) {
        failed.push(line);
        errors.push(
          `${line.businessName}: ${
            (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
              ?.message ?? 'gửi thất bại'
          }`,
        );
      }
    }
    setSending(false);

    const okCount = lines.length - failed.length;
    if (failed.length === 0) {
      toast.success(`Đã gửi ${okCount} đơn tới ${okCount} nhà cung cấp.`);
      resetForm();
      setOpen(false);
      return;
    }
    // Giữ lại các dòng lỗi để bếp sửa rồi bấm gửi lại, dòng đã gửi thì bỏ ra.
    setLines(failed);
    if (okCount > 0) toast.success(`Đã gửi ${okCount} đơn.`);
    toast.error(`Chưa gửi được ${failed.length} đơn — ${errors.join(' · ')}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-4 text-left transition-colors hover:bg-emerald-50"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <span className="material-symbols-outlined text-[20px]">assignment_add</span>
          </span>
          <div className="min-w-0">
            <p className="font-bold text-emerald-900">Tạo đơn yêu cầu nguyên liệu</p>
            <p className="text-xs text-emerald-700">
              Chọn một hoặc nhiều NCC gần bếp — mỗi NCC nhận đơn đúng món họ đang bán.
            </p>
          </div>
          <span className="material-symbols-outlined ml-auto shrink-0 text-emerald-600">chevron_right</span>
        </div>
      </button>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3 bg-emerald-700 px-5 py-4 text-white">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold leading-tight">Yêu cầu cung cấp thực phẩm đầu vào</h3>
          <p className="mt-0.5 text-xs text-emerald-100">
            Bếp gửi đơn đặt nguyên liệu tới một hoặc nhiều nhà cung cấp
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/25"
        >
          Thu gọn
        </button>
      </header>

      {/* Dải gợi ý */}
      <SuggestionBanner
        campaignId={campaignId}
        loading={matching}
        noKitchenLocation={matchResult?.reason === 'NO_KITCHEN_LOCATION'}
        topMatch={topMatch}
        totalMatches={matches.length}
        radiusKm={radiusKm}
      />

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        {/* ── Cột 1: form nhu cầu ── */}
        <div className="min-w-0 space-y-4 rounded-2xl border border-neutral-200 p-4">
          <h4 className="flex items-center gap-2 border-b border-neutral-100 pb-3 text-sm font-extrabold text-neutral-900">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">assignment</span>
            1. Chi tiết đơn yêu cầu nguyên liệu
          </h4>

          <Field label="Chiến dịch cần nguyên liệu" required>
            <select
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setLines([]);
                // Gợi ý sẵn ngày nhận = ngày diễn ra chiến dịch (đổi được).
                const picked = openCampaigns.find((c) => c.id === e.target.value);
                if (picked?.scheduledDate) {
                  setNeededDate((prev) => prev || picked.scheduledDate.slice(0, 10));
                }
                setNeededFrom((prev) => prev || PICKUP_WINDOWS[0].start);
                setNeededTo((prev) => prev || PICKUP_WINDOWS[0].end);
              }}
              className="inp"
            >
              <option value="">— Chọn chiến dịch —</option>
              {openCampaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            {openCampaigns.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">
                Chưa có chiến dịch nào đang tuyển hoặc đang diễn ra để gán nguyên liệu.
              </p>
            )}
          </Field>

          {/* Nguyên liệu chiến dịch cần + đã có NCC nào nhận món đó trong đơn này chưa */}
          {campaignId && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">
                <span className="material-symbols-outlined text-[15px]">nutrition</span>
                Nguyên liệu chiến dịch này cần
              </p>
              {campaignSupplies.length === 0 ? (
                <p className="text-[11px] text-neutral-500">
                  Chiến dịch chưa khai vật phẩm/nguyên liệu lúc tạo — nhập tay ở từng NCC bên phải.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-[11px] text-neutral-500">
                    Bấm một mục để lọc NCC đang bán nhóm thực phẩm đó.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {campaignSupplies.map((s, i) => {
                      const coveredBy = lines.find((l) => sameName(l.ingredientName, s.name));
                      const progress = remainingOf(s.name);
                      const done = progress != null && progress.remaining <= 0;
                      const itemCategory = inferCategories(s.name)[0] ?? '';
                      const filtering = !!itemCategory && category === itemCategory;
                      return (
                        <button
                          key={`${s.name}-${i}`}
                          type="button"
                          onClick={() => setCategory(filtering ? '' : itemCategory)}
                          title={
                            coveredBy
                              ? `Đã xin từ ${coveredBy.businessName}`
                              : itemCategory
                                ? `Lọc NCC bán ${FOOD_CATEGORY_LABEL[itemCategory as FoodCategory] ?? itemCategory}`
                                : 'Chưa đoán được nhóm thực phẩm'
                          }
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                            done
                              ? 'border-neutral-200 bg-neutral-100 text-neutral-400 line-through'
                              : filtering
                              ? 'border-emerald-500 bg-emerald-600 text-white'
                              : coveredBy
                                ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                                : 'border-emerald-200 bg-white text-emerald-800 hover:border-emerald-400'
                          }`}
                        >
                          {coveredBy && <span className="material-symbols-outlined text-[14px]">check_circle</span>}
                          {s.name}
                          {done ? (
                            <span className="font-normal no-underline">· đã đủ</span>
                          ) : progress && progress.remaining < progress.target ? (
                            <span className={filtering ? 'font-normal text-emerald-100' : 'font-normal text-neutral-500'}>
                              còn thiếu {progress.remaining} {progress.unit}
                            </span>
                          ) : s.quantity != null ? (
                            <span className={filtering ? 'font-normal text-emerald-100' : 'font-normal text-neutral-500'}>
                              {s.quantity} {s.unit || 'kg'}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <Field label="Phân loại thực phẩm cần hỗ trợ">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="inp">
              <option value="">Tất cả loại</option>
              {Object.values(FoodCategory)
                .filter((c) => FOOD_CATEGORY_LABEL[c])
                .map((c) => (
                  <option key={c} value={c}>{FOOD_CATEGORY_LABEL[c]}</option>
                ))}
            </select>
            <p className="mt-1 text-[11px] text-neutral-400">
              Chọn loại sẽ lọc danh sách NCC bên phải theo đúng nhóm thực phẩm họ đang đăng.
            </p>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Số suất dự kiến nấu">
              <input
                type="number"
                min={0}
                value={expectedServings}
                onChange={(e) => setExpectedServings(e.target.value)}
                placeholder="100"
                className="inp"
              />
            </Field>
            <Field label="Bán kính tìm NCC">
              <div className="flex flex-wrap gap-1">
                {RADIUS_PRESETS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRadiusKm(r)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                      radiusKm === r
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-emerald-300'
                    }`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Ngày & khung giờ cần nhận tại bếp" required>
            <div className="space-y-2">
              <input
                type="date"
                value={neededDate}
                onChange={(e) => setNeededDate(e.target.value)}
                className="inp"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PICKUP_WINDOWS.map((window) => {
                  const selected = neededFrom === window.start && neededTo === window.end;
                  return (
                    <button
                      key={`${window.start}-${window.end}`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setNeededFrom(window.start);
                        setNeededTo(window.end);
                      }}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                        selected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-neutral-200 bg-white text-neutral-600 hover:border-emerald-300'
                      }`}
                    >
                      <span className="block text-xs font-extrabold">{window.label}</span>
                      <span className="text-[11px] font-semibold">
                        {window.start}–{window.end === '00:00' ? '24:00' : window.end}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-neutral-400">
              Áp dụng cho mọi đơn gửi đi — thành lịch hẹn lấy hàng khi từng NCC chấp nhận.
            </p>
          </Field>

          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-extrabold text-neutral-700">
              <span className="material-symbols-outlined text-[16px] text-emerald-600">verified_user</span>
              Tiêu chuẩn an toàn thực phẩm bắt buộc
            </p>
            <div className="space-y-2 rounded-xl bg-neutral-50 p-3">
              <Check
                checked={standards.requireAtvstpCert}
                onChange={(v) => setStandards((s) => ({ ...s, requireAtvstpCert: v }))}
                label="NCC phải có giấy chứng nhận ATVSTP"
              />
              <Check
                checked={standards.requireColdChain}
                onChange={(v) => setStandards((s) => ({ ...s, requireColdChain: v }))}
                label="Vận chuyển chuỗi lạnh (thùng giữ nhiệt < 5°C)"
              />
              <Check
                checked={standards.requireQcPhoto}
                onChange={(v) => setStandards((s) => ({ ...s, requireQcPhoto: v }))}
                label="Shipper phải chụp ảnh QC nguyên liệu lúc nhận"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-400">
              Các tiêu chí này được gửi kèm đơn để NCC và shipper nắm — hệ thống chưa tự động
              chặn NCC thiếu giấy tờ.
            </p>
          </div>

          <Field label="Ghi chú cho NCC & shipper">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Vd: cần sơ chế sạch trước khi đóng gói nếu là rau củ."
              className="inp resize-none"
            />
            <p className="mt-1 text-right text-[11px] text-neutral-400">{note.length}/500</p>
          </Field>
        </div>

        {/* ── Cột 2: NCC khớp + từng đơn + cam kết ── */}
        <div className="min-w-0 space-y-4 rounded-2xl border border-neutral-200 p-4">
          <h4 className="flex items-center gap-2 border-b border-neutral-100 pb-3 text-sm font-extrabold text-neutral-900">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">location_on</span>
            2. Chọn nhà cung cấp (được chọn nhiều)
          </h4>

          <MatchList
            campaignId={campaignId}
            loading={matching}
            matches={matches}
            selectedIds={selectedIds}
            onToggle={toggleProvider}
            noKitchenLocation={matchResult?.reason === 'NO_KITCHEN_LOCATION'}
            radiusKm={radiusKm}
          />

          {lines.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-neutral-800">
                <span className="material-symbols-outlined text-[16px] text-emerald-600">receipt_long</span>
                {lines.length} đơn sẽ gửi — mỗi NCC một món
              </p>
              {lines.map((line) => (
                <RequestLineCard
                  key={line.providerId}
                  line={line}
                  isFulfilled={isFulfilled}
                  onPickSuggestion={(item) =>
                    updateLine(line.providerId, {
                      ingredientName: item.name,
                      unit: itemUnit(item),
                      quantityKg:
                        suggestKg(item, lines.filter((l) => l.providerId !== line.providerId)) || line.quantityKg,
                    })
                  }
                  pendingIngredient={
                    (pendingByProvider.get(line.providerId) ?? []).find(
                      (name) => name && sameName(name, line.ingredientName),
                    ) ?? null
                  }
                  onChange={(patch) => updateLine(line.providerId, patch)}
                  onRemove={() => setLines((prev) => prev.filter((l) => l.providerId !== line.providerId))}
                />
              ))}
            </div>
          )}

          <label className="flex cursor-pointer gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <input
              type="checkbox"
              checked={waiver}
              onChange={(e) => setWaiver(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
            />
            <span className="text-xs text-amber-900">
              <span className="font-extrabold">Cam kết sử dụng phi thương mại.</span>{' '}
              Bếp cam kết thực phẩm nhận về chỉ dùng cho{' '}
              <span className="font-bold">mục đích từ thiện xã hội</span>, không kinh doanh thương mại
              dưới mọi hình thức. Thời điểm xác nhận được lưu lại cùng đơn.
            </span>
          </label>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending || !campaignId || lines.length === 0 || !waiver}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[18px]">
              {sending ? 'hourglass_top' : 'send'}
            </span>
            {sending
              ? 'Đang gửi đơn…'
              : lines.length > 1
                ? `Gửi ${lines.length} đơn tới ${lines.length} NCC`
                : 'Gửi đơn yêu cầu tới NCC'}
          </button>
          <p className="text-center text-[11px] text-neutral-400">
            Từng NCC duyệt đơn của mình rồi mới tới bước ghép shipper đến lấy hàng.
          </p>
        </div>
      </div>

      <style jsx>{`
        .inp {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 0.625rem;
          outline: none;
          transition: box-shadow 0.15s, border-color 0.15s;
        }
        .inp:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }
      `}</style>
    </section>
  );
}

/** Một đơn sẽ gửi: NCC + món xin từ chính NCC đó + số kg. */
function RequestLineCard({
  line,
  isFulfilled,
  onPickSuggestion,
  pendingIngredient,
  onChange,
  onRemove,
}: {
  line: RequestLine;
  isFulfilled: (name: string) => boolean;
  onPickSuggestion: (item: SupplySuggestion) => void;
  pendingIngredient: string | null;
  onChange: (patch: Partial<RequestLine>) => void;
  onRemove: () => void;
}) {
  const inputCls =
    'w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15';
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-neutral-900">{line.businessName}</p>
          <p className="text-[11px] text-neutral-500">cách bếp {line.distanceKm} km</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-full p-1 text-neutral-400 transition-colors hover:bg-white hover:text-rose-600"
          aria-label={`Bỏ ${line.businessName}`}
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {line.suggestions.length > 0 && !line.suggestions.some((s) => s.exact) && (
        <p className="mt-2 text-[11px] text-amber-700">
          NCC chưa đăng đúng món chiến dịch cần — món dưới đây chỉ cùng nhóm, hãy chắc NCC có hàng.
        </p>
      )}
      {line.suggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {line.suggestions.map((s) => {
            const active = line.ingredientName.trim().toLowerCase() === s.name.trim().toLowerCase();
            const done = isFulfilled(s.name);
            return (
              <button
                key={s.name}
                type="button"
                disabled={done}
                onClick={() => onPickSuggestion(s)}
                title={done ? 'Chiến dịch đã nhận đủ món này' : undefined}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  done
                    ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400 line-through'
                    : active
                    ? 'border-emerald-500 bg-emerald-600 text-white'
                    : 'border-emerald-200 bg-white text-emerald-800 hover:border-emerald-400'
                }`}
              >
                {s.name}
                {done ? (
                  <span className="ml-1 font-normal">· đã đủ</span>
                ) : (
                  !s.exact && <span className="ml-1 font-normal opacity-70">· cùng nhóm</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-amber-700">
          NCC này không bán món nào trong danh sách của chiến dịch — nhập tay món cần xin.
        </p>
      )}

      <div className="mt-2 grid grid-cols-[1fr_6.5rem] gap-2">
        <input
          value={line.ingredientName}
          onChange={(e) => onChange({ ingredientName: e.target.value })}
          placeholder="Nguyên liệu cần lấy"
          className={inputCls}
          aria-label={`Nguyên liệu cần lấy từ ${line.businessName}`}
        />
        <div className="relative">
          <input
            type="number"
            min={0}
            step="0.5"
            value={line.quantityKg}
            onChange={(e) => onChange({ quantityKg: e.target.value })}
            placeholder="0"
            className={`${inputCls} pr-8`}
            aria-label={`Số ${line.unit || 'kg'} từ ${line.businessName}`}
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
            {line.unit || 'kg'}
          </span>
        </div>
      </div>

      {line.ingredientName.trim() && isFulfilled(line.ingredientName) && (
        <p className="mt-2 flex items-start gap-1 text-[11px] font-semibold text-rose-600">
          <span className="material-symbols-outlined text-[14px]">block</span>
          Chiến dịch đã nhận đủ &ldquo;{line.ingredientName.trim()}&rdquo; — đổi món khác hoặc bỏ NCC này.
        </p>
      )}

      {pendingIngredient && (
        <p className="mt-2 flex items-start gap-1 text-[11px] text-amber-700">
          <span className="material-symbols-outlined text-[14px]">info</span>
          NCC này còn đơn &ldquo;{pendingIngredient}&rdquo; đang chờ duyệt — gửi đơn này sẽ thay đơn đó.
        </p>
      )}
    </div>
  );
}

function SuggestionBanner({
  campaignId,
  loading,
  noKitchenLocation,
  topMatch,
  totalMatches,
  radiusKm,
}: {
  campaignId: string;
  loading: boolean;
  noKitchenLocation: boolean;
  topMatch: SupplierMatch | null;
  totalMatches: number;
  radiusKm: number;
}) {
  let body: React.ReactNode;
  if (!campaignId) {
    body = 'Chọn chiến dịch để hệ thống tìm nhà cung cấp gần bếp nhất.';
  } else if (loading) {
    body = 'Đang tìm nhà cung cấp quanh bếp…';
  } else if (noKitchenLocation) {
    body = 'Chiến dịch này chưa ghim toạ độ bếp nên chưa đo được khoảng cách. Cập nhật vị trí bếp trong phần quản lý chiến dịch.';
  } else if (!topMatch) {
    body = `Không có nhà cung cấp nào đang đăng thực phẩm trong bán kính ${radiusKm} km. Thử nới bán kính hoặc bỏ lọc loại thực phẩm.`;
  } else {
    body = (
      <>
        Gần bếp nhất là <span className="font-extrabold">{topMatch.businessName}</span> (cách{' '}
        {topMatch.distanceKm} km), đang có <span className="font-bold">{topMatch.listingCount} tin đăng</span>
        {topMatch.estimatedKg > 0 && <> · ước tính tối thiểu {topMatch.estimatedKg} kg</>}.
        {totalMatches > 1 && <> Còn {totalMatches - 1} NCC khác trong bán kính {radiusKm} km.</>}
      </>
    );
  }

  return (
    <div className="flex items-start gap-3 border-b border-emerald-100 bg-emerald-50 px-5 py-3">
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-emerald-600">
        {loading ? 'progress_activity' : 'travel_explore'}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">
          Gợi ý theo khoảng cách thực tế
        </p>
        <p className="mt-0.5 text-sm text-emerald-900">{body}</p>
      </div>
    </div>
  );
}

function MatchList({
  campaignId,
  loading,
  matches,
  selectedIds,
  onToggle,
  noKitchenLocation,
  radiusKm,
}: {
  campaignId: string;
  loading: boolean;
  matches: SupplierMatch[];
  selectedIds: Set<string>;
  onToggle: (m: SupplierMatch) => void;
  noKitchenLocation: boolean;
  radiusKm: number;
}) {
  if (!campaignId) {
    return (
      <EmptyBox icon="filter_alt" text="Chọn chiến dịch ở cột bên trái để xem NCC phù hợp." />
    );
  }
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-100" />
        ))}
      </div>
    );
  }
  if (noKitchenLocation) {
    return <EmptyBox icon="wrong_location" text="Chiến dịch chưa có toạ độ bếp để đo khoảng cách." />;
  }
  if (matches.length === 0) {
    return (
      <EmptyBox
        icon="storefront"
        text={`Không có NCC nào đang đăng thực phẩm trong bán kính ${radiusKm} km.`}
      />
    );
  }

  return (
    <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
      {matches.map((m, idx) => (
        <MatchRow
          key={m.providerId}
          m={m}
          isNearest={idx === 0}
          isSelected={selectedIds.has(m.providerId)}
          onSelect={() => onToggle(m)}
        />
      ))}
    </div>
  );
}

/**
 * 1 NCC trong danh sách gợi ý. Bấm thẻ để chọn/bỏ chọn (chọn được nhiều NCC); "Xem nguyên liệu" xổ danh sách
 * tin đăng thật của NCC (tên món, số lượng còn, khung giờ lấy) để bếp biết họ
 * đang có gì trước khi gửi đơn.
 */
function MatchRow({
  m,
  isNearest,
  isSelected,
  onSelect,
}: {
  m: SupplierMatch;
  isNearest: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [showListings, setShowListings] = useState(false);
  const { data: listings, isLoading: loadingListings } = useProviderListings(
    showListings ? m.providerId : null,
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-all ${
        isSelected
          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200'
          : 'border-neutral-200 bg-white hover:border-emerald-300'
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
            isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-neutral-300'
          }`}
        >
          {isSelected && <span className="material-symbols-outlined text-[13px] text-white">check</span>}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-bold text-neutral-900">{m.businessName}</p>
            {isNearest && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                Gần nhất
              </span>
            )}
            {m.isVerified && (
              <span className="material-symbols-outlined text-[14px] text-sky-500" title="Đã xác minh">
                verified
              </span>
            )}
          </div>
          {m.address && <p className="truncate text-xs text-neutral-400">{m.address}</p>}
          {(m.categories ?? []).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {m.categories.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700"
                >
                  {FOOD_CATEGORY_LABEL[c as FoodCategory] ?? c}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-600">
            <span className="font-bold text-emerald-700">{m.distanceKm} km</span>
            <span>{m.listingCount} tin đăng</span>
            {m.estimatedKg > 0 && <span>≥ {m.estimatedKg} kg</span>}
            {m.avgRating != null && (
              <span className="flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px] text-amber-500">star</span>
                {m.avgRating.toFixed(1)}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowListings((v) => !v);
              }}
              className="ml-auto inline-flex items-center gap-0.5 font-bold text-emerald-700 hover:underline"
            >
              Xem nguyên liệu
              <span className="material-symbols-outlined text-[14px]">
                {showListings ? 'expand_less' : 'expand_more'}
              </span>
            </button>
          </div>

          {showListings && (
            <div className="mt-2 space-y-1.5 rounded-lg border border-neutral-100 bg-neutral-50 p-2">
              {loadingListings ? (
                <p className="text-[11px] text-neutral-400">Đang tải tin đăng…</p>
              ) : (listings ?? []).length === 0 ? (
                <p className="text-[11px] text-neutral-400">NCC chưa có tin đăng khả dụng.</p>
              ) : (
                (listings ?? []).map((item) => {
                  const start = new Date(item.pickupStartTime);
                  const end = new Date(item.pickupEndTime);
                  const fmtTime = (d: Date) =>
                    d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={item.id} className="rounded-md bg-white px-2 py-1.5 text-[11px]">
                      <div className="flex flex-wrap items-center justify-between gap-x-2">
                        <span className="font-bold text-neutral-800">{item.title}</span>
                        <span className="text-neutral-500">
                          {item.quantityRemaining} {item.quantityUnit}
                          {item.weightPerUnitKg != null ? ` · ~${item.weightPerUnitKg} kg/phần` : ''}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-neutral-500">
                        <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px]">
                          {FOOD_CATEGORY_LABEL[item.category as FoodCategory] ?? item.category}
                        </span>
                        <span>
                          <span className="material-symbols-outlined text-[11px] align-text-bottom">schedule</span>{' '}
                          {start.toLocaleDateString('vi-VN', { day: '2-digit', month: 'short' })} ·{' '}
                          {fmtTime(start)}–{fmtTime(end)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyBox({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
      <span className="material-symbols-outlined text-[28px] text-neutral-300">{icon}</span>
      <p className="text-xs text-neutral-500">{text}</p>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
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
