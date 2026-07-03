'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import {
  useProviderListings,
  useCreateListing,
  usePublishListing,
  useCancelListing,
  type ProviderListing,
  type CreateListingInput,
} from '@/hooks/useProviderListings';
import { FoodCategory, FoodGroup, QuantityUnit, FOOD_CATEGORY_LABEL, FOOD_GROUP_CATEGORIES } from '@foodresq/types';
import { useProviderEsg } from '@/hooks/useEsg';

const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-neutral-100 animate-pulse rounded-xl" />,
});

const CATEGORY_OPTS: { value: FoodCategory; label: string; group: FoodGroup }[] = [
  ...FOOD_GROUP_CATEGORIES[FoodGroup.READY_TO_EAT].map((c) => ({ value: c, label: FOOD_CATEGORY_LABEL[c], group: FoodGroup.READY_TO_EAT })),
  ...FOOD_GROUP_CATEGORIES[FoodGroup.RAW_INGREDIENT].map((c) => ({ value: c, label: FOOD_CATEGORY_LABEL[c], group: FoodGroup.RAW_INGREDIENT })),
  { value: FoodCategory.OTHER, label: FOOD_CATEGORY_LABEL[FoodCategory.OTHER], group: FoodGroup.OTHER },
];
const UNIT_OPTS: { value: QuantityUnit; label: string }[] = [
  { value: QuantityUnit.PORTION, label: 'Phần' },
  { value: QuantityUnit.KG, label: 'Kg' },
  { value: QuantityUnit.ITEM, label: 'Cái' },
  { value: QuantityUnit.BOX, label: 'Hộp' },
  { value: QuantityUnit.LITER, label: 'Lít' },
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Nháp', cls: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
  active: { label: 'Đang mở', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  fully_reserved: { label: 'Hết suất', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  completed: { label: 'Hoàn tất', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  expired: { label: 'Hết hạn', cls: 'bg-neutral-100 text-neutral-500 border-neutral-200' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

// Giá trị mặc định cho form (giờ local → input datetime-local)
function localDateTime(offsetH: number): string {
  const d = new Date(Date.now() + offsetH * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_FORM = () => ({
  title: '',
  description: '',
  category: FoodCategory.COOKED_MEAL as FoodCategory,
  quantityTotal: 10,
  quantityUnit: QuantityUnit.PORTION as QuantityUnit,
  weightPerUnitKg: '',
  pickupStartTime: localDateTime(0),
  pickupEndTime: localDateTime(24),
  expiryTime: localDateTime(48),
  pickupAddress: '',
  lng: 106.6297,
  lat: 10.8231,
  storageConditions: '',
  allergenNotes: '',
  maxPerReservation: 3,
  imageUrl: '',
  isSurpriseBag: false,
});

export default function ProviderListingsPage() {
  const { data, isLoading, isError } = useProviderListings();
  const { data: esg } = useProviderEsg();
  const createListing = useCreateListing();
  const publishListing = usePublishListing();
  const cancelListing = useCancelListing();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM());

  const listings = (data?.items ?? []) as ProviderListing[];

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (form.title.trim().length < 5) {
      toast.error('Tiêu đề tối thiểu 5 ký tự');
      return;
    }
    if (!form.pickupAddress.trim()) {
      toast.error('Vui lòng nhập địa chỉ lấy hàng');
      return;
    }
    const payload: CreateListingInput = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      category: form.category,
      quantityTotal: Number(form.quantityTotal),
      quantityUnit: form.quantityUnit,
      weightPerUnitKg: form.weightPerUnitKg ? Number(form.weightPerUnitKg) : undefined,
      pickupStartTime: new Date(form.pickupStartTime).toISOString(),
      pickupEndTime: new Date(form.pickupEndTime).toISOString(),
      expiryTime: new Date(form.expiryTime).toISOString(),
      pickupAddress: form.pickupAddress.trim(),
      lng: form.lng,
      lat: form.lat,
      storageConditions: form.storageConditions.trim() || undefined,
      allergenNotes: form.allergenNotes.trim() || undefined,
      maxPerReservation: Number(form.maxPerReservation),
      imageUrls: form.imageUrl.trim() ? [form.imageUrl.trim()] : undefined,
      isSurpriseBag: form.isSurpriseBag,
    };
    try {
      await createListing.mutateAsync(payload);
      toast.success('Đã tạo tin (trạng thái Nháp). Bấm "Đăng" để mở nhận đặt.');
      setShowForm(false);
      setForm(EMPTY_FORM());
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Tạo tin thất bại';
      toast.error(msg);
    }
  }

  async function handlePublish(id: string) {
    try {
      await publishListing.mutateAsync(id);
      toast.success('Đã đăng tin — người nhận có thể đặt ngay');
    } catch {
      toast.error('Đăng tin thất bại');
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancelListing.mutateAsync({ id });
      toast.info('Đã huỷ tin');
    } catch {
      toast.error('Huỷ thất bại');
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-10 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-extrabold text-3xl text-neutral-900">Cửa hàng của tôi</h1>
            <p className="text-sm text-neutral-500 mt-1">Đăng và quản lý thực phẩm dư cần cứu trợ</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-sm shadow-sm transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Đăng tin mới
          </button>
        </div>

        {/* ESG impact card */}
        {esg && (
          <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 rounded-3xl p-6 text-white grid grid-cols-2 md:grid-cols-4 gap-4">
            <EsgStat icon="scale" value={`${esg.kgRescued} kg`} label="Thực phẩm đã cứu" />
            <EsgStat icon="co2" value={`${esg.co2SavedKg} kg`} label="CO₂ giảm thiểu" />
            <EsgStat icon="restaurant" value={String(esg.mealsServed)} label="Suất đã trao" />
            <EsgStat icon="diversity_3" value={String(esg.peopleHelped)} label="Người được giúp" />
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-white border border-neutral-200 animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center py-12 bg-white rounded-2xl border border-neutral-200">
            <span className="material-symbols-outlined text-rose-500 text-[48px]">wifi_off</span>
            <p className="font-bold text-neutral-700 mt-2">Không tải được danh sách</p>
          </div>
        )}

        {!isLoading && !isError && listings.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-neutral-200">
            <span className="material-symbols-outlined text-neutral-300 text-[64px]">storefront</span>
            <h3 className="font-extrabold text-lg text-neutral-800 mt-4">Chưa có tin nào</h3>
            <p className="text-xs text-neutral-500 mt-1">Bấm &quot;Đăng tin mới&quot; để chia sẻ thực phẩm dư.</p>
          </div>
        )}

        <div className="space-y-3">
          {listings.map((l) => {
            const meta = STATUS_META[l.status] ?? { label: l.status, cls: 'bg-neutral-100 text-neutral-600 border-neutral-200' };
            return (
              <div key={l.id} className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-100 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.imageUrls[0] || '/food_bread.png'} alt={l.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-neutral-900 truncate">{l.title}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${meta.cls}`}>{meta.label}</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    Còn {Number(l.quantityRemaining)}/{Number(l.quantityTotal)} {l.quantityUnit} • nhận trước{' '}
                    {new Date(l.pickupEndTime).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {l.status === 'draft' && (
                    <button
                      onClick={() => handlePublish(l.id)}
                      disabled={publishListing.isPending}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      Đăng
                    </button>
                  )}
                  {(l.status === 'draft' || l.status === 'active' || l.status === 'fully_reserved') && (
                    <button
                      onClick={() => handleCancel(l.id)}
                      disabled={cancelListing.isPending}
                      className="px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      Huỷ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FORM ĐĂNG TIN */}
      {showForm && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-3xl border border-neutral-200 w-full max-w-2xl my-8 overflow-hidden shadow-2xl"
          >
            <div className="px-6 py-4 border-b border-neutral-150 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="font-extrabold text-neutral-900 text-lg">Đăng tin thực phẩm</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 hover:bg-neutral-100 rounded-full text-neutral-450">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <Field label="Tiêu đề *">
                <input value={form.title} onChange={(e) => set('title', e.target.value)} required minLength={5}
                  placeholder="VD: Cơm hộp dư cuối ngày" className={inputCls} />
              </Field>

              <Field label="Mô tả">
                <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2}
                  placeholder="Mô tả thêm về thực phẩm..." className={inputCls} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Danh mục *">
                  <select value={form.category} onChange={(e) => set('category', e.target.value as FoodCategory)} className={inputCls}>
                    <optgroup label="Thực phẩm ăn liền">
                      {CATEGORY_OPTS.filter((c) => c.group === FoodGroup.READY_TO_EAT).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </optgroup>
                    <optgroup label="Nguyên liệu thô">
                      {CATEGORY_OPTS.filter((c) => c.group === FoodGroup.RAW_INGREDIENT).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </optgroup>
                    <optgroup label="Khác">
                      {CATEGORY_OPTS.filter((c) => c.group === FoodGroup.OTHER).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </optgroup>
                  </select>
                </Field>
                <Field label="Đơn vị *">
                  <select value={form.quantityUnit} onChange={(e) => set('quantityUnit', e.target.value as QuantityUnit)} className={inputCls}>
                    {UNIT_OPTS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Field label="Tổng số lượng *">
                  <input type="number" min={1} value={form.quantityTotal} onChange={(e) => set('quantityTotal', Number(e.target.value))} required className={inputCls} />
                </Field>
                <Field label="Tối đa / đặt *">
                  <input type="number" min={1} max={10} value={form.maxPerReservation} onChange={(e) => set('maxPerReservation', Number(e.target.value))} required className={inputCls} />
                </Field>
                <Field label="Kg / đơn vị">
                  <input type="number" step="0.01" min={0} value={form.weightPerUnitKg} onChange={(e) => set('weightPerUnitKg', e.target.value)} placeholder="0.5" className={inputCls} />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Field label="Bắt đầu lấy *">
                  <input type="datetime-local" value={form.pickupStartTime} onChange={(e) => set('pickupStartTime', e.target.value)} required className={inputCls} />
                </Field>
                <Field label="Hạn lấy *">
                  <input type="datetime-local" value={form.pickupEndTime} onChange={(e) => set('pickupEndTime', e.target.value)} required className={inputCls} />
                </Field>
                <Field label="Hạn sử dụng *">
                  <input type="datetime-local" value={form.expiryTime} onChange={(e) => set('expiryTime', e.target.value)} required className={inputCls} />
                </Field>
              </div>

              <Field label="Địa chỉ lấy hàng *">
                <input value={form.pickupAddress} onChange={(e) => set('pickupAddress', e.target.value)} required
                  placeholder="VD: 12 Nguyễn Huệ, Q1, TP.HCM" className={inputCls} />
              </Field>

              <Field label="Chọn vị trí trên bản đồ (bấm để đặt ghim)">
                <div className="h-56 rounded-xl overflow-hidden border border-neutral-200">
                  <LocationPicker lng={form.lng} lat={form.lat} onPick={(lng, lat) => setForm((f) => ({ ...f, lng, lat }))} />
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">Toạ độ: {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</p>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Bảo quản">
                  <input value={form.storageConditions} onChange={(e) => set('storageConditions', e.target.value)} placeholder="VD: Giữ nóng" className={inputCls} />
                </Field>
                <Field label="Ghi chú dị ứng">
                  <input value={form.allergenNotes} onChange={(e) => set('allergenNotes', e.target.value)} placeholder="VD: Trứng, sữa" className={inputCls} />
                </Field>
              </div>

              <Field label="URL ảnh (tùy chọn)">
                <input value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="/food_bread.png hoặc https://..." className={inputCls} />
              </Field>

              <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-3 cursor-pointer hover:bg-neutral-50">
                <input type="checkbox" checked={form.isSurpriseBag} onChange={(e) => set('isSurpriseBag', e.target.checked)} className="mt-0.5 w-4 h-4 accent-honey-500" />
                <span>
                  <span className="font-bold text-sm text-neutral-800 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[18px] text-honey-500">redeem</span> Túi bất ngờ
                  </span>
                  <span className="block text-[12px] text-neutral-500 mt-0.5">Người nhận không biết trước chính xác món gì — bất ngờ khi đến lấy (như Too Good To Go).</span>
                </span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-neutral-150 flex gap-3 sticky bottom-0 bg-white">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 border border-neutral-200 text-neutral-700 font-bold text-sm rounded-xl hover:bg-neutral-50">
                Huỷ
              </button>
              <button type="submit" disabled={createListing.isPending} className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl disabled:opacity-50">
                {createListing.isPending ? 'Đang tạo...' : 'Tạo tin'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full border border-neutral-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 text-sm';

function EsgStat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="material-symbols-outlined text-[24px] text-emerald-200">{icon}</span>
      <span className="text-2xl font-extrabold">{value}</span>
      <span className="text-[11px] text-emerald-100/80 font-medium">{label}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 text-left">
      <label className="text-xs text-neutral-450 font-bold uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
