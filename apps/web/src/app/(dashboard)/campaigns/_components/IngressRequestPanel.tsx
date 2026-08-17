'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FOOD_CATEGORY_LABEL, FoodCategory } from '@foodresq/types';
import {
  useSupplierMatches,
  useSendSupplyRequest,
  type Campaign,
  type SupplierMatch,
} from '@/hooks/useCampaigns';

/**
 * "Đơn xin thực phẩm đầu vào" — bếp khai nhu cầu nguyên liệu rồi gửi thẳng tới NCC
 * phù hợp nhất.
 *
 * Khác với ô "Yêu cầu" nhanh ở từng thẻ NCC bên dưới: ở đây bếp mô tả NHU CẦU trước
 * (cần gì, bao nhiêu kg, mấy giờ phải có mặt tại bếp), hệ thống mới xếp hạng NCC theo
 * khoảng cách thật từ bếp. Toàn bộ phần khai báo được lưu vào
 * `campaign_provider_requests.demand_details` để NCC đọc đúng thứ bếp cần.
 */

const RADIUS_PRESETS = [2, 5, 10, 20];

/** Mặc định bật 2 tiêu chí quan trọng nhất; chuỗi lạnh tuỳ loại thực phẩm nên để tắt. */
const DEFAULT_STANDARDS = {
  requireAtvstpCert: true,
  requireColdChain: false,
  requireQcPhoto: true,
};

interface Props {
  campaigns: Campaign[];
}

export default function IngressRequestPanel({ campaigns }: Props) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState('');
  const [category, setCategory] = useState<string>('');
  const [ingredientName, setIngredientName] = useState('');
  const [quantityKg, setQuantityKg] = useState('');
  const [expectedServings, setExpectedServings] = useState('');
  const [neededFrom, setNeededFrom] = useState('');
  const [neededTo, setNeededTo] = useState('');
  const [radiusKm, setRadiusKm] = useState(5);
  const [standards, setStandards] = useState(DEFAULT_STANDARDS);
  const [note, setNote] = useState('');
  const [waiver, setWaiver] = useState(false);
  const [providerId, setProviderId] = useState('');

  const openCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === 'approved' || c.status === 'in_progress'),
    [campaigns],
  );

  const { data: matchResult, isLoading: matching } = useSupplierMatches(campaignId || null, {
    radiusKm,
    category: category || undefined,
  });
  const sendRequest = useSendSupplyRequest();

  const matches = matchResult?.matches ?? [];
  const topMatch = matches[0] ?? null;
  const selected = matches.find((m) => m.providerId === providerId) ?? null;

  function resetForm() {
    setCampaignId('');
    setCategory('');
    setIngredientName('');
    setQuantityKg('');
    setExpectedServings('');
    setNeededFrom('');
    setNeededTo('');
    setRadiusKm(5);
    setStandards(DEFAULT_STANDARDS);
    setNote('');
    setWaiver(false);
    setProviderId('');
  }

  async function handleSubmit() {
    if (!campaignId) return toast.error('Vui lòng chọn chiến dịch cần nguyên liệu.');
    if (!providerId) return toast.error('Vui lòng chọn một nhà cung cấp ở cột bên phải.');
    if (!waiver) return toast.error('Vui lòng xác nhận cam kết sử dụng phi thương mại.');
    if (neededFrom && neededTo && neededTo <= neededFrom) {
      return toast.error('Giờ kết thúc nhận hàng phải sau giờ bắt đầu.');
    }

    const qty = Number(quantityKg);
    const servings = Number(expectedServings);
    try {
      await sendRequest.mutateAsync({
        providerId,
        campaignId,
        message: note.trim() || undefined,
        demandDetails: {
          foodCategory: category || undefined,
          ingredientName: ingredientName.trim() || undefined,
          quantityKg: quantityKg && Number.isFinite(qty) && qty > 0 ? qty : undefined,
          expectedServings:
            expectedServings && Number.isFinite(servings) && servings > 0 ? servings : undefined,
          neededFrom: neededFrom || undefined,
          neededTo: neededTo || undefined,
          radiusKm,
          ...standards,
          nonCommercialWaiver: true,
        },
      });
      toast.success(`Đã gửi đơn yêu cầu tới ${selected?.businessName ?? 'nhà cung cấp'}.`);
      resetForm();
      setOpen(false);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Gửi đơn yêu cầu thất bại';
      toast.error(msg);
    }
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
              Khai nhu cầu của bếp (loại thực phẩm, số kg, giờ cần nhận) — hệ thống gợi ý NCC gần nhất.
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
            Bếp gửi đơn đặt nguyên liệu tới nhà cung cấp
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
        <div className="space-y-4 rounded-2xl border border-neutral-200 p-4">
          <h4 className="flex items-center gap-2 border-b border-neutral-100 pb-3 text-sm font-extrabold text-neutral-900">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">assignment</span>
            1. Chi tiết đơn yêu cầu nguyên liệu
          </h4>

          <Field label="Chiến dịch cần nguyên liệu" required>
            <select
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setProviderId('');
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tên nguyên liệu chính">
              <input
                value={ingredientName}
                onChange={(e) => setIngredientName(e.target.value)}
                placeholder="Vd: Thịt heo / Rau xanh"
                className="inp"
              />
            </Field>
            <Field label="Số lượng cần (kg)">
              <input
                type="number"
                min={0}
                step="0.5"
                value={quantityKg}
                onChange={(e) => setQuantityKg(e.target.value)}
                placeholder="30"
                className="inp"
              />
            </Field>
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

          <Field label="Khung giờ cần nhận tại bếp">
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={neededFrom}
                onChange={(e) => setNeededFrom(e.target.value)}
                className="inp"
              />
              <span className="text-sm text-neutral-400">→</span>
              <input
                type="time"
                value={neededTo}
                onChange={(e) => setNeededTo(e.target.value)}
                className="inp"
              />
            </div>
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

        {/* ── Cột 2: NCC khớp + cam kết ── */}
        <div className="space-y-4 rounded-2xl border border-neutral-200 p-4">
          <h4 className="flex items-center gap-2 border-b border-neutral-100 pb-3 text-sm font-extrabold text-neutral-900">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">location_on</span>
            2. Nhà cung cấp phù hợp
          </h4>

          <MatchList
            campaignId={campaignId}
            loading={matching}
            matches={matches}
            selectedId={providerId}
            onSelect={setProviderId}
            noKitchenLocation={matchResult?.reason === 'NO_KITCHEN_LOCATION'}
            radiusKm={radiusKm}
          />

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
            disabled={sendRequest.isPending || !campaignId || !providerId || !waiver}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[18px]">
              {sendRequest.isPending ? 'hourglass_top' : 'send'}
            </span>
            {sendRequest.isPending ? 'Đang gửi đơn…' : 'Gửi đơn yêu cầu tới NCC'}
          </button>
          <p className="text-center text-[11px] text-neutral-400">
            NCC duyệt đơn rồi mới tới bước ghép shipper đến lấy hàng.
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
  selectedId,
  onSelect,
  noKitchenLocation,
  radiusKm,
}: {
  campaignId: string;
  loading: boolean;
  matches: SupplierMatch[];
  selectedId: string;
  onSelect: (id: string) => void;
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
    <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
      {matches.map((m, idx) => {
        const isSelected = m.providerId === selectedId;
        return (
          <button
            key={m.providerId}
            type="button"
            onClick={() => onSelect(m.providerId)}
            className={`w-full rounded-xl border p-3 text-left transition-all ${
              isSelected
                ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200'
                : 'border-neutral-200 bg-white hover:border-emerald-300'
            }`}
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-neutral-300'
                }`}
              >
                {isSelected && <span className="material-symbols-outlined text-[13px] text-white">check</span>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate font-bold text-neutral-900">{m.businessName}</p>
                  {idx === 0 && (
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
                </div>
              </div>
            </div>
          </button>
        );
      })}
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
