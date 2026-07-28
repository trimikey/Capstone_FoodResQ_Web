'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useCreateListing, type CreateListingInput } from '@/hooks/useProviderListings';
import { useMe } from '@/hooks/useProfile';
import { useUploadImage } from '@/hooks/useUploadImage';
import { DateTimeField, dateTimeDisplay } from '@/components/forms/date-time-field';
import {
  buildForm,
  combineToIso,
  DEFAULT_CATEGORIES,
  DEFAULT_UNITS,
  type ListingForm,
} from '@/lib/listing-form';

const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-neutral-100 animate-pulse rounded-xl" />,
});

type Step = 1 | 2 | 3;

const inputCls =
  'w-full border border-neutral-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#236c2a]/20 text-sm transition-colors';

function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-neutral-500 font-medium uppercase tracking-wide flex items-center gap-1">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-neutral-400 font-normal">{hint}</p>}
    </div>
  );
}

export default function ProviderCreateListingPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const uploadImage = useUploadImage();
  const createListing = useCreateListing();

  const providerProfile = me?.provider ?? null;
  const providerVerified = providerProfile?.verificationStatus === 'approved';
  const providerHasLocation = !!(providerProfile && providerProfile.lng != null && providerProfile.lat != null);

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<ListingForm>(() => buildForm(providerProfile));
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!providerProfile) return;
    setForm((f) => ({
      ...f,
      pickupAddress: f.pickupAddress || providerProfile.address || '',
      lng: providerProfile.lng ?? f.lng,
      lat: providerProfile.lat ?? f.lat,
    }));
  }, [providerProfile]);

  function set<K extends keyof ListingForm>(key: K, val: ListingForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = await uploadImage.mutateAsync({ file, kind: 'listing' });
      set('imageUrl', url);
      toast.success('Đã tải ảnh lên.');
    } catch {
      toast.error('Tải ảnh thất bại.');
    }
  }

  function applyProviderLocation() {
    if (!providerHasLocation) {
      toast.error('Chưa có toạ độ cửa hàng.');
      return;
    }
    setForm((f) => ({
      ...f,
      pickupAddress: providerProfile?.address || f.pickupAddress,
      lng: providerProfile!.lng as number,
      lat: providerProfile!.lat as number,
    }));
    toast.success('Đã áp dụng vị trí cửa hàng');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.title.trim().length < 5) {
      toast.error('Tiêu đề tối thiểu 5 ký tự');
      setStep(1);
      return;
    }
    if (!form.pickupAddress.trim()) {
      toast.error('Vui lòng nhập địa chỉ lấy hàng');
      setStep(3);
      return;
    }
    const payload: CreateListingInput = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      category: form.category as CreateListingInput['category'],
      quantityTotal: Number(form.quantityTotal),
      quantityUnit: form.quantityUnit as CreateListingInput['quantityUnit'],
      weightPerUnitKg: form.weightPerUnitKg ? Number(form.weightPerUnitKg) : undefined,
      pickupStartTime: combineToIso(form.pickupStartDate, form.pickupStartTime),
      pickupEndTime: combineToIso(form.pickupEndDate, form.pickupEndTime),
      expiryTime: combineToIso(form.expiryDate, form.expiryTime),
      pickupAddress: form.pickupAddress.trim(),
      lng: form.lng,
      lat: form.lat,
      storageConditions: form.storageConditions.trim() || undefined,
      allergenNotes: form.allergenNotes.trim() || undefined,
      maxPerReservation: Number(form.maxPerReservation),
      imageUrls: form.imageUrl.trim() ? [form.imageUrl.trim()] : undefined,
    };
    try {
      await createListing.mutateAsync(payload);
      toast.success('Đã tạo tin (trạng thái Nháp)');
      router.push('/provider');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Tạo tin thất bại';
      toast.error(msg);
    }
  }

  const validations = useMemo(() => {
    return {
      step1: form.title.trim().length >= 5 && form.title.trim().length > 0,
      step2:
        Number(form.quantityTotal) > 0 &&
        Number(form.maxPerReservation) > 0 &&
        Boolean(form.pickupStartDate) &&
        Boolean(form.pickupStartTime) &&
        Boolean(form.pickupEndDate) &&
        Boolean(form.pickupEndTime) &&
        Boolean(form.expiryDate) &&
        Boolean(form.expiryTime),
      step3: form.pickupAddress.trim().length > 0 && form.lng != null && form.lat != null,
    };
  }, [form]);

  const isAnyPending = createListing.isPending || uploadImage.isPending;

  if (!providerVerified) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
          <span className="material-symbols-outlined text-[48px] text-amber-500 mx-auto">lock</span>
          <h2 className="mt-3 text-lg font-medium text-neutral-800">Tài khoản chưa được duyệt</h2>
          <p className="mt-1 text-sm text-neutral-500 font-normal">
            Vui lòng hoàn tất xác minh danh tính Provider trước khi đăng bài.
          </p>
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 mt-5 px-6 py-2.5 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-xl text-sm font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-base">verified_user</span>
            Xác minh ngay
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/provider"
            className="text-xs text-[#236c2a] font-medium hover:underline inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Quay lại Trang quản trị
          </Link>
          <h1 className="mt-2 text-2xl font-medium text-neutral-800">Đăng tin thực phẩm mới</h1>
          <p className="text-sm text-neutral-500 font-normal">
            Chia sẻ thực phẩm dư thừa chất lượng cao — chỉ với 3 bước đơn giản.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          className="px-4 py-2 bg-white border border-neutral-200 text-neutral-700 rounded-full text-sm font-medium hover:bg-neutral-50 transition-colors inline-flex items-center gap-1.5 shadow-sm"
        >
          <span className="material-symbols-outlined text-base">
            {preview ? 'edit' : 'visibility'}
          </span>
          {preview ? 'Chỉnh sửa' : 'Xem trước'}
        </button>
      </header>

      {/* Stepper */}
      <div className="bg-white rounded-2xl px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          {[
            { num: 1, label: 'Thông tin', icon: 'inventory_2' },
            { num: 2, label: 'Số lượng & Thời gian', icon: 'schedule' },
            { num: 3, label: 'Địa điểm & Ảnh', icon: 'map' },
          ].map((s) => {
            const isActive = step === s.num;
            const isDone = step > s.num;
            return (
              <div key={s.num} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-[#236c2a] text-white'
                      : isDone
                      ? 'bg-[#d8ebde] text-[#236c2a]'
                      : 'bg-neutral-100 text-neutral-400'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {isDone ? 'check' : s.icon}
                  </span>
                </div>
                <div className="hidden sm:block min-w-0">
                  <p
                    className={`text-xs uppercase tracking-wider font-medium ${
                      isActive ? 'text-[#236c2a]' : isDone ? 'text-neutral-600' : 'text-neutral-400'
                    }`}
                  >
                    Bước {s.num}
                  </p>
                  <p
                    className={`text-sm truncate font-medium ${
                      isActive ? 'text-neutral-800' : 'text-neutral-500'
                    }`}
                  >
                    {s.label}
                  </p>
                </div>
                {s.num < 3 && <div className="flex-1 h-px bg-neutral-200 ml-1" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start"
      >
        {/* Main panel */}
        <div className="space-y-6">
          {/* STEP 1: Thông tin */}
          {step === 1 && (
          <section className="bg-white rounded-2xl p-6 shadow-sm">
            <header className="mb-5">
              <h2 className="text-base font-medium text-neutral-800 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-[#efe8d8] text-[#236c2a] text-xs flex items-center justify-center font-medium">
                  1
                </span>
                Thông tin cơ bản
              </h2>
              <p className="text-xs text-neutral-500 font-normal mt-1 ml-9">
                Mô tả ngắn gọn giúp người nhận biết rõ thực phẩm.
              </p>
            </header>

            {!preview ? (
              <div className="space-y-4">
                <Field label="Tiêu đề" required hint="Tối thiểu 5 ký tự. Ví dụ: Cơm hộp dư cuối ngày">
                  <input
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    required
                    minLength={5}
                    placeholder="VD: Bánh mì dư cuối ngày"
                    className={inputCls}
                  />
                </Field>

                <Field label="Danh mục" required>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {DEFAULT_CATEGORIES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => set('category', c.value)}
                        className={`px-3 py-3 rounded-xl border-2 text-left transition-all ${
                          form.category === c.value
                            ? 'border-[#236c2a] bg-[#efe8d8]/40'
                            : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-lg ${
                            form.category === c.value ? 'text-[#236c2a]' : 'text-neutral-500'
                          }`}
                        >
                          {c.icon}
                        </span>
                        <p
                          className={`mt-1 text-xs font-medium ${
                            form.category === c.value ? 'text-[#236c2a]' : 'text-neutral-700'
                          }`}
                        >
                          {c.label}
                        </p>
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Mô tả" hint="Tuỳ chọn. Thông tin giúp bếp ăn / TNV chuẩn bị tốt hơn.">
                  <textarea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    rows={3}
                    placeholder="VD: 20 phần cơm sườn, đã nguội nhưng còn ấm..."
                    className={inputCls}
                  />
                </Field>
              </div>
            ) : (
              <PreviewCard form={form} />
            )}
          </section>
          )}

          {/* STEP 2: Số lượng & Thời gian */}
          {step === 2 && (
          <section className="bg-white rounded-2xl p-6 shadow-sm">
            <header className="mb-5">
              <h2 className="text-base font-medium text-neutral-800 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-[#efe8d8] text-[#236c2a] text-xs flex items-center justify-center font-medium">
                  2
                </span>
                Số lượng & Thời hạn
              </h2>
              <p className="text-xs text-neutral-500 font-normal mt-1 ml-9">
                Càng chính xác thì càng nhiều người nhận được.
              </p>
            </header>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Tổng số lượng" required>
                <input
                  type="number"
                  min={1}
                  value={form.quantityTotal}
                  onChange={(e) => set('quantityTotal', Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
              <Field label="Đơn vị" required>
                <select
                  value={form.quantityUnit}
                  onChange={(e) => set('quantityUnit', e.target.value)}
                  className={inputCls}
                >
                  {DEFAULT_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tối đa / đơn" required hint="Số lượng 1 người có thể đặt">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={form.maxPerReservation}
                  onChange={(e) => set('maxPerReservation', Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <DateTimeField
                label="Bắt đầu lấy"
                dateValue={form.pickupStartDate}
                timeValue={form.pickupStartTime}
                onDateChange={(v) => set('pickupStartDate', v)}
                onTimeChange={(v) => set('pickupStartTime', v)}
              />
              <DateTimeField
                label="Hạn lấy"
                dateValue={form.pickupEndDate}
                timeValue={form.pickupEndTime}
                onDateChange={(v) => set('pickupEndDate', v)}
                onTimeChange={(v) => set('pickupEndTime', v)}
              />
              <DateTimeField
                label="Hạn sử dụng"
                dateValue={form.expiryDate}
                timeValue={form.expiryTime}
                onDateChange={(v) => set('expiryDate', v)}
                onTimeChange={(v) => set('expiryTime', v)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <Field label="Bảo quản" hint="VD: Giữ lạnh / Giữ nóng / Đông lạnh">
                <input
                  value={form.storageConditions}
                  onChange={(e) => set('storageConditions', e.target.value)}
                  placeholder="VD: Giữ nóng"
                  className={inputCls}
                />
              </Field>
              <Field label="Ghi chú dị ứng" hint="VD: Trứng, sữa, hải sản">
                <input
                  value={form.allergenNotes}
                  onChange={(e) => set('allergenNotes', e.target.value)}
                  placeholder="VD: Trứng, sữa"
                  className={inputCls}
                />
              </Field>
            </div>
          </section>
          )}

          {/* STEP 3: Địa điểm & Ảnh */}
          {step === 3 && (
          <section className="bg-white rounded-2xl p-6 shadow-sm">
            <header className="mb-5">
              <h2 className="text-base font-medium text-neutral-800 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-[#efe8d8] text-[#236c2a] text-xs flex items-center justify-center font-medium">
                  3
                </span>
                Địa điểm & Ảnh
              </h2>
              <p className="text-xs text-neutral-500 font-normal mt-1 ml-9">
                Cho người nhận biết chính xác nơi lấy thực phẩm.
              </p>
            </header>

            <Field label="Địa chỉ lấy hàng" required>
              <input
                value={form.pickupAddress}
                onChange={(e) => set('pickupAddress', e.target.value)}
                placeholder="VD: 12 Nguyễn Huệ, Q1, TP.HCM"
                className={inputCls}
              />
            </Field>

            <Field label="Chọn vị trí trên bản đồ">
              <div className="h-56 rounded-xl overflow-hidden border border-neutral-200">
                <LocationPicker
                  lng={form.lng}
                  lat={form.lat}
                  onPick={(lng, lat) => {
                    set('lng', lng);
                    set('lat', lat);
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[11px] text-neutral-500 font-normal">
                  Toạ độ: {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                </p>
                {providerHasLocation && (
                  <button
                    type="button"
                    onClick={applyProviderLocation}
                    className="text-xs font-medium text-[#236c2a] hover:text-[#1a4f1f] inline-flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">my_location</span>
                    Dùng vị trí cửa hàng
                  </button>
                )}
              </div>
            </Field>

            <Field label="Ảnh thực phẩm" hint="Ảnh rõ giúp tin đăng uy tín hơn">
              {form.imageUrl ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.imageUrl}
                    alt=""
                    className="w-full max-w-xs aspect-square rounded-xl object-cover"
                  />
                  <div className="flex gap-2">
                    <label className="px-4 py-2 border border-neutral-200 rounded-lg text-xs font-medium hover:bg-neutral-50 cursor-pointer transition-colors">
                      {uploadImage.isPending ? 'Đang tải...' : 'Đổi ảnh'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        onChange={handlePickImage}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => set('imageUrl', '')}
                      className="px-4 py-2 border border-rose-200 text-rose-600 rounded-lg text-xs font-medium hover:bg-rose-50 transition-colors"
                    >
                      Xoá
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 w-full py-10 border-2 border-dashed border-neutral-300 rounded-xl text-xs font-medium text-neutral-400 hover:border-[#236c2a] hover:text-[#236c2a] cursor-pointer transition-colors">
                  <span className="material-symbols-outlined text-[28px]">
                    add_photo_alternate
                  </span>
                  <span>{uploadImage.isPending ? 'Đang tải...' : 'Chọn ảnh'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={handlePickImage}
                  />
                </label>
              )}
            </Field>
          </section>
          )}

          {/* Action footer */}
          <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 py-2.5 text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors"
            >
              Huỷ
            </button>

            <div className="flex items-center gap-3">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as Step)}
                  className="px-5 py-2.5 border border-neutral-200 text-neutral-700 rounded-xl text-sm font-medium hover:bg-neutral-50 transition-colors inline-flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  Quay lại
                </button>
              )}
              {step < 3 && (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1 && validations.step1) setStep(2);
                    else if (step === 2 && validations.step2) setStep(3);
                    else toast.error('Vui lòng điền đầy đủ các trường bắt buộc.');
                  }}
                  className="px-6 py-2.5 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-xl text-sm font-medium inline-flex items-center gap-1 transition-colors"
                >
                  Tiếp tục
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </button>
              )}
              {step === 3 && (
                <button
                  type="submit"
                  disabled={isAnyPending}
                  className="px-6 py-2.5 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-xl text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">save</span>
                  {createListing.isPending ? 'Đang lưu...' : 'Tạo tin (Nháp)'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: trạng thái + gợi ý */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          <div className="bg-[#d8ebde] rounded-2xl p-5">
            <h4 className="text-[#236c2a] font-medium text-sm flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">tips_and_updates</span>
              Mẹo để tin đăng hiệu quả
            </h4>
            <ul className="mt-3 space-y-2 text-xs text-[#236c2a]/85 font-normal">
              <li className="flex gap-1.5">
                <span>•</span>
                <span>Ảnh chụp thực phẩm dưới ánh sáng tự nhiên giúp tăng 2× lượt đặt.</span>
              </li>
              <li className="flex gap-1.5">
                <span>•</span>
                <span>Ghi rõ thời gian hết hạn để bếp ăn / TNV chủ động.</span>
              </li>
              <li className="flex gap-1.5">
                <span>•</span>
                <span>Tối đa / đơn ≤ 3 để chia sẻ được nhiều người hơn.</span>
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs text-neutral-500 uppercase tracking-wide font-medium">
              Trạng thái
            </h4>
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 text-neutral-600 text-xs font-medium">
              <span className="material-symbols-outlined text-sm">edit_note</span>
              Sẽ lưu ở trạng thái Nháp
            </div>
            <p className="mt-3 text-xs text-neutral-500 font-normal">
              Sau khi tạo, bạn có thể vào Trang quản trị → <b>Bài đăng hiện tại</b> → nhấn{' '}
              <span className="material-symbols-outlined align-middle text-sm">rocket_launch</span>{' '}
              để đăng.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs text-neutral-500 uppercase tracking-wide font-medium mb-3">
              Tóm tắt
            </h4>
            <dl className="space-y-2 text-xs">
              <SummaryRow label="Tiêu đề" value={form.title || '—'} />
              <SummaryRow
                label="Danh mục"
                value={DEFAULT_CATEGORIES.find((c) => c.value === form.category)?.label ?? '—'}
              />
              <SummaryRow
                label="Số lượng"
                value={`${form.quantityTotal} ${
                  DEFAULT_UNITS.find((u) => u.value === form.quantityUnit)?.label ?? ''
                }`}
              />
              <SummaryRow
                label="Hạn lấy"
                value={dateTimeDisplay({
                  pickupEndDate: form.pickupEndDate,
                  pickupEndTime: form.pickupEndTime,
                })}
              />
              <SummaryRow label="Địa chỉ" value={form.pickupAddress || '—'} />
            </dl>
          </div>
        </aside>
      </form>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-neutral-500 font-normal">{label}</dt>
      <dd className="text-neutral-800 font-medium text-right truncate max-w-[60%]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function PreviewCard({ form }: { form: ListingForm }) {
  const cat = DEFAULT_CATEGORIES.find((c) => c.value === form.category);
  const unit = DEFAULT_UNITS.find((u) => u.value === form.quantityUnit);
  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      {form.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={form.imageUrl} alt="" className="w-full aspect-[16/10] object-cover" />
      ) : (
        <div className="w-full aspect-[16/10] bg-neutral-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-[40px] text-neutral-300">
            image_not_supported
          </span>
        </div>
      )}
      <div className="p-4 space-y-2">
        <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
          {cat?.label ?? '—'}
        </span>
        <h3 className="font-medium text-base text-neutral-800">{form.title || '—'}</h3>
        <p className="text-xs text-neutral-500 font-normal">
          {form.description || 'Chưa có mô tả'}
        </p>
        <div className="flex items-center gap-3 text-xs text-neutral-500 pt-1 font-normal">
          <span>{form.quantityTotal} {unit?.label ?? '—'}</span>
          <span>•</span>
          <span>
            Hạn lấy: {dateTimeDisplay({
              pickupEndDate: form.pickupEndDate,
              pickupEndTime: form.pickupEndTime,
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
