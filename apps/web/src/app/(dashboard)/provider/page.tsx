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
import { mediaUrl, UNIT_LABEL } from '@/lib/utils';
import BulkRunRequests from '@/components/deliveries/BulkRunRequests';
import ExtendListingModal from '@/components/listings/ExtendListingModal';
import ProviderRequestsSection from '@/components/campaigns/ProviderRequestsSection';
import ProviderHeaderCard from '@/components/provider/ProviderHeaderCard';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'NhÃ¡p', cls: 'bg-neutral-100 text-neutral-600' },
  active: { label: 'Äang má»Ÿ', cls: 'bg-emerald-100 text-emerald-800' },
  fully_reserved: { label: 'Háº¿t suáº¥t', cls: 'bg-amber-100 text-amber-800' },
  completed: { label: 'HoÃ n táº¥t', cls: 'bg-blue-100 text-blue-800' },
  expired: { label: 'Háº¿t háº¡n', cls: 'bg-neutral-100 text-neutral-500' },
  cancelled: { label: 'ÄÃ£ huá»·', cls: 'bg-rose-100 text-rose-700' },
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
  const providerAddress = providerProfile?.address?.trim() || 'ChÆ°a cáº­p nháº­t Ä‘á»‹a chá»‰';

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
    try { await publishListing.mutateAsync(id); toast.success('ÄÃ£ Ä‘Äƒng tin'); }
    catch { toast.error('ÄÄƒng tin tháº¥t báº¡i'); }
  }

  async function handleCancel(id: string) {
    try { await cancelListing.mutateAsync({ id }); toast.info('ÄÃ£ huá»· tin'); }
    catch { toast.error('Huá»· tháº¥t báº¡i'); }
  }

  async function handleDuplicate(id: string) {
    try { await duplicateListing.mutateAsync(id); toast.success('ÄÃ£ táº¡o báº£n nhÃ¡p má»›i'); }
    catch { toast.error('NhÃ¢n báº£n tháº¥t báº¡i'); }
  }

  return (
    <div className="flex-1 min-w-0 bg-mesh-brand">
      <div className="max-w-6xl mx-auto px-4 md:px-8 lg:px-10 py-6 md:py-10 space-y-6">
        {/* Page header â€” dÃ¹ng component dÃ¹ng chung Ä‘á»ƒ Ä‘á»“ng bá»™ vá»›i create/scan/orders */}
        <ProviderHeaderCard
          eyebrow="Quáº£n lÃ½ cá»­a hÃ ng"
          title={providerProfile?.businessName ?? 'Cá»­a hÃ ng cá»§a tÃ´i'}
          description={
            providerVerified
              ? `Tráº¡ng thÃ¡i: Ä‘Ã£ xÃ¡c minh Â· ${providerAddress}`
              : 'TÃ i khoáº£n Ä‘ang chá» xÃ¡c minh â€” vui lÃ²ng hoÃ n táº¥t há»“ sÆ¡ Ä‘á»ƒ Ä‘Äƒng bÃ i.'
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
                {providerVerified ? 'ÄÃ£ duyá»‡t' : providerProfile?.verificationStatus ?? 'ChÆ°a duyá»‡t'}
              </span>
              {stats?.completionRate != null && (
                <span className="inline-flex items-center gap-1 text-neutral-500 font-normal">
                  <span className="material-symbols-outlined text-[14px] text-emerald-700">star</span>
                  {stats.completionRate}% hoÃ n thÃ nh
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-neutral-500 font-normal">
                <span className="material-symbols-outlined text-[14px] text-emerald-700">history</span>
                Tham gia tá»« {me?.createdAt ? new Date(me.createdAt).toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' }) : 'nay'}
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
                Táº¡o bÃ i Ä‘Äƒng
              </Link>
              <Link
                href="/profile"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                Sá»­a cá»­a hÃ ng
              </Link>
            </>
          }
        />

        {/* Metric Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MetricCard icon="eco" label="Thá»±c pháº©m Ä‘Ã£ cá»©u" value={`${esg?.kgRescued ?? 0}`} unit="kg" tone="sage" />
          <MetricCard icon="cloud_done" label="COâ‚‚ giáº£m thiá»ƒu" value={`${esg?.co2SavedKg ?? 0}`} unit="táº¥n" tone="sky" />
          <MetricCard icon="restaurant" label="Suáº¥t Äƒn chia sáº»" value={`${esg?.mealsServed ?? 0}`} unit="suáº¥t" tone="amber" />
          <MetricCard icon="volunteer_activism" label="NgÆ°á»i Ä‘Æ°á»£c giÃºp" value={`${esg?.peopleHelped ?? 0}`} unit="ngÆ°á»i" tone="emerald" />
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
                  Chá»‰ sá»‘ tin cáº­y
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
                  Thá»© háº¡ng cá»§a báº¡n cao hÆ¡n 85% cá»­a hÃ ng cÃ¹ng khu vá»±c.
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
                  Hoáº¡t Ä‘á»™ng gáº§n Ä‘Ã¢y
                </h3>
                <Link
                  href="/provider/orders"
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
                >
                  Táº¥t cáº£
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              </div>
              <div className="space-y-4">
                <ActivityItem
                  icon="local_mall"
                  iconColor="emerald"
                  title="ÄÆ¡n hÃ ng #ORD-4592 Ä‘Ã£ Ä‘Æ°á»£c nháº­n"
                  time="10 phÃºt trÆ°á»›c"
                />
                <ActivityItem
                  icon="post_add"
                  iconColor="sky"
                  title="Báº¡n Ä‘Ã£ táº¡o bÃ i Ä‘Äƒng má»›i"
                  time="2 giá» trÆ°á»›c"
                />
                <ActivityItem
                  icon="reviews"
                  iconColor="amber"
                  title="ÄÃ¡nh giÃ¡ 5 sao tá»« Há»™i Tá»« Thiá»‡n"
                  time="HÃ´m qua"
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
                  BÃ i Ä‘Äƒng hiá»‡n táº¡i
                </h3>
                <p className="text-xs text-neutral-500 font-normal mt-0.5">
                  {filteredListings.length} máº·t hÃ ng Ä‘ang Ä‘Æ°á»£c chia sáº»
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
                        { { open: 'Äang má»Ÿ', draft: 'NhÃ¡p', all: 'Táº¥t cáº£', closed: 'ÄÃ£ Ä‘Ã³ng' }[filter] }
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
                    <p className="mt-3 font-bold text-sm text-neutral-600">ChÆ°a cÃ³ bÃ i Ä‘Äƒng nÃ o</p>
                    <p className="text-xs text-neutral-500 font-normal mt-1">Báº¥m nÃºt bÃªn dÆ°á»›i Ä‘á»ƒ táº¡o bÃ i Ä‘Äƒng Ä‘áº§u tiÃªn.</p>
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
                      onExtend={(mode) => setExtendTarget({ listing, mode })}
                    />
                  ))}

                <button
                  onClick={openCreate}
                  disabled={!providerVerified}
                  className="w-full py-3 border-2 border-dashed border-neutral-300 rounded-2xl text-neutral-500 hover:border-[#236c2a] hover:text-[#236c2a] transition-colors flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  Táº¡o bÃ i Ä‘Äƒng má»›i
                </button>
              </div>
            </section>
          </div>
        </div>

        <BulkRunRequests />

        {/* YÃªu cáº§u há»£p tÃ¡c tá»« charity */}
        <section className="bg-white rounded-2xl border border-neutral-150 shadow-sm overflow-hidden">
          <header className="px-5 py-4 border-b border-neutral-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500 text-[20px]">storefront</span>
            <h3 className="font-bold text-sm text-neutral-900">YÃªu cáº§u há»£p tÃ¡c tá»« tá»• chá»©c</h3>
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
  onExtend,
}: {
  listing: ProviderListing;
  onPublish: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onExtend: (mode: 'extend_time' | 'add_quantity' | 'both') => void;
}) {
  const statusMeta = STATUS_META[listing.status] ?? { label: listing.status, cls: 'bg-neutral-100 text-neutral-600' };
  const remaining = Number(listing.quantityRemaining);
  const total = Number(listing.quantityTotal);
  const unit = UNIT_LABEL[listing.quantityUnit as QuantityUnit] || 'suáº¥t';
  const isExpiringSoon = new Date(listing.pickupEndTime).getTime() - Date.now() < 4 * 60 * 60 * 1000;
  const isExtendable = listing.status === 'active' || listing.status === 'fully_reserved';
  const isOutOfStock = listing.status === 'fully_reserved';

  return (
    <div className="flex items-start gap-3 p-3 rounded-2xl border border-neutral-100 hover:border-[#236c2a]/30 hover:bg-neutral-50 transition-all">
      <div className="w-14 h-14 rounded-xl bg-neutral-100 shrink-0 flex items-center justify-center overflow-hidden">
        {listing.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(listing.imageUrls[0])} alt={listing.title} className="w-full h-full object-cover" />
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
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {isExpiringSoon && (
              <button
                onClick={() => onExtend('extend_time')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-full transition-colors border border-amber-200"
                title="KÃ©o dÃ i thá»i gian nháº­n hÃ ng"
              >
                <span className="material-symbols-outlined text-[12px]">schedule</span>
                Gia háº¡n giá»
              </button>
            )}
            {isOutOfStock && (
              <button
                onClick={() => onExtend('add_quantity')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-full transition-colors border border-amber-200"
                title="Bá»• sung thÃªm pháº§n Äƒn Ä‘á»ƒ má»Ÿ bÃ¡n láº¡i"
              >
                <span className="material-symbols-outlined text-[12px]">add_circle</span>
                ThÃªm sá»‘ lÆ°á»£ng
              </button>
            )}
            <button
              onClick={() => onExtend('both')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-full transition-colors border border-emerald-200"
              title="Gia háº¡n giá» vÃ  thÃªm pháº§n Äƒn cÃ¹ng lÃºc"
            >
              <span className="material-symbols-outlined text-[12px]">bolt</span>
              Gia háº¡n + ThÃªm SL
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {listing.status === 'draft' ? (
          <button
            onClick={onPublish}
            className="p-2 text-[#236c2a] hover:bg-emerald-50 rounded-lg transition-colors"
            title="ÄÄƒng"
          >
            <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
          </button>
        ) : ['completed', 'expired', 'cancelled'].includes(listing.status) ? (
          <button
            onClick={onDuplicate}
            className="p-2 text-sky-700 hover:bg-sky-50 rounded-lg transition-colors"
            title="ÄÄƒng láº¡i"
          >
            <span className="material-symbols-outlined text-[18px]">content_copy</span>
          </button>
        ) : (
          <button
            onClick={onCancel}
            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title="Huá»·"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        )}
      </div>
    </div>
  );
}
