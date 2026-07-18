'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import {
  useProviderListings,
  useCreateListing,
  usePublishListing,
  useCancelListing,
  useUpdateListing,
  type ProviderListing,
  type CreateListingInput,
  type UpdateListingInput,
} from '@/hooks/useProviderListings';
import { useMe } from '@/hooks/useProfile';
import { FoodCategory, FoodGroup, QuantityUnit, FOOD_CATEGORY_LABEL, FOOD_GROUP_CATEGORIES } from '@foodresq/types';
import { useProviderEsg } from '@/hooks/useEsg';
import { useUploadImage } from '@/hooks/useUploadImage';
import { mediaUrl } from '@/lib/utils';
import BulkRunRequests from '@/components/deliveries/BulkRunRequests';
import ProviderHeaderCard from '@/components/provider/ProviderHeaderCard';
import StatCell from '@/components/provider/StatCell';
import DataTable, { type Column } from '@/components/provider/DataTable';
import FilterBar, { type FilterOption } from '@/components/provider/FilterBar';

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

/**
 * Build form state.
 *  - Không có `source` (listing gốc) → chế độ tạo mới, prefill từ hồ sơ NCC.
 *  - Có `source` → chế độ sửa, prefill từ listing (ưu tiên hơn hồ sơ NCC).
 */
function buildForm(
  provider: {
    address?: string | null;
    lng?: number | null;
    lat?: number | null;
  } | null | undefined,
  source?: ProviderListing | null,
) {
  const fallbackLng = 106.6297;
  const fallbackLat = 10.8231;
  const hasProviderLocation = !!(provider && provider.lng != null && provider.lat != null);

  if (source) {
    // Chế độ sửa — lấy mọi giá trị từ listing gốc
    return {
      title: source.title ?? '',
      description: source.description ?? '',
      category: (source.category as FoodCategory) || FoodCategory.COOKED_MEAL,
      quantityTotal: Number(source.quantityTotal) || 1,
      quantityUnit: (source.quantityUnit as QuantityUnit) || QuantityUnit.PORTION,
      weightPerUnitKg: source.weightPerUnitKg ?? '',
      pickupStartTime: toLocalInput(source.pickupStartTime),
      pickupEndTime: toLocalInput(source.pickupEndTime),
      expiryTime: toLocalInput(source.expiryTime),
      pickupAddress: source.pickupAddress ?? '',
      lng: source.lng ?? (hasProviderLocation ? (provider!.lng as number) : fallbackLng),
      lat: source.lat ?? (hasProviderLocation ? (provider!.lat as number) : fallbackLat),
      storageConditions: source.storageConditions ?? '',
      allergenNotes: source.allergenNotes ?? '',
      maxPerReservation: source.maxPerReservation ?? 1,
      imageUrl: source.imageUrls?.[0] ?? '',
    };
  }

  return {
    title: '',
    description: '',
    category: FoodCategory.COOKED_MEAL as FoodCategory,
    quantityTotal: 10,
    quantityUnit: QuantityUnit.PORTION as QuantityUnit,
    weightPerUnitKg: '',
    pickupStartTime: localDateTime(0),
    pickupEndTime: localDateTime(24),
    expiryTime: localDateTime(48),
    pickupAddress: provider?.address ?? '',
    lng: hasProviderLocation ? (provider!.lng as number) : fallbackLng,
    lat: hasProviderLocation ? (provider!.lat as number) : fallbackLat,
    storageConditions: '',
    allergenNotes: '',
    maxPerReservation: 3,
    imageUrl: '',
  };
}

/** ISO string → giá trị `YYYY-MM-DDTHH:mm` cho input `datetime-local`. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return localDateTime(0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(local: string): string {
  return new Date(local).toISOString();
}

export default function ProviderListingsPage() {
  const { data, isLoading, isError } = useProviderListings();
  const { data: esg } = useProviderEsg();
  const { data: me } = useMe();
  const createListing = useCreateListing();
  const publishListing = usePublishListing();
  const cancelListing = useCancelListing();
  const updateListing = useUpdateListing();
  const uploadImage = useUploadImage();

  const providerProfile = me?.provider ?? null;
  const providerVerified = providerProfile?.verificationStatus === 'approved';
  const providerHasLocation = !!(providerProfile && providerProfile.lng != null && providerProfile.lat != null);
  const providerAddress = providerProfile?.address?.trim() || 'Chưa cập nhật địa chỉ';

  /** null = đóng modal; non-null = đang mở modal (chế độ tạo hoặc sửa). */
  type FormMode =
    | { kind: 'closed' }
    | { kind: 'create' }
    | { kind: 'edit'; listing: ProviderListing };
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' });
  const [form, setForm] = useState(() => buildForm(providerProfile));

  const listings = (data?.items ?? []) as ProviderListing[];

  const editingListing = formMode.kind === 'edit' ? formMode.listing : null;
  const editingIsActive = editingListing ? editingListing.status !== 'draft' : false;

  // ---- Filter state (table view) ----
  type StatusFilter = 'all' | 'open' | 'draft' | 'closed';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const statusOptions: FilterOption<StatusFilter>[] = [
    { value: 'all',    label: 'Tất cả',        count: listings.length },
    { value: 'open',   label: 'Đang mở',       count: listings.filter((l) => l.status === 'active' || l.status === 'fully_reserved').length },
    { value: 'draft',  label: 'Nháp',          count: listings.filter((l) => l.status === 'draft').length },
    { value: 'closed', label: 'Đã đóng',       count: listings.filter((l) => ['completed', 'expired', 'cancelled'].includes(l.status)).length },
  ];
  const filteredListings = listings.filter((l) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'open') return l.status === 'active' || l.status === 'fully_reserved';
    if (statusFilter === 'draft') return l.status === 'draft';
    return ['completed', 'expired', 'cancelled'].includes(l.status);
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const listingColumns: Column<ProviderListing>[] = [
    {
      key: 'title',
      header: 'Tin đăng',
      cell: (l) => (
        <div className="flex items-center gap-3 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(l.imageUrls[0] || '') || '/food_bread.png'}
            alt={l.title}
            className="w-10 h-10 rounded-lg object-cover bg-neutral-100 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-bold text-neutral-900 truncate">{l.title}</p>
            <p className="text-[11px] text-neutral-500 truncate">{l.pickupAddress}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: '160px',
      cell: (l) => {
        const meta = STATUS_META[l.status] ?? { label: l.status, cls: 'bg-neutral-100 text-neutral-600 border-neutral-200' };
        return <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${meta.cls}`}>{meta.label}</span>;
      },
    },
    {
      key: 'qty',
      header: 'Số lượng',
      align: 'right',
      width: '130px',
      cell: (l) => (
        <span className="font-bold text-neutral-800 tabular-nums">
          {Number(l.quantityRemaining)}/{Number(l.quantityTotal)} <span className="text-neutral-500 font-semibold">{l.quantityUnit}</span>
        </span>
      ),
    },
    {
      key: 'pickup',
      header: 'Hạn lấy',
      width: '140px',
      cell: (l) => <span className="text-[12px] text-neutral-600 tabular-nums">{formatDate(l.pickupEndTime)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '160px',
      cell: (l) => (
        <div className="inline-flex items-center gap-1.5">
          {(l.status === 'draft' || l.status === 'active' || l.status === 'fully_reserved') && (
            <button
              onClick={(e) => { e.stopPropagation(); openEdit(l); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-neutral-700 hover:bg-neutral-100"
              title={l.status === 'draft' ? 'Sửa tin nháp' : 'Sửa thông tin phụ'}
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
              Sửa
            </button>
          )}
          {l.status === 'draft' && (
            <button
              onClick={(e) => { e.stopPropagation(); void handlePublish(l.id); }}
              disabled={publishListing.isPending}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50"
            >
              Đăng
            </button>
          )}
          {(l.status === 'draft' || l.status === 'active' || l.status === 'fully_reserved') && (
            <button
              onClick={(e) => { e.stopPropagation(); void handleCancel(l.id); }}
              disabled={cancelListing.isPending}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              title="Huỷ tin"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function openCreate() {
    setForm(buildForm(providerProfile));
    setFormMode({ kind: 'create' });
  }

  function openEdit(listing: ProviderListing) {
    setForm(buildForm(providerProfile, listing));
    setFormMode({ kind: 'edit', listing });
  }

  function closeForm() {
    setFormMode({ kind: 'closed' });
  }

  function applyProviderLocation() {
    if (!providerProfile || providerProfile.lng == null || providerProfile.lat == null) {
      toast.error('Chưa có toạ độ cửa hàng trong hồ sơ. Vui lòng cập nhật hồ sơ trước.');
      return;
    }
    setForm((f) => ({
      ...f,
      pickupAddress: providerProfile.address || f.pickupAddress,
      lng: providerProfile.lng as number,
      lat: providerProfile.lat as number,
    }));
    toast.success('Đã áp dụng vị trí cửa hàng đã đăng ký');
  }

  // Ổn định reference để LocationPicker không re-mount Marker mỗi lần parent re-render.
  const handlePickLocation = useCallback(
    (lng: number, lat: number) => setForm((f) => ({ ...f, lng, lat })),
    [],
  );

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
      pickupStartTime: toIso(form.pickupStartTime),
      pickupEndTime: toIso(form.pickupEndTime),
      expiryTime: toIso(form.expiryTime),
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
      toast.success('Đã tạo tin (trạng thái Nháp). Bấm "Đăng" để mở nhận đặt.');
      closeForm();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Tạo tin thất bại';
      toast.error(msg);
    }
  }

  /** Chọn ảnh từ thiết bị → upload lên API (kind=listing) → lưu URL vào form. */
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại cùng file
    if (!file) return;
    try {
      const url = await uploadImage.mutateAsync({ file, kind: 'listing' });
      setForm((f) => ({ ...f, imageUrl: url }));
      toast.success('Đã tải ảnh lên.');
    } catch {
      toast.error('Tải ảnh thất bại — chỉ nhận JPEG/PNG/WebP tối đa 5MB.');
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingListing) return;
    if (form.title.trim().length < 5) {
      toast.error('Tiêu đề tối thiểu 5 ký tự');
      return;
    }
    // Active whitelist: địa chỉ, giờ, số lượng bị khoá → bỏ qua
    const payload: UpdateListingInput = editingIsActive
      ? {
          description: form.description.trim() || undefined,
          storageConditions: form.storageConditions.trim() || undefined,
          allergenNotes: form.allergenNotes.trim() || undefined,
          imageUrls: form.imageUrl.trim() ? [form.imageUrl.trim()] : undefined,
        }
      : {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          category: form.category,
          quantityTotal: Number(form.quantityTotal),
          quantityUnit: form.quantityUnit,
          weightPerUnitKg: form.weightPerUnitKg ? Number(form.weightPerUnitKg) : undefined,
          pickupStartTime: toIso(form.pickupStartTime),
          pickupEndTime: toIso(form.pickupEndTime),
          expiryTime: toIso(form.expiryTime),
          pickupAddress: form.pickupAddress.trim(),
          lng: form.lng,
          lat: form.lat,
          storageConditions: form.storageConditions.trim() || undefined,
          allergenNotes: form.allergenNotes.trim() || undefined,
          maxPerReservation: Number(form.maxPerReservation),
          imageUrls: form.imageUrl.trim() ? [form.imageUrl.trim()] : undefined,
        };

    try {
      await updateListing.mutateAsync({ id: editingListing.id, input: payload });
      toast.success(editingIsActive ? 'Đã cập nhật thông tin phụ' : 'Đã lưu thay đổi');
      closeForm();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Lưu thất bại';
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
    <div className="flex-1 min-w-0 bg-mesh-brand">
      <div className="max-w-6xl mx-auto px-4 md:px-8 lg:px-10 py-6 md:py-10 space-y-6">
        <ProviderHeaderCard
          crumbs={[{ href: '/', label: 'Trang chủ' }, { label: 'Cửa hàng' }]}
            eyebrow="Bảng điều khiển"
            title={providerProfile?.businessName ?? 'Cửa hàng của tôi'}
            description="Đăng và quản lý thực phẩm dư cần cứu trợ — theo dõi tồn kho, đơn nhận và tác động ESG của cửa hàng bạn."
            meta={
              providerProfile && (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${
                      providerVerified
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[12px]">
                      {providerVerified ? 'verified' : 'hourglass_top'}
                    </span>
                    {providerVerified ? 'Đã duyệt' : `Trạng thái: ${providerProfile.verificationStatus}`}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-neutral-150 text-[11px] font-bold text-neutral-600">
                    <span className="material-symbols-outlined text-[12px] text-neutral-500">place</span>
                    <span className="truncate max-w-[280px]">{providerAddress}</span>
                  </span>
                </div>
              )
            }
            cta={
              <button
                onClick={openCreate}
                disabled={!providerVerified}
                title={!providerVerified ? 'Hồ sơ cửa hàng chưa được quản trị viên duyệt' : 'Đăng tin thực phẩm mới'}
                className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-neutral-200 disabled:text-neutral-450 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-sm shadow-sm transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
                Đăng bài
              </button>
            }
          />

          {providerProfile && !providerVerified && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900">
              <span className="material-symbols-outlined text-amber-600">verified_user</span>
              <div className="flex-1 text-sm">
                <p className="font-bold">
                  Hồ sơ cửa hàng chưa được duyệt — hiện trạng thái:{' '}
                  <span className="uppercase">{providerProfile.verificationStatus}</span>
                </p>
                <p className="text-xs mt-1 text-amber-800/80">
                  Bạn có thể tạo tin nháp để chuẩn bị sẵn nội dung, nhưng không thể đăng (publish) cho đến khi quản trị viên
                  phê duyệt hồ sơ <b>{providerProfile.businessName}</b>.
                </p>
              </div>
            </div>
          )}

          {providerProfile && !providerHasLocation && (
            <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sky-900">
              <span className="material-symbols-outlined text-sky-600">location_off</span>
              <div className="flex-1 text-sm">
                Cửa hàng chưa có toạ độ trong hồ sơ. Cập nhật vị trí đăng ký (trang Hồ sơ) để lần sau không phải nhập lại.
              </div>
            </div>
          )}

          {esg && (
            <section aria-label="Tổng quan tác động">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <StatCell tone="sage"    icon="scale"        value={`${esg.kgRescued} kg`}   label="Thực phẩm đã cứu" />
                <StatCell tone="honey"   icon="co2"          value={`${esg.co2SavedKg} kg`}  label="CO₂ giảm thiểu" />
                <StatCell tone="sky"     icon="restaurant"   value={esg.mealsServed}          label="Suất đã trao" />
                <StatCell tone="neutral" icon="diversity_3"  value={esg.peopleHelped}         label="Người được giúp" />
              </div>
            </section>
          )}

          <BulkRunRequests />

          <section aria-label="Danh sách tin đăng" className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-base font-extrabold text-neutral-900">Danh sách tin đăng</h2>
              <p className="text-xs text-neutral-500 font-bold">
                {listings.length} tin · {listings.filter((l) => l.status === 'active').length} đang mở
              </p>
            </div>

            <FilterBar<StatusFilter>
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
            />

            <DataTable<ProviderListing>
              rows={filteredListings}
              rowKey={(l) => l.id}
              loading={isLoading}
              columns={listingColumns}
              onRowClick={(l) => openEdit(l)}
              empty={
                !isError && (
                  <div className="py-6 flex flex-col items-center gap-2 text-neutral-450">
                    <span className="material-symbols-outlined text-[44px] text-neutral-250">storefront</span>
                    <p className="font-extrabold text-sm text-neutral-600">Chưa có tin nào</p>
                    <p className="text-xs">Bấm &quot;Đăng bài&quot; để chia sẻ thực phẩm dư.</p>
                  </div>
                )
              }
            />

            {isError && (
              <div className="text-center py-10 bg-white rounded-2xl border border-rose-100">
                <span className="material-symbols-outlined text-rose-500 text-[44px]">wifi_off</span>
                <p className="font-bold text-neutral-700 mt-2">Không tải được danh sách</p>
              </div>
            )}
          </section>
        </div>

      {/* FORM TẠO / SỬA TIN */}
      {formMode.kind !== 'closed' && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-start justify-center px-3 md:px-6 pt-24 md:pt-32 pb-6 overflow-y-auto">
          <form
            onSubmit={editingListing ? handleUpdate : handleCreate}
            className="bg-white rounded-3xl border border-neutral-150 w-full max-w-5xl my-6 overflow-hidden shadow-2xl flex flex-col max-h-[calc(100vh-3rem)]"
          >
            {/* === Header === */}
            <div className="px-6 md:px-8 py-5 border-b border-neutral-150 sticky top-0 bg-white z-20">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                    {editingListing ? 'Cập nhật tin' : 'Tin đăng mới'}
                  </p>
                  <h3 className="mt-1 text-xl md:text-2xl font-extrabold text-neutral-900">
                    {editingListing
                      ? editingIsActive
                        ? 'Sửa thông tin phụ'
                        : 'Sửa tin nháp'
                      : 'Đăng tin thực phẩm'}
                  </h3>
                  {editingListing ? (
                    <p className="text-xs text-neutral-500 mt-1 truncate">{editingListing.title}</p>
                  ) : (
                    <p className="text-xs text-neutral-500 mt-1">Chia sẻ thực phẩm dư — giúp đỡ cộng đồng xung quanh.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  className="p-2 hover:bg-neutral-100 rounded-full text-neutral-450 shrink-0"
                  aria-label="Đóng"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Bước (stepper) — phản ánh 3 section trong form */}
              {!editingListing && (
                <ol className="mt-4 flex items-center gap-2 text-[11px] font-bold text-neutral-500 overflow-x-auto scrollbar-none">
                  {[
                    { n: '01', label: 'Thông tin cơ bản' },
                    { n: '02', label: 'Số lượng & Thời hạn' },
                    { n: '03', label: 'Địa điểm & Ghi chú' },
                  ].map((s, i, arr) => (
                    <li key={s.n} className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold">
                        {s.n}
                      </span>
                      <span className="text-neutral-700">{s.label}</span>
                      {i < arr.length - 1 && <span className="w-6 h-px bg-neutral-200" />}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* === Banner quyền sửa (active) === */}
            {editingIsActive && (
              <div className="mx-6 md:mx-8 mt-4 flex items-start gap-2 bg-sky-50 border border-sky-200 rounded-xl p-3 text-sky-900 text-xs">
                <span className="material-symbols-outlined text-[16px] text-sky-600 mt-0.5">info</span>
                <span>
                  Tin đã được đăng — chỉ có thể sửa <b>mô tả, ảnh, bảo quản, dị ứng</b>. Muốn đổi giờ/địa điểm/suất, hãy huỷ rồi tạo lại tin.
                </span>
              </div>
            )}

            {/* === Body 2 cột: form trái + aside phải === */}
            <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
              {/* ---- Cột trái: form chia section ---- */}
              <div className="space-y-6">
                {/* Section 1: Thông tin cơ bản */}
                <section>
                  <SectionHead step="01" title="Thông tin cơ bản" hint="Tiêu đề + mô tả + danh mục" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Tiêu đề *" disabled={editingIsActive}>
                      <input
                        value={form.title}
                        onChange={(e) => set('title', e.target.value)}
                        required
                        minLength={5}
                        placeholder="VD: Cơm hộp dư cuối ngày"
                        disabled={editingIsActive}
                        className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed`}
                      />
                    </Field>

                    <Field label="Danh mục *" disabled={editingIsActive}>
                      <select
                        value={form.category}
                        onChange={(e) => set('category', e.target.value as FoodCategory)}
                        disabled={editingIsActive}
                        className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed`}
                      >
                        <optgroup label="Thực phẩm ăn liền">
                          {CATEGORY_OPTS.filter((c) => c.group === FoodGroup.READY_TO_EAT).map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Nguyên liệu thô">
                          {CATEGORY_OPTS.filter((c) => c.group === FoodGroup.RAW_INGREDIENT).map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Khác">
                          {CATEGORY_OPTS.filter((c) => c.group === FoodGroup.OTHER).map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </Field>

                    <div className="md:col-span-2">
                      <Field label="Mô tả">
                        <textarea
                          value={form.description}
                          onChange={(e) => set('description', e.target.value)}
                          rows={2}
                          placeholder="Mô tả thêm về thực phẩm (thành phần, tình trạng, ghi chú...)"
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  </div>
                </section>

                {/* Section 2: Số lượng & Thời hạn */}
                <section>
                  <SectionHead step="02" title="Số lượng & Thời hạn" hint="Khối lượng và khung giờ nhận" />
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="Tổng số lượng *" disabled={editingIsActive}>
                        <input
                          type="number"
                          min={1}
                          value={form.quantityTotal}
                          onChange={(e) => set('quantityTotal', Number(e.target.value))}
                          required
                          disabled={editingIsActive}
                          className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed`}
                        />
                      </Field>
                      <Field label="Đơn vị *" disabled={editingIsActive}>
                        <select
                          value={form.quantityUnit}
                          onChange={(e) => set('quantityUnit', e.target.value as QuantityUnit)}
                          disabled={editingIsActive}
                          className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed`}
                        >
                          {UNIT_OPTS.map((u) => (
                            <option key={u.value} value={u.value}>{u.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Tối đa / đặt *" disabled={editingIsActive}>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={form.maxPerReservation}
                          onChange={(e) => set('maxPerReservation', Number(e.target.value))}
                          required
                          disabled={editingIsActive}
                          className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed`}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Field label="Bắt đầu lấy *" disabled={editingIsActive}>
                        <input
                          type="datetime-local"
                          value={form.pickupStartTime}
                          onChange={(e) => set('pickupStartTime', e.target.value)}
                          required
                          disabled={editingIsActive}
                          className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed`}
                        />
                      </Field>
                      <Field label="Hạn lấy *" disabled={editingIsActive}>
                        <input
                          type="datetime-local"
                          value={form.pickupEndTime}
                          onChange={(e) => set('pickupEndTime', e.target.value)}
                          required
                          disabled={editingIsActive}
                          className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed`}
                        />
                      </Field>
                      <Field label="Hạn sử dụng *" disabled={editingIsActive}>
                        <input
                          type="datetime-local"
                          value={form.expiryTime}
                          onChange={(e) => set('expiryTime', e.target.value)}
                          required
                          disabled={editingIsActive}
                          className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed`}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Bảo quản">
                        <input
                          value={form.storageConditions}
                          onChange={(e) => set('storageConditions', e.target.value)}
                          placeholder="VD: Giữ nóng"
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  </div>
                </section>

                {/* Section 3: Địa điểm & Ghi chú */}
                <section>
                  <SectionHead step="03" title="Địa điểm & Ghi chú" hint="Địa chỉ + bản đồ + dị ứng" />
                  <div className="space-y-4">
                    <Field label="Địa chỉ lấy hàng *" disabled={editingIsActive}>
                      <input
                        value={form.pickupAddress}
                        onChange={(e) => set('pickupAddress', e.target.value)}
                        required
                        placeholder="VD: 12 Nguyễn Huệ, Q1, TP.HCM"
                        disabled={editingIsActive}
                        className={`${inputCls} disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed`}
                      />
                    </Field>

                    <Field label="Chọn vị trí trên bản đồ (bấm để đặt ghim)" disabled={editingIsActive}>
                      <div
                        className={`h-56 rounded-xl overflow-hidden border border-neutral-200 ${
                          editingIsActive ? 'pointer-events-none opacity-70' : ''
                        }`}
                      >
                        <LocationPicker
                          lng={form.lng}
                          lat={form.lat}
                          onPick={handlePickLocation}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[11px] text-neutral-450">
                          Toạ độ: {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                        </p>
                        {!editingIsActive && providerHasLocation && (
                          <button
                            type="button"
                            onClick={applyProviderLocation}
                            className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">storefront</span>
                            Dùng vị trí cửa hàng đã đăng ký
                          </button>
                        )}
                      </div>
                    </Field>

                    <Field label="Ghi chú dị ứng">
                      <input
                        value={form.allergenNotes}
                        onChange={(e) => set('allergenNotes', e.target.value)}
                        placeholder="VD: Trứng, sữa"
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </section>
              </div>

              {/* ---- Cột phải: aside ---- */}
              <aside className="lg:sticky lg:top-[112px] space-y-4">
                {/* Trạng thái tin */}
                <div className="bg-white border border-neutral-150 rounded-2xl p-5 shadow-sm">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-neutral-450">Trạng thái</p>
                  {editingListing ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${
                          STATUS_META[editingListing.status]?.cls ??
                          'bg-neutral-100 text-neutral-600 border-neutral-200'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[12px]">
                          {STATUS_META[editingListing.status]?.label === 'Nháp' ? 'edit_note' : 'check_circle'}
                        </span>
                        {STATUS_META[editingListing.status]?.label ?? editingListing.status}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-neutral-700">
                      Tin sẽ được lưu ở trạng thái <b>Nháp</b>. Bấm <b>Đăng</b> trên danh sách để mở nhận đặt.
                    </p>
                  )}
                  <div className="mt-3 pt-3 border-t border-neutral-100 grid grid-cols-2 gap-2 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-neutral-450 font-bold">Đã đặt</p>
                      <p className="text-lg font-extrabold text-neutral-900 tabular-nums">
                        {editingListing ? Number(editingListing.quantityTotal) - Number(editingListing.quantityRemaining) : 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-neutral-450 font-bold">Còn lại</p>
                      <p className="text-lg font-extrabold text-emerald-700 tabular-nums">
                        {editingListing ? Number(editingListing.quantityRemaining) : Number(form.quantityTotal)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Ảnh */}
                <div className="bg-white border border-neutral-150 rounded-2xl p-5 shadow-sm">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-neutral-450">Ảnh thực phẩm</p>
                  <p className="text-xs text-neutral-500 mt-1">JPEG/PNG/WebP · tối đa 5MB</p>

                  <div className="mt-3">
                    {form.imageUrl ? (
                      <div className="space-y-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mediaUrl(form.imageUrl)}
                          alt="Ảnh tin"
                          className="w-full aspect-square rounded-2xl object-cover border border-neutral-200"
                        />
                        <div className="flex gap-2">
                          <label className="flex-1 text-center py-2 border border-neutral-200 rounded-xl text-xs font-bold hover:bg-neutral-50 cursor-pointer">
                            {uploadImage.isPending ? 'Đang tải...' : 'Đổi ảnh'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              disabled={uploadImage.isPending}
                              onChange={onPickImage}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => set('imageUrl', '')}
                            className="px-3 py-2 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-50"
                          >
                            Xoá
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-neutral-200 rounded-2xl text-xs font-bold text-emerald-800 hover:bg-emerald-50 cursor-pointer">
                        <span className="material-symbols-outlined text-[28px]">add_photo_alternate</span>
                        <span>{uploadImage.isPending ? 'Đang tải ảnh...' : 'Chọn ảnh từ thiết bị'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={uploadImage.isPending}
                          onChange={onPickImage}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Gợi ý */}
                <div className="bg-honey-50 border border-honey-100 rounded-2xl p-5">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-honey-700">Gợi ý</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-neutral-700">
                    <li className="flex gap-1.5"><span>•</span>Đặt tiêu đề ngắn gọn, nêu rõ món & số phần.</li>
                    <li className="flex gap-1.5"><span>•</span>Hẹn hạn lấy sớm hơn hạn sử dụng 30–60 phút.</li>
                    <li className="flex gap-1.5"><span>•</span>Thêm ảnh thật giúp người nhận quyết định nhanh hơn.</li>
                  </ul>
                </div>
              </aside>
            </div>

            {/* === Footer === */}
            <div className="px-6 md:px-8 py-4 border-t border-neutral-150 flex flex-col-reverse sm:flex-row sm:items-center gap-3 sticky bottom-0 bg-white z-20">
              <button
                type="button"
                onClick={closeForm}
                className="sm:flex-none sm:px-5 py-3 border border-neutral-200 text-neutral-700 font-bold text-sm rounded-xl hover:bg-neutral-50"
              >
                Huỷ
              </button>
              <div className="hidden sm:block flex-1 text-xs text-neutral-500">
                Mọi thay đổi sẽ được lưu vào tin này.
              </div>
              <button
                type="submit"
                disabled={createListing.isPending || updateListing.isPending}
                className="sm:flex-1 sm:max-w-[260px] py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                {editingListing
                  ? updateListing.isPending
                    ? 'Đang lưu...'
                    : editingIsActive
                      ? 'Lưu thông tin phụ'
                      : 'Lưu thay đổi'
                  : createListing.isPending
                    ? 'Đang tạo...'
                    : 'Tạo tin nháp'}
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

function Field({ label, children, disabled }: { label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div className={`space-y-1.5 text-left ${disabled ? 'opacity-90' : ''}`}>
      <label className="text-xs text-neutral-450 font-bold uppercase tracking-wide flex items-center gap-1">
        {label}
        {disabled && (
          <span className="material-symbols-outlined text-[12px] text-neutral-400" title="Trường này bị khoá khi sửa tin đã đăng">lock</span>
        )}
      </label>
      {children}
    </div>
  );
}

function SectionHead({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return (
    <div className="mb-3 pb-2 border-b border-neutral-100 flex items-baseline justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">{step}</span>
        <h4 className="text-sm font-extrabold text-neutral-900">{title}</h4>
      </div>
      {hint && <span className="text-[11px] text-neutral-450 font-medium hidden sm:inline">{hint}</span>}
    </div>
  );
}
