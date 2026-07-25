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

  const providerProfile = me?.provider ?? null;
  const providerVerified = providerProfile?.verificationStatus === 'approved';
  const providerAddress = providerProfile?.address?.trim() || 'Chưa cập nhật địa chỉ';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [extendTarget, setExtendTarget] = useState<{ listing: ProviderListing; mode: 'extend_time' | 'add_quantity' | 'both' } | null>(null);

  const listings = (data?.items ?? []) as ProviderListing[];
  const filteredListings = listings.filter((l) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'open'
        ? l.status === 'active' || l.status === 'fully_reserved'
        : statusFilter === 'draft'
        ? l.status === 'draft'
        : ['completed', 'expired', 'cancelled'].includes(l.status));
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Store Info Header Card */}
      <section className="bg-white rounded-2xl p-6 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-5 w-full lg:w-auto">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-[#efe8d8] flex items-center justify-center overflow-hidden">
              {me?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-[36px] text-[#236c2a]">storefront</span>
              )}
            </div>
            {providerVerified && (
              <div className="absolute -bottom-1 -right-1 bg-[#236c2a] text-white rounded-full p-1">
                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="font-semibold text-lg text-neutral-800">{providerProfile?.businessName ?? 'Cửa hàng của tôi'}</h2>
              {providerVerified ? (
                <span className="bg-[#efe8d8] text-[#236c2a] px-2 py-0.5 rounded-full text-xs font-medium border border-[#236c2a]/20">Đã duyệt</span>
              ) : (
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs font-medium">{providerProfile?.verificationStatus ?? 'Chưa duyệt'}</span>
              )}
            </div>
            <p className="text-neutral-500 text-sm flex items-center gap-1 font-normal">
              <span className="material-symbols-outlined text-[14px]">location_on</span>
              {providerAddress}
            </p>
            <div className="flex gap-4 mt-2 flex-wrap">
              {stats?.completionRate != null && (
                <div className="flex items-center gap-1 text-xs text-neutral-500 font-normal">
                  <span className="material-symbols-outlined text-[12px] text-[#236c2a]">star</span> {stats.completionRate}% hoàn thành
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-neutral-500 font-normal">
                <span className="material-symbols-outlined text-[12px] text-[#236c2a]">history</span> Tham gia từ {me?.createdAt ? new Date(me.createdAt).toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' }) : 'nay'}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full lg:w-auto">
          <Link href="/provider/create"
            className={`flex-1 lg:flex-none bg-[#236c2a] hover:bg-[#1a4f1f] text-white px-6 py-2.5 rounded-full transition-colors flex items-center justify-center gap-2 text-sm font-medium shadow-sm ${providerVerified ? '' : 'pointer-events-none opacity-50'}`}>
            <span className="material-symbols-outlined text-sm">add</span> Tạo bài đăng
          </Link>
          <Link href="/profile"
            className="flex-1 lg:flex-none bg-neutral-100 text-neutral-700 px-6 py-2.5 rounded-full hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 text-sm font-medium">
            <span className="material-symbols-outlined text-sm">edit</span> Sửa cửa hàng
          </Link>
        </div>
      </section>

      {/* Metric Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon="eco" label="Thực phẩm đã cứu" value={`${esg?.kgRescued ?? 0}`} unit="kg" trend="+12%" />
        <MetricCard icon="cloud_done" label="CO₂ giảm thiểu" value={`${esg?.co2SavedKg ?? 0}`} unit="tấn" trend="+8.4%" />
        <MetricCard icon="restaurant" label="Suất ăn chia sẻ" value={`${esg?.mealsServed ?? 0}`} unit="suất" trend="+15%" />
        <MetricCard icon="volunteer_activism" label="Người được giúp" value={`${esg?.peopleHelped ?? 0}`} unit="người" trend="+5%" />
      </section>

      {/* Main Dashboard Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
          <div className="lg:col-span-1 space-y-6">
          {/* Quick Stats Card */}
          <section className="bg-[#d8ebde] p-5 rounded-2xl relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="text-[#236c2a] font-medium text-base mb-2">Chỉ số tin cậy</h4>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-3 w-28 bg-[#236c2a]/20 rounded-full overflow-hidden">
                  <div className="h-full bg-[#236c2a] rounded-full transition-all" style={{ width: `${stats?.completionRate ?? 0}%` }}></div>
                </div>
                <span className="text-[#236c2a] font-medium text-sm">{stats?.completionRate ?? 0}%</span>
              </div>
              <p className="text-[#236c2a]/80 text-sm font-normal">Thứ hạng của bạn cao hơn 85% cửa hàng cùng khu vực.</p>
            </div>
            <span className="material-symbols-outlined absolute -bottom-3 -right-3 text-[80px] text-[#236c2a]/10 rotate-12">verified</span>
          </section>

          {/* Recent Activity */}
          <section className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-neutral-800">Hoạt động gần đây</h3>
              <Link href="/provider/orders" className="text-[#236c2a] text-sm font-semibold hover:underline">Tất cả</Link>
            </div>
            <div className="space-y-4">
              <ActivityItem icon="local_mall" iconColor="emerald" title='Đơn hàng #ORD-4592 đã được nhận' time="10 phút trước" />
              <ActivityItem icon="post_add" iconColor="blue" title='Bạn đã tạo bài đăng mới' time="2 giờ trước" />
              <ActivityItem icon="reviews" iconColor="amber" title='Đánh giá 5 sao từ Hội Từ Thiện' time="Hôm qua" />
            </div>
          </section>
        </div>

        {/* Right Column - Current Postings */}
        <div className="lg:col-span-2">
          <section className="bg-white rounded-2xl p-5 h-full shadow-sm">
            <div className="flex justify-between items-start gap-4 mb-4">
              <div>
                <h3 className="font-medium text-neutral-800">Bài đăng hiện tại</h3>
                <p className="text-neutral-500 text-sm font-normal">{filteredListings.length} mặt hàng đang được chia sẻ</p>
              </div>
            </div>

            {/* Status Filters */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {(['open', 'draft', 'all', 'closed'] as StatusFilter[]).map((filter) => (
                <button key={filter} onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === filter ? 'bg-[#236c2a] text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
                  {{ open: 'Đang mở', draft: 'Nháp', all: 'Tất cả', closed: 'Đã đóng' }[filter]}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {isLoading && Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-20 bg-neutral-100 animate-pulse rounded-xl" />
              ))}

              {!isLoading && filteredListings.length === 0 && (
                <div className="text-center py-10">
                  <span className="material-symbols-outlined text-neutral-300 text-[40px]">inventory_2</span>
                  <p className="mt-2 text-neutral-500 font-semibold">Chưa có bài đăng nào</p>
                </div>
              )}

              {!isLoading && filteredListings.map((listing) => (
                <PostingItem key={listing.id} listing={listing}
                  onPublish={() => handlePublish(listing.id)}
                  onCancel={() => handleCancel(listing.id)}
                  onDuplicate={() => handleDuplicate(listing.id)}
                  onExtend={(mode) => setExtendTarget({ listing, mode })}
                />
              ))}

              <button onClick={openCreate} disabled={!providerVerified}
                className="w-full py-3 border-2 border-dashed border-neutral-300 rounded-xl text-neutral-500 hover:border-[#236c2a] hover:text-[#236c2a] transition-colors flex items-center justify-center gap-2 text-sm font-medium">
                <span className="material-symbols-outlined text-sm">add_circle</span>
                Tạo bài đăng mới
              </button>
            </div>
          </section>
        </div>
      </div>

      <BulkRunRequests />

      {/* Yêu cầu hợp tác từ charity */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-amber-500 text-xl">storefront</span>
          <h3 className="font-medium text-neutral-800">Yêu cầu hợp tác từ tổ chức</h3>
        </div>
        <ProviderRequestsSection />
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
  );
}

function MetricCard({ icon, label, value, unit, trend }: { icon: string; label: string; value: string; unit: string; trend: string }) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="w-10 h-10 rounded-lg bg-[#efe8d8] flex items-center justify-center">
          <span className="material-symbols-outlined text-lg text-[#236c2a]">{icon}</span>
        </div>
        <div className="flex items-center gap-1 text-[#236c2a] text-xs font-medium">
          <span className="material-symbols-outlined text-[12px]">trending_up</span> {trend}
        </div>
      </div>
      <p className="text-neutral-500 text-xs uppercase tracking-wide font-normal">{label}</p>
      <h3 className="text-2xl font-semibold text-neutral-800 mt-1">{value} <span className="text-sm font-normal text-neutral-500">{unit}</span></h3>
    </div>
  );
}

function ActivityItem({ icon, iconColor, title, time }: { icon: string; iconColor: string; title: string; time: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorMap[iconColor]}`}>
          <span className="material-symbols-outlined text-[14px]">{icon}</span>
        </div>
        <div className="w-px flex-grow bg-neutral-200 my-1"></div>
      </div>
      <div className="pb-3">
        <p className="text-sm text-neutral-700 leading-snug font-normal">{title}</p>
        <p className="text-xs text-neutral-400 mt-0.5 font-normal">{time}</p>
      </div>
    </div>
  );
}

function PostingItem({ listing, onPublish, onCancel, onDuplicate, onExtend }: {
  listing: ProviderListing;
  onPublish: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onExtend: (mode: 'extend_time' | 'add_quantity' | 'both') => void;
}) {
  const statusMeta = STATUS_META[listing.status] ?? { label: listing.status, cls: 'bg-neutral-100 text-neutral-600' };
  const remaining = Number(listing.quantityRemaining);
  const total = Number(listing.quantityTotal);
  const unit = UNIT_LABEL[listing.quantityUnit as QuantityUnit] || 'suất';
  const isExpiringSoon = new Date(listing.pickupEndTime).getTime() - Date.now() < 4 * 60 * 60 * 1000;
  const isExtendable = listing.status === 'active' || listing.status === 'fully_reserved';
  const isOutOfStock = listing.status === 'fully_reserved';

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-neutral-50 transition-colors">
      <div className="w-14 h-14 rounded-lg bg-neutral-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
        {listing.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.imageUrls[0]} alt={listing.title} className="w-full h-full object-cover" />
        ) : (
          <span className="material-symbols-outlined text-[24px] text-neutral-300">bakery_dining</span>
        )}
      </div>
      <div className="flex-grow min-w-0">
        <div className="flex justify-between items-start gap-2">
          <h4 className="font-medium text-sm text-neutral-800 truncate">{listing.title}</h4>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${statusMeta.cls}`}>{statusMeta.label}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <div className="flex items-center gap-1 text-neutral-500 text-xs font-normal">
            <span className="material-symbols-outlined text-[12px]">inventory_2</span> {remaining}/{total} {unit}
          </div>
          <div className={`flex items-center gap-1 text-xs font-normal ${isExpiringSoon ? 'text-amber-600 font-semibold' : 'text-neutral-500'}`}>
            <span className="material-symbols-outlined text-[12px]">schedule</span> {new Date(listing.pickupEndTime).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        {isExtendable && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
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
      <div className="flex gap-1 flex-shrink-0">
        {listing.status === 'draft' ? (
          <button onClick={onPublish} className="p-1.5 text-[#236c2a] hover:bg-[#efe8d8] rounded-lg transition-colors" title="Đăng">
            <span className="material-symbols-outlined text-sm">rocket_launch</span>
          </button>
        ) : ['completed', 'expired', 'cancelled'].includes(listing.status) ? (
          <button onClick={onDuplicate} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Đăng lại">
            <span className="material-symbols-outlined text-sm">content_copy</span>
          </button>
        ) : (
          <button onClick={onCancel} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Huỷ">
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        )}
      </div>
    </div>
  );
}
