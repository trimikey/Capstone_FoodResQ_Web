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
  useDeleteDraftListing,
  useProviderStats,
  type ProviderListing,
} from '@/hooks/useProviderListings';
import { useMe } from '@/hooks/useProfile';
import { QuantityUnit } from '@foodresq/types';
import { mediaUrl, UNIT_LABEL, errMsg } from '@/lib/utils';
import { formatVietnamDateTime } from '@/lib/listing-form';
import { Modal } from '@/components/shared/Modal';
import ExtendListingModal from '@/components/listings/ExtendListingModal';
import PendingRequestsBanner from '@/components/provider/PendingRequestsBanner';

const STATUS_META: Record<string, { label: string; badgeCls: string; accentCls: string }> = {
  draft:          { label: 'Nháp',     badgeCls: 'bg-neutral-100 text-neutral-600',                        accentCls: 'border-l-neutral-300' },
  active:         { label: 'Đang mở',  badgeCls: 'bg-emerald-100 text-emerald-800',                        accentCls: 'border-l-emerald-500' },
  fully_reserved: { label: 'Hết suất', badgeCls: 'bg-amber-100 text-amber-800',                            accentCls: 'border-l-amber-400' },
  completed:      { label: 'Hoàn tất', badgeCls: 'bg-blue-100 text-blue-700',                              accentCls: 'border-l-blue-400' },
  expired:        { label: 'Hết hạn',  badgeCls: 'bg-orange-50 text-orange-700 border border-orange-200',  accentCls: 'border-l-orange-400' },
  cancelled:      { label: 'Đã huỷ',   badgeCls: 'bg-rose-50 text-rose-600 border border-rose-200',        accentCls: 'border-l-rose-300' },
};

type StatusFilter = 'all' | 'open' | 'draft' | 'closed';

const FILTER_LABELS: Record<StatusFilter, string> = {
  open: 'Đang mở', draft: 'Nháp', all: 'Tất cả', closed: 'Đã đóng',
};

export default function ProviderDashboardPage() {
  const router = useRouter();
  const { data, isLoading } = useProviderListings();
  const { data: me } = useMe();
  const { data: stats } = useProviderStats();
  const publishListing    = usePublishListing();
  const cancelListing     = useCancelListing();
  const duplicateListing  = useDuplicateListing();
  const deleteDraft       = useDeleteDraftListing();

  const providerProfile  = me?.provider ?? null;
  const providerVerified = providerProfile?.verificationStatus === 'approved';

  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('open');
  const [extendTarget, setExtendTarget]   = useState<{ listing: ProviderListing; mode: 'extend_time' | 'add_quantity' | 'both' } | null>(null);
  const [deletingDraft, setDeletingDraft] = useState<ProviderListing | null>(null);

  const listings = (data?.items ?? []) as ProviderListing[];
  const filteredListings = listings.filter((l) => {
    const now = Date.now();
    const effectivelyExpired =
      (l.status === 'active' || l.status === 'fully_reserved') &&
      new Date(l.pickupEndTime).getTime() < now;
    const displayStatus = effectivelyExpired ? 'expired' : l.status;

    return statusFilter === 'all'
      ? true
      : statusFilter === 'open'
      ? displayStatus === 'active' || displayStatus === 'fully_reserved'
      : statusFilter === 'draft'
      ? displayStatus === 'draft'
      : ['completed', 'expired', 'cancelled'].includes(displayStatus);
  });

  async function handlePublish(id: string) {
    try { await publishListing.mutateAsync(id); toast.success('Đã đăng tin'); }
    catch { toast.error('Đăng tin thất bại'); }
  }

  async function handleCancel(id: string) {
    try { await cancelListing.mutateAsync({ id }); toast.info('Đã huỷ tin'); }
    catch { toast.error('Huỷ thất bại'); }
  }

  async function handleDeleteDraft(id: string) {
    try {
      await deleteDraft.mutateAsync(id);
      toast.success('Đã xoá bản nháp');
      setDeletingDraft(null);
    } catch (e) {
      toast.error(errMsg(e, 'Xoá bản nháp thất bại'));
    }
  }

  async function handleDuplicate(id: string) {
    try { await duplicateListing.mutateAsync(id); toast.success('Đã tạo bản nháp mới'); }
    catch { toast.error('Nhân bản thất bại'); }
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col lg:overflow-hidden bg-mesh-brand">

      {/* ── Compact page header ──────────────────────────────────────── */}
      <header className="shrink-0 bg-white/90 backdrop-blur border-b border-neutral-100 px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#236c2a]/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px] text-[#236c2a]">storefront</span>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-neutral-500 font-normal leading-none mb-0.5">Nhà cung cấp</p>
              <h1 className="font-bold text-sm text-neutral-900 truncate leading-tight">
                {providerProfile?.businessName ?? 'Cửa hàng của tôi'}
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap ml-1">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  providerVerified
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {providerVerified ? 'verified' : 'pending'}
                </span>
                {providerVerified ? 'Đã duyệt' : (providerProfile?.verificationStatus ?? 'Chờ duyệt')}
              </span>
              {me?.createdAt && (
                <span className="hidden sm:inline text-[11px] text-neutral-400 font-normal">
                  Tham gia từ {new Date(me.createdAt).toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0 w-full sm:w-auto">
            <Link
              href="/profile"
              className="min-h-10 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
              Sửa hồ sơ
            </Link>
            <Link
              href="/provider/create"
              className={`min-h-10 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors ${
                providerVerified ? 'bg-[#236c2a] hover:bg-[#1a4f1f]' : 'pointer-events-none bg-neutral-300'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Tạo bài đăng
            </Link>
          </div>
        </div>
      </header>

      {/* ── Stats bar ────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-neutral-100 bg-white/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 grid grid-cols-2 sm:grid-cols-4 divide-x-0 sm:divide-x divide-y sm:divide-y-0 divide-neutral-100">
          <StatTile
            icon="article"
            label="Tổng bài đăng"
            value={stats?.totalListings ?? '—'}
            color="neutral"
          />
          <StatTile
            icon="storefront"
            label="Đang mở"
            value={stats?.activeListings ?? '—'}
            color="emerald"
          />
          <StatTile
            icon="people"
            label="Lượt đặt chỗ"
            value={stats?.totalReservations ?? '—'}
            color="sky"
          />
          <StatTile
            icon="task_alt"
            label="Hoàn tất"
            value={stats?.completionRate != null ? `${stats.completionRate}%` : '—'}
            color="amber"
          />
        </div>
      </div>

      {/* ── Main body ────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex lg:overflow-hidden max-w-6xl mx-auto w-full px-4 sm:px-6 py-4 gap-4">

        {/* Left sidebar — khối "Điều hướng nhanh" đã bỏ (trùng với sidebar chính) */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 gap-3 overflow-y-auto">
          <PendingRequestsBanner />

          {/* Trust indicator */}
          {stats?.completionRate != null && (
            <div className="bg-[#d8ebde] rounded-2xl p-4 border border-[#236c2a]/15">
              <p className="text-[#236c2a] font-bold text-xs flex items-center gap-1 mb-2">
                <span className="material-symbols-outlined text-[14px]">verified</span>
                Chỉ số tin cậy
              </p>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 bg-white/70 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#236c2a] rounded-full transition-all"
                    style={{ width: `${stats.completionRate}%` }}
                  />
                </div>
                <span className="text-[#236c2a] font-bold text-sm tabular-nums">
                  {stats.completionRate}%
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* Listings panel */}
        <section className="flex-1 min-w-0 flex flex-col bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
          {/* Panel header + tabs */}
          <div className="shrink-0 px-5 pt-4 pb-3 border-b border-neutral-100 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-neutral-900 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-700 text-[18px]">inventory_2</span>
                Bài đăng của bạn
              </h2>
              <span className="text-xs text-neutral-400 font-normal">
                {filteredListings.length} bài
              </span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((filter) => {
                const active = statusFilter === filter;
                return (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                      active
                        ? 'bg-[#236c2a] text-white border-[#236c2a]'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:border-[#236c2a]/40 hover:text-[#236c2a]'
                    }`}
                  >
                    {FILTER_LABELS[filter]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable listing list */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 bg-neutral-50 animate-pulse rounded-2xl border border-neutral-100" />
              ))}

            {!isLoading && filteredListings.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
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
                  onDeleteDraft={() => setDeletingDraft(listing)}
                  onExtend={(mode) => setExtendTarget({ listing, mode })}
                  onOpen={() => router.push(`/listings/${listing.id}`)}
                />
              ))}

            {!isLoading && (
              <button
                onClick={() => router.push('/provider/create')}
                disabled={!providerVerified}
                className="w-full py-3 border-2 border-dashed border-neutral-200 rounded-2xl text-neutral-400 hover:border-[#236c2a] hover:text-[#236c2a] transition-colors flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-base">add_circle</span>
                Tạo bài đăng mới
              </button>
            )}
          </div>
        </section>
      </div>

      {extendTarget && (
        <ExtendListingModal
          open
          onClose={() => setExtendTarget(null)}
          listing={extendTarget.listing}
          defaultMode={extendTarget.mode}
        />
      )}

      {deletingDraft && (
        <Modal
          onClose={() => setDeletingDraft(null)}
          closeOnBackdrop={!deleteDraft.isPending}
          className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">delete</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-lg text-neutral-900">Xoá bản nháp?</h3>
              <p className="text-sm text-neutral-500 truncate">{deletingDraft.title}</p>
            </div>
          </div>
          <p className="text-xs text-neutral-600 mt-4 leading-relaxed">
            Bản nháp này chưa từng được đăng nên chưa ai đặt. Xoá xong sẽ không khôi phục lại được.
          </p>
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => setDeletingDraft(null)}
              disabled={deleteDraft.isPending}
              className="flex-1 py-3 bg-white border border-neutral-200 text-neutral-700 rounded-xl font-bold text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              Giữ lại
            </button>
            <button
              onClick={() => void handleDeleteDraft(deletingDraft.id)}
              disabled={deleteDraft.isPending}
              className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm disabled:opacity-50"
            >
              {deleteDraft.isPending ? 'Đang xoá…' : 'Xoá nháp'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatTile({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number | string;
  color: 'neutral' | 'emerald' | 'sky' | 'amber';
}) {
  const colorMap: Record<string, string> = {
    neutral: 'text-neutral-700',
    emerald: 'text-emerald-700',
    sky:     'text-sky-600',
    amber:   'text-amber-600',
  };
  return (
    <div className="flex items-center gap-2.5 px-4 py-2">
      <span className={`material-symbols-outlined text-[20px] shrink-0 ${colorMap[color]}`}>{icon}</span>
      <div className="min-w-0">
        <p className={`font-bold text-base tabular-nums leading-tight ${colorMap[color]}`}>{value}</p>
        <p className="text-[11px] text-neutral-500 font-normal leading-tight truncate">{label}</p>
      </div>
    </div>
  );
}

function PostingItem({
  listing,
  onPublish,
  onCancel,
  onDuplicate,
  onDeleteDraft,
  onExtend,
  onOpen,
}: {
  listing: ProviderListing;
  onPublish: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onDeleteDraft: () => void;
  onExtend: (mode: 'extend_time' | 'add_quantity' | 'both') => void;
  onOpen: () => void;
}) {
  const now = Date.now();
  const isAlreadyExpired =
    (listing.status === 'active' || listing.status === 'fully_reserved') &&
    new Date(listing.pickupEndTime).getTime() < now;
  const effectiveStatus = isAlreadyExpired ? 'expired' : listing.status;

  const statusMeta   = STATUS_META[effectiveStatus] ?? { label: effectiveStatus, badgeCls: 'bg-neutral-100 text-neutral-600', accentCls: 'border-l-neutral-300' };
  const remaining    = Number(listing.quantityRemaining);
  const total        = Number(listing.quantityTotal);
  const unit         = UNIT_LABEL[listing.quantityUnit as QuantityUnit] || 'suất';
  const isExpiringSoon = !isAlreadyExpired && new Date(listing.pickupEndTime).getTime() - now < 4 * 60 * 60 * 1000;
  const isExtendable = effectiveStatus === 'active' || effectiveStatus === 'fully_reserved';
  const isOutOfStock = effectiveStatus === 'fully_reserved';
  const isClosed     = ['completed', 'expired', 'cancelled'].includes(effectiveStatus);

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      className={`flex flex-col min-[420px]:flex-row min-[420px]:items-start gap-3 p-3 rounded-2xl border-l-4 border border-neutral-100 transition-all cursor-pointer ${statusMeta.accentCls} ${
        isClosed ? 'bg-neutral-50/80 hover:bg-neutral-100/50' : 'bg-white hover:border-[#236c2a]/30 hover:bg-neutral-50/70'
      }`}
    >
      <div className="w-full min-[420px]:w-12 h-32 min-[420px]:h-12 rounded-xl bg-neutral-100 shrink-0 flex items-center justify-center overflow-hidden">
        {listing.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(listing.imageUrls[0])} alt={listing.title} className={`w-full h-full object-cover transition-all ${isClosed ? 'grayscale opacity-60' : ''}`} />
        ) : (
          <span className="material-symbols-outlined text-[22px] text-neutral-300">bakery_dining</span>
        )}
      </div>

      <div className="flex-grow min-w-0">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <h4 className={`font-bold text-sm line-clamp-2 min-w-0 ${isClosed ? 'text-neutral-500' : 'text-neutral-900'}`}>{listing.title}</h4>
          <span className={`self-start px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${statusMeta.badgeCls}`}>
            {statusMeta.label}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className={`flex items-center gap-1 text-xs font-normal ${isClosed ? 'text-neutral-400' : 'text-neutral-500'}`}>
            <span className="material-symbols-outlined text-[13px]">inventory_2</span>
            {remaining}/{total} {unit}
          </span>
          <span
            className={`flex items-center gap-1 text-xs font-normal ${
              isAlreadyExpired ? 'text-orange-400 line-through' : isExpiringSoon ? 'text-amber-600 font-semibold' : 'text-neutral-500'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">schedule</span>
            Đến hết{' '}
            {formatVietnamDateTime(listing.pickupEndTime).replace(/\/\d{4} /, ' ')}
          </span>
        </div>

        {isExtendable && (
          <div
            className="flex gap-1.5 mt-1.5 flex-wrap"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {isExpiringSoon && (
              <button
                onClick={() => onExtend('extend_time')}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-full border border-amber-200 transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">schedule</span>
                Gia hạn giờ
              </button>
            )}
            {isOutOfStock && (
              <button
                onClick={() => onExtend('add_quantity')}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-full border border-amber-200 transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">add_circle</span>
                Thêm số lượng
              </button>
            )}
            <button
              onClick={() => onExtend('both')}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-full border border-emerald-200 transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">bolt</span>
              Gia hạn + Thêm SL
            </button>
          </div>
        )}
      </div>

      {/* Action button */}
      <div
        className="flex gap-1 shrink-0 self-end min-[420px]:self-start"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {listing.status === 'draft' ? (
          <>
            <button
              onClick={onPublish}
              className="p-1.5 text-[#236c2a] hover:bg-emerald-50 rounded-lg transition-colors"
              title="Đăng"
            >
              <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
            </button>
            <button
              onClick={onDeleteDraft}
              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
              title="Xoá bản nháp"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </>
        ) : isClosed ? (
          <button
            onClick={onDuplicate}
            className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
            title="Đăng lại"
          >
            <span className="material-symbols-outlined text-[18px]">content_copy</span>
          </button>
        ) : (
          <button
            onClick={onCancel}
            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
            title="Huỷ"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        )}
      </div>
    </div>
  );
}
