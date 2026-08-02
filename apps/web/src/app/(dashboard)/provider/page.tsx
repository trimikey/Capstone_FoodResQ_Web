'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  useProviderListings,
  usePublishListing,
  useCancelListing,
  useDuplicateListing,
  useDeleteListing,
  useProviderStats,
  type ProviderListing,
} from '@/hooks/useProviderListings';
import { useMe } from '@/hooks/useProfile';
import { QuantityUnit } from '@foodresq/types';
import { useProviderEsg } from '@/hooks/useEsg';
import { UNIT_LABEL } from '@/lib/utils';
import BulkRunRequests from '@/components/deliveries/BulkRunRequests';
import ExtendListingModal from '@/components/listings/ExtendListingModal';
import ProviderRequestsSection from '@/components/campaigns/ProviderRequestsSection';
import ProviderHeaderCard from '@/components/provider/ProviderHeaderCard';
import { SafeImage } from '@/components/shared/SafeImage';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Nháp', cls: 'bg-neutral-100 text-neutral-600' },
  active: { label: 'Đang mở', cls: 'bg-emerald-100 text-emerald-800' },
  fully_reserved: { label: 'Hết suất', cls: 'bg-amber-100 text-amber-800' },
  completed: { label: 'Hoàn tất', cls: 'bg-blue-100 text-blue-800' },
  expired: { label: 'Hết hạn', cls: 'bg-neutral-100 text-neutral-500' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-rose-100 text-rose-700' },
};

type StatusFilter = 'all' | 'open' | 'draft' | 'closed';

export default function ProviderDashboardPage() {
  const router = useRouter();
  const { data, isLoading } = useProviderListings();
  const { data: esg } = useProviderEsg();
  const { data: me } = useMe();
  const { data: stats } = useProviderStats();
  const publishListing = usePublishListing();
  const cancelListing = useCancelListing();
  const duplicateListing = useDuplicateListing();
  const deleteListing = useDeleteListing();

  const providerProfile = me?.provider ?? null;
  const providerVerified = providerProfile?.verificationStatus === 'approved';
  const providerAddress = providerProfile?.address?.trim() || 'Chưa cập nhật địa chỉ';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [extendTarget, setExtendTarget] = useState<{ listing: ProviderListing; mode: 'extend_time' | 'add_quantity' | 'both' } | null>(null);

  const listings = (data?.items ?? []) as ProviderListing[];
  const filteredListings = listings.filter((l) => {
    const isPastPickup = new Date(l.pickupEndTime).getTime() < Date.now();
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'open'
        ? (l.status === 'active' || l.status === 'fully_reserved') && !isPastPickup
        : statusFilter === 'draft'
        ? l.status === 'draft'
        : statusFilter === 'closed'
        ? ['completed', 'expired', 'cancelled'].includes(l.status) ||
          (l.status === 'active' && isPastPickup)
        : true);
    return matchesStatus;
  });

  function openCreate() {
    router.push('/provider/create');
  }

  async function handlePublish(id: string) {
    try { await publishListing.mutateAsync(id); toast.success('Đã đăng tin'); }
    catch { toast.error('Đăng tin thất bại'); }
  }

  async function handleCancel(id: string) {
    try { await cancelListing.mutateAsync({ id }); toast.info('Đã huỷ tin'); }
    catch { toast.error('Huỷ thất bại'); }
  }

  async function handleDuplicate(id: string) {
    try { await duplicateListing.mutateAsync(id); toast.success('Đã tạo bản nháp mới'); }
    catch { toast.error('Nhân bản thất bại'); }
  }

  async function handleDelete(listing: ProviderListing) {
    if (!window.confirm(`Xoá vĩnh viễn tin nháp "${listing.title}"?\nHành động này không thể hoàn tác.`)) {
      return;
    }
    try {
      await deleteListing.mutateAsync(listing.id);
      toast.success('Đã xoá tin nháp');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Xoá thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="flex-1 min-w-0 bg-mesh-brand">
      <div className="max-w-6xl mx-auto px-4 md:px-8 lg:px-10 py-6 md:py-10 space-y-6">
        {/* Page header — dùng component dùng chung để đồng bộ với create/scan/orders */}
        <ProviderHeaderCard
          eyebrow="Quản lý cửa hàng"
          title={providerProfile?.businessName ?? 'Cửa hàng của tôi'}
          description={
            providerVerified
              ? `Trạng thái: đã xác minh · ${providerAddress}`
              : 'Tài khoản đang chờ xác minh — vui lòng hoàn tất hồ sơ để đăng bài.'
          }
          meta={
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold ${
                  providerVerified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {providerVerified ? 'verified' : 'pending'}
                </span>
                {providerVerified ? 'Đã duyệt' : providerProfile?.verificationStatus ?? 'Chưa duyệt'}
              </span>
              {stats?.completionRate != null && (
                <span className="inline-flex items-center gap-1 text-neutral-500 font-normal">
                  <span className="material-symbols-outlined text-[14px] text-emerald-700">star</span>
                  {stats.completionRate}% hoàn thành
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-neutral-500 font-normal">
                <span className="material-symbols-outlined text-[14px] text-emerald-700">history</span>
                Tham gia từ {me?.createdAt ? new Date(me.createdAt).toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' }) : 'nay'}
              </span>
            </div>
          }
          cta={
            <>
              <Link
                href="/provider/create"
                className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors ${
                  providerVerified
                    ? 'bg-[#236c2a] hover:bg-[#1a4f1f]'
                    : 'pointer-events-none bg-neutral-300'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Tạo bài đăng
              </Link>
              <Link
                href="/profile"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                Sửa cửa hàng
              </Link>
            </>
          }
        />

        {/* Metric Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MetricCard icon="eco" label="Thực phẩm đã cứu" value={`${esg?.kgRescued ?? 0}`} unit="kg" tone="sage" />
          <MetricCard icon="cloud_done" label="CO₂ giảm thiểu" value={`${esg?.co2SavedKg ?? 0}`} unit="tấn" tone="sky" />
          <MetricCard icon="restaurant" label="Suất ăn chia sẻ" value={`${esg?.mealsServed ?? 0}`} unit="suất" tone="amber" />
          <MetricCard icon="volunteer_activism" label="Người được giúp" value={`${esg?.peopleHelped ?? 0}`} unit="người" tone="emerald" />
        </section>

        {/* Main Dashboard Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-1 space-y-6">
            {/* Quick Stats Card */}
            <section className="bg-[#d8ebde] rounded-2xl p-5 relative overflow-hidden border border-[#236c2a]/15">
              <div className="relative z-10">
                <h4 className="text-[#236c2a] font-bold text-sm flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  Chỉ số tin cậy
                </h4>
                <div className="flex items-center gap-2 mb-3 mt-3">
                  <div className="h-2.5 flex-1 max-w-[180px] bg-white/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#236c2a] rounded-full transition-all"
                      style={{ width: `${stats?.completionRate ?? 0}%` }}
                    />
                  </div>
                  <span className="text-[#236c2a] font-bold text-base tabular-nums">
                    {stats?.completionRate ?? 0}%
                  </span>
                </div>
                <p className="text-[#236c2a]/85 text-xs font-normal leading-relaxed">
                  Thứ hạng của bạn cao hơn 85% cửa hàng cùng khu vực.
                </p>
              </div>
              <span className="material-symbols-outlined absolute -bottom-3 -right-3 text-[88px] text-[#236c2a]/10 rotate-12">
                verified
              </span>
            </section>

            {/* Recent Activity */}
            <section className="bg-white rounded-2xl border border-neutral-150 p-5 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-sm text-neutral-900 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-700 text-[18px]">timeline</span>
                  Hoạt động gần đây
                </h3>
                <Link
                  href="/provider/orders"
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
                >
                  Tất cả
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              </div>
              <div className="space-y-4">
                <ActivityItem
                  icon="local_mall"
                  iconColor="emerald"
                  title="Đơn hàng #ORD-4592 đã được nhận"
                  time="10 phút trước"
                />
                <ActivityItem
                  icon="post_add"
                  iconColor="sky"
                  title="Bạn đã tạo bài đăng mới"
                  time="2 giờ trước"
                />
                <ActivityItem
                  icon="reviews"
                  iconColor="amber"
                  title="Đánh giá 5 sao từ Hội Từ Thiện"
                  time="Hôm qua"
                />
              </div>
            </section>
          </div>

          {/* Right Column - Current Postings */}
          <div className="lg:col-span-2">
            <section className="bg-white rounded-2xl border border-neutral-150 shadow-sm overflow-hidden">
              <header className="px-5 py-4 border-b border-neutral-100">
                <h3 className="font-bold text-sm text-neutral-900 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-700 text-[18px]">inventory_2</span>
                  Bài đăng hiện tại
                </h3>
                <p className="text-xs text-neutral-500 font-normal mt-0.5">
                  {filteredListings.length} mặt hàng đang được chia sẻ
                </p>
              </header>

              <div className="px-5 pt-4">
                <div className="flex gap-2 flex-wrap">
                  {(['open', 'draft', 'all', 'closed'] as StatusFilter[]).map((filter) => {
                    const active = statusFilter === filter;
                    return (
                      <button
                        key={filter}
                        onClick={() => setStatusFilter(filter)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                          active
                            ? 'bg-[#236c2a] text-white border-[#236c2a]'
                            : 'bg-white text-neutral-600 border-neutral-200 hover:border-[#236c2a]/40 hover:text-[#236c2a]'
                        }`}
                      >
                        { { open: 'Đang mở', draft: 'Nháp', all: 'Tất cả', closed: 'Đã đóng' }[filter] }
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-5 space-y-3">
                {isLoading &&
                  Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-24 bg-neutral-50 animate-pulse rounded-2xl border border-neutral-100" />
                  ))}

                {!isLoading && filteredListings.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto rounded-full bg-neutral-50 flex items-center justify-center">
                      <span className="material-symbols-outlined text-neutral-300 text-[36px]">inventory_2</span>
                    </div>
                    <p className="mt-3 font-bold text-sm text-neutral-600">Chưa có bài đăng nào</p>
                    <p className="text-xs text-neutral-500 font-normal mt-1">Bấm nút bên dưới để tạo bài đăng đầu tiên.</p>
                  </div>
                )}

                {!isLoading &&
                  filteredListings.map((listing) => (
                    <PostingItem
                      key={listing.id}
                      listing={listing}
                      onPublish={() => handlePublish(listing.id)}
                      onCancel={() => handleCancel(listing.id)}
                      onDuplicate={() => handleDuplicate(listing.id)}
                      onDelete={() => handleDelete(listing)}
                      onExtend={(mode) => setExtendTarget({ listing, mode })}
                      onOpen={() => router.push(`/listings/${listing.id}`)}
                    />
                  ))}

                <button
                  onClick={openCreate}
                  disabled={!providerVerified}
                  className="w-full py-3 border-2 border-dashed border-neutral-300 rounded-2xl text-neutral-500 hover:border-[#236c2a] hover:text-[#236c2a] transition-colors flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  Tạo bài đăng mới
                </button>
              </div>
            </section>
          </div>
        </div>

        <BulkRunRequests />

        {/* Yêu cầu hợp tác từ charity */}
        <section className="bg-white rounded-2xl border border-neutral-150 shadow-sm overflow-hidden">
          <header className="px-5 py-4 border-b border-neutral-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500 text-[20px]">storefront</span>
            <h3 className="font-bold text-sm text-neutral-900">Yêu cầu hợp tác từ tổ chức</h3>
          </header>
          <div className="p-5">
            <ProviderRequestsSection />
          </div>
        </section>

        {extendTarget && (
          <ExtendListingModal
            open
            onClose={() => setExtendTarget(null)}
            listing={extendTarget.listing}
            defaultMode={extendTarget.mode}
          />
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  unit: string;
  tone: 'sage' | 'amber' | 'sky' | 'emerald';
}) {
  const tones = {
    sage: { bg: 'bg-[#efe8d8]', text: 'text-[#236c2a]' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-700' },
    sky: { bg: 'bg-sky-100', text: 'text-sky-700' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  } as const;
  const t = tones[tone];
  return (
    <div className="bg-white p-4 md:p-5 rounded-2xl border border-neutral-150 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className={`w-10 h-10 rounded-xl ${t.bg} ${t.text} flex items-center justify-center`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">{label}</p>
      <p className="text-2xl md:text-3xl font-extrabold text-neutral-900 mt-1 tabular-nums">
        {value}
        <span className="text-xs font-medium text-neutral-500 ml-1">{unit}</span>
      </p>
    </div>
  );
}

function ActivityItem({
  icon,
  iconColor,
  title,
  time,
}: {
  icon: string;
  iconColor: 'emerald' | 'sky' | 'amber';
  title: string;
  time: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorMap[iconColor]}`}>
          <span className="material-symbols-outlined text-[14px]">{icon}</span>
        </div>
        <div className="w-px flex-grow bg-neutral-200 my-1" />
      </div>
      <div className="pb-1">
        <p className="text-sm text-neutral-800 leading-snug font-semibold">{title}</p>
        <p className="text-xs text-neutral-500 mt-0.5 font-normal">{time}</p>
      </div>
    </div>
  );
}

function PostingItem({
  listing,
  onPublish,
  onCancel,
  onDuplicate,
  onDelete,
  onExtend,
  onOpen,
}: {
  listing: ProviderListing;
  onPublish: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExtend: (mode: 'extend_time' | 'add_quantity' | 'both') => void;
  onOpen: () => void;
}) {
  const statusMeta = STATUS_META[listing.status] ?? { label: listing.status, cls: 'bg-neutral-100 text-neutral-600' };
  const remaining = Number(listing.quantityRemaining);
  const total = Number(listing.quantityTotal);
  const unit = UNIT_LABEL[listing.quantityUnit as QuantityUnit] || 'suất';
  const isExpiringSoon = new Date(listing.pickupEndTime).getTime() - Date.now() < 4 * 60 * 60 * 1000;
  const isExtendable = listing.status === 'active' || listing.status === 'fully_reserved';
  const isOutOfStock = listing.status === 'fully_reserved';

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex items-start gap-3 p-3 rounded-2xl border border-neutral-100 hover:border-[#236c2a]/30 hover:bg-neutral-50 transition-all cursor-pointer"
    >
      <div className="w-14 h-14 rounded-xl bg-neutral-100 shrink-0 flex items-center justify-center overflow-hidden">
        {listing.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <SafeImage src={listing.imageUrls[0]} alt={listing.title} className="w-full h-full object-cover" />
        ) : (
          <span className="material-symbols-outlined text-[24px] text-neutral-300">bakery_dining</span>
        )}
      </div>
      <div className="flex-grow min-w-0">
        <div className="flex justify-between items-start gap-2">
          <h4 className="font-bold text-sm text-neutral-900 truncate">{listing.title}</h4>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${statusMeta.cls}`}>
            {statusMeta.label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <div className="flex items-center gap-1 text-neutral-500 text-xs font-normal">
            <span className="material-symbols-outlined text-[14px]">inventory_2</span> {remaining}/{total} {unit}
          </div>
          <div
            className={`flex items-center gap-1 text-xs font-normal ${
              isExpiringSoon ? 'text-amber-600 font-semibold' : 'text-neutral-500'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">schedule</span>{' '}
            {new Date(listing.pickupEndTime).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        {isExtendable && (
          <div
            className="flex gap-1.5 mt-2 flex-wrap"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {isExpiringSoon && (
              <button
                onClick={() => onExtend('extend_time')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-full transition-colors border border-amber-200"
                title="Kéo dài thời gian nhận hàng"
              >
                <span className="material-symbols-outlined text-[12px]">schedule</span>
                Gia hạn giờ
              </button>
            )}
            {isOutOfStock && (
              <button
                onClick={() => onExtend('add_quantity')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-full transition-colors border border-amber-200"
                title="Bổ sung thêm phần ăn để mở bán lại"
              >
                <span className="material-symbols-outlined text-[12px]">add_circle</span>
                Thêm số lượng
              </button>
            )}
            <button
              onClick={() => onExtend('both')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-full transition-colors border border-emerald-200"
              title="Gia hạn giờ và thêm phần ăn cùng lúc"
            >
              <span className="material-symbols-outlined text-[12px]">bolt</span>
              Gia hạn + Thêm SL
            </button>
          </div>
        )}
      </div>
      <div
        className="flex gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {listing.status === 'draft' ? (
          <>
            <button
              onClick={onPublish}
              className="p-2 text-[#236c2a] hover:bg-emerald-50 rounded-lg transition-colors"
              title="Đăng"
            >
              <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Xoá vĩnh viễn bản nháp"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </>
        ) : ['completed', 'expired', 'cancelled'].includes(listing.status) ? (
          <button
            onClick={onDuplicate}
            className="p-2 text-sky-700 hover:bg-sky-50 rounded-lg transition-colors"
            title="Đăng lại"
          >
            <span className="material-symbols-outlined text-[18px]">content_copy</span>
          </button>
        ) : (
          <button
            onClick={onCancel}
            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title="Huỷ"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        )}
      </div>
    </div>
  );
}
