'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { useProviderOrders, useProviderCancelReservation, type ProviderOrderItem } from '@/hooks/useProviderListings';
import { useProviderRequests, type ProviderRequestItem } from '@/hooks/useCampaigns';
import { UNIT_LABEL, mediaUrl, errMsg } from '@/lib/utils';
import { QuantityUnit } from '@foodresq/types';
import CancelReservationModal from '@/components/reservations/CancelReservationModal';
import { ReviewRequestModal } from './_components/ReviewRequestModal';
import ProviderHeaderCard from '@/components/provider/ProviderHeaderCard';

type FilterKey = 'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled';

interface StatusMeta {
  label: string;
  badge: string;
  bar: string;
  group: 'pending' | 'confirmed' | 'completed' | 'cancelled';
}

const STATUS_META: Record<string, StatusMeta> = {
  confirmed: {
    label: 'Đã xác nhận',
    badge: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-400',
    group: 'confirmed',
  },
  picked_up: {
    label: 'Đã lấy hàng',
    badge: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-400',
    group: 'confirmed',
  },
  in_transit: {
    label: 'Đang giao',
    badge: 'bg-sky-100 text-sky-700',
    bar: 'bg-sky-400',
    group: 'confirmed',
  },
  pending: {
    label: 'Chờ xác nhận',
    badge: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-400',
    group: 'pending',
  },
  completed: {
    label: 'Hoàn thành',
    badge: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-500',
    group: 'completed',
  },
  cancelled: {
    label: 'Đã hủy',
    badge: 'bg-neutral-100 text-neutral-500',
    bar: 'bg-neutral-300',
    group: 'cancelled',
  },
  expired: {
    label: 'Hết hạn',
    badge: 'bg-neutral-100 text-neutral-500',
    bar: 'bg-neutral-300',
    group: 'cancelled',
  },
  no_show: {
    label: 'Không đến',
    badge: 'bg-rose-100 text-rose-700',
    bar: 'bg-rose-400',
    group: 'cancelled',
  },
};

const FALLBACK_IMAGE: Record<string, string> = {
  bakery: '/food_bread.png',
  cooked_meal: '/food_lunchbox.png',
  fresh_fruit: '/food_salad.png',
  vegetables: '/food_salad.png',
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ xử lý' },
  { key: 'confirmed', label: 'Đã xác nhận' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã hủy' },
];

function formatWeight(item: ProviderOrderItem): string {
  if (item.listing.weightPerUnitKg) {
    return `${(Number(item.quantity) * Number(item.listing.weightPerUnitKg)).toFixed(1)}kg`;
  }
  return `${item.quantity} ${UNIT_LABEL[item.listing.quantityUnit as QuantityUnit] ?? item.listing.quantityUnit}`;
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

function getStatus(item: ProviderOrderItem): StatusMeta {
  return STATUS_META[item.status] ?? {
    label: item.status,
    badge: 'bg-neutral-100 text-neutral-500',
    bar: 'bg-neutral-300',
    group: 'pending',
  };
}

function statusGroup(item: ProviderOrderItem): StatusMeta['group'] {
  return getStatus(item).group;
}

function receiverInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export default function ProviderOrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useProviderOrders(page);
  const items = (data?.items ?? []) as ProviderOrderItem[];

  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [cancelling, setCancelling] = useState<ProviderOrderItem | null>(null);
  const providerCancel = useProviderCancelReservation();

  // ─── Charity cooperation requests ─────────────────────────────────────
  const requestsQuery = useProviderRequests();
  const requests = (requestsQuery.data ?? []) as ProviderRequestItem[];
  const pendingRequests = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests]);
  const acceptedRequests = useMemo(() => requests.filter((r) => r.status === 'accepted'), [requests]);
  const [requestDrawerOpen, setRequestDrawerOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ProviderRequestItem | null>(null);

  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: items.length,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const item of items) c[statusGroup(item)] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchGroup = filter === 'all' || statusGroup(item) === filter;
      if (!matchGroup) return false;
      if (!q) return true;
      return (
        item.listing.title.toLowerCase().includes(q) ||
        item.receiver.user.fullName.toLowerCase().includes(q) ||
        (item.receiver.user.phone ?? '').toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  const isLoadingList = isLoading && items.length === 0;

  return (
    <div className="flex-1 min-w-0 bg-[#FAFBF9]">
      <div className="max-w-6xl mx-auto px-4 md:px-8 lg:px-10 py-6 md:py-10 space-y-6">
        {/* Header — đồng bộ với các trang provider khác */}
        <ProviderHeaderCard
          eyebrow="Lịch sử"
          title="Theo dõi đơn"
          description={`Tổng cộng ${total} đơn từ người nhận`}
          cta={
            <>
              <button
                onClick={() => setRequestDrawerOpen(true)}
                className="relative self-start md:self-auto flex items-center gap-2 px-4 py-2.5 bg-white rounded-full border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-700 transition-colors shadow-sm"
              >
                <Bell className="h-4 w-4" />
                Yêu cầu từ bếp ăn
                {pendingRequests.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold bg-rose-500 text-white">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => refetch()}
                className="self-start md:self-auto flex items-center gap-2 px-4 py-2.5 bg-white rounded-full border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-700 transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                Làm mới
              </button>
            </>
          }
        />

        {/* Drawer: yêu cầu hợp tác từ charity */}
        {requestDrawerOpen && (
          <div
            className="fixed inset-0 z-[105] flex justify-end bg-black/40 backdrop-blur-sm"
            onClick={() => setRequestDrawerOpen(false)}
          >
            <aside
              className="h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                <div>
                  <h2 className="font-bold text-neutral-800">Yêu cầu hợp tác</h2>
                  <p className="text-xs text-neutral-500">
                    Tổ chức từ thiện mời bạn cung cấp thực phẩm cho chiến dịch bếp ăn.
                  </p>
                </div>
                <button
                  onClick={() => setRequestDrawerOpen(false)}
                  className="h-9 w-9 rounded-lg hover:bg-neutral-100 grid place-items-center"
                  aria-label="Đóng"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {requestsQuery.isLoading && (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-24 rounded-xl bg-neutral-50 animate-pulse" />
                    ))}
                  </div>
                )}

                {!requestsQuery.isLoading && requests.length === 0 && (
                  <div className="py-12 text-center text-sm text-neutral-500">
                    Chưa có yêu cầu nào.
                  </div>
                )}

                {pendingRequests.length > 0 && (
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 mb-2">
                      Chờ duyệt ({pendingRequests.length})
                    </p>
                    <div className="space-y-2">
                      {pendingRequests.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => setReviewTarget(r)}
                          className="w-full text-left rounded-xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50 px-4 py-3 transition-colors"
                        >
                          <p className="font-semibold text-sm text-neutral-800">
                            {r.campaign?.title ?? 'Chiến dịch'}
                          </p>
                          <p className="text-xs text-neutral-600 mt-0.5">
                            Tổ chức: {r.receiver.organizationName || r.receiver.user.fullName}
                          </p>
                          {r.campaign?.scheduledDate && (
                            <p className="text-xs text-neutral-500 mt-0.5">
                              Ngày: {r.campaign.scheduledDate.slice(0, 10)}
                            </p>
                          )}
                          {r.message && (
                            <p className="text-xs text-neutral-500 italic mt-1 line-clamp-2">
                              "{r.message}"
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {acceptedRequests.length > 0 && (
                  <section className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">
                      Đã đồng ý ({acceptedRequests.length})
                    </p>
                    <div className="space-y-2">
                      {acceptedRequests.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3"
                        >
                          <p className="font-semibold text-sm text-neutral-800">
                            {r.campaign?.title ?? 'Chiến dịch'}
                          </p>
                          <p className="text-xs text-neutral-600 mt-0.5">
                            Tổ chức: {r.receiver.organizationName || r.receiver.user.fullName}
                          </p>
                          {r.pickupStartTime && (
                            <p className="text-xs text-neutral-700 mt-1">
                              ⏰ TNV đến lấy lúc{' '}
                              <strong>{r.pickupStartTime}</strong>
                              {r.pickupEndTime ? `–${r.pickupEndTime}` : ''}
                            </p>
                          )}
                          {r.needsTransport && (
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">
                              <span className="material-symbols-outlined text-[13px]">local_shipping</span>
                              Đang tìm TNV giao
                            </span>
                          )}
                          {r.transport?.status && (
                            <p className="text-xs text-neutral-500 mt-1">
                              Vận chuyển: {r.transport.status}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </aside>
          </div>
        )}

        {reviewTarget && (
          <ReviewRequestModal
            req={reviewTarget}
            onClose={() => setReviewTarget(null)}
            onSuccess={() => {
              void requestsQuery.refetch();
              toast.success('Đã cập nhật trạng thái.');
            }}
          />
        )}

        {/* Stats */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard icon="inventory_2" label="Tổng đơn" value={counts.all} tone="sage" />
          <StatCard icon="hourglass_top" label="Chờ xử lý" value={counts.pending} tone="amber" />
          <StatCard icon="local_shipping" label="Đang giao / đã nhận" value={counts.confirmed} tone="sky" />
          <StatCard icon="task_alt" label="Hoàn thành" value={counts.completed} tone="emerald" />
        </section>

        {/* Tabs + search */}
        <section className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
          <div className="border-b border-neutral-100 overflow-x-auto">
            <div className="flex items-center min-w-max">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => {
                      setFilter(f.key);
                      setPage(1);
                    }}
                    className={`relative px-5 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
                      active ? 'text-[#236c2a]' : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {f.label}
                    <span
                      className={`ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
                        active ? 'bg-[#236c2a] text-white' : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {counts[f.key]}
                    </span>
                    {active && <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-[#236c2a]" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 md:p-5 border-b border-neutral-100">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[18px]">
                search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên món, người nhận, SĐT hoặc mã đơn…"
                className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#236c2a]/20 focus:border-[#236c2a] transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="p-4 md:p-5 space-y-3">
            {isError && (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-rose-500 text-[36px]">wifi_off</span>
                </div>
                <p className="font-bold text-neutral-700 mt-3">Không tải được lịch sử từ máy chủ</p>
                <button
                  onClick={() => refetch()}
                  className="mt-3 px-5 py-2 bg-[#236c2a] text-white rounded-xl text-sm font-medium hover:bg-[#1a4f1f]"
                >
                  Thử lại
                </button>
              </div>
            )}

            {!isError && isLoadingList &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 bg-neutral-50 animate-pulse rounded-2xl border border-neutral-100" />
              ))}

            {!isError && !isLoadingList && filtered.length === 0 && (
              <div className="py-10 flex flex-col items-center gap-2 text-center">
                <div className="w-16 h-16 rounded-full bg-neutral-50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-neutral-300 text-[36px]">receipt_long</span>
                </div>
                <p className="font-bold text-sm text-neutral-600">Chưa có đơn nào</p>
                <p className="text-xs text-neutral-500 font-normal">
                  {search
                    ? 'Không tìm thấy đơn phù hợp với bộ lọc hiện tại.'
                    : 'Khi người dùng nhận thực phẩm của bạn, đơn sẽ hiện ở đây.'}
                </p>
              </div>
            )}

            {!isError && filtered.map((item) => (
              <OrderCard
                key={item.id}
                item={item}
                onCancelRequest={() => setCancelling(item)}
              />
            ))}
          </div>

          {/* Modal huỷ đơn của người nhận (provider-initiated) */}
          {cancelling && (
            <CancelReservationModal
              mode="provider"
              reservationId={cancelling.id}
              listingTitle={cancelling.listing.title}
              receiverName={cancelling.receiver.user.fullName}
              quantityLabel={formatWeight(cancelling)}
              isPending={providerCancel.isPending}
              onConfirm={async (reason) => {
                // Modal gọi `void onConfirm(...)` nên lỗi không được bắt ở đó — phải
                // bắt tại đây, nếu không huỷ thất bại sẽ im lặng hoàn toàn và modal
                // cứ đứng yên khiến người dùng tưởng hệ thống treo.
                try {
                  await providerCancel.mutateAsync({ id: cancelling.id, reason });
                  toast.success('Đã huỷ đơn và hoàn số lượng cho tin đăng.');
                  setCancelling(null);
                } catch (e) {
                  toast.error(errMsg(e, 'Huỷ đơn thất bại. Vui lòng thử lại.'));
                }
              }}
              onClose={() => setCancelling(null)}
            />
          )}

          {/* Pagination */}
          {totalPages > 1 && !isError && (
            <div className="border-t border-neutral-100 px-4 md:px-5 py-4 flex justify-center items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors bg-white"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                      p === page
                        ? 'bg-[#236c2a] text-white'
                        : 'text-neutral-600 hover:bg-neutral-100 bg-white border border-neutral-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors bg-white"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
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
    <div className="bg-white p-4 md:p-5 rounded-2xl border border-neutral-150 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-10 h-10 rounded-xl ${t.bg} ${t.text} flex items-center justify-center`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">{label}</p>
      <p className="text-2xl md:text-3xl font-extrabold text-neutral-900 mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function OrderCard({
  item,
  onCancelRequest,
}: {
  item: ProviderOrderItem;
  onCancelRequest: () => void;
}) {
  const meta = getStatus(item);
  const phone = item.receiver.user.phone ?? '—';
  const avatarUrl = item.receiver.user.avatarUrl;
  const fullName = item.receiver.user.fullName;
  const code = item.id.slice(0, 8).toUpperCase();
  const image = item.listing.imageUrls[0] ? mediaUrl(item.listing.imageUrls[0]) : FALLBACK_IMAGE[item.listing.category] || '/food_salad.png';
  const qty = formatWeight(item);
  const canProviderCancel = meta.group === 'confirmed' || meta.group === 'pending';

  return (
    <div className="relative bg-white rounded-2xl border border-neutral-100 hover:border-[#236c2a]/30 hover:shadow-md transition-all overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${meta.bar}`} />

      <div className="flex flex-col md:flex-row gap-4 p-4 md:p-5 pl-5 md:pl-6">
        {/* Receiver */}
        <div className="flex items-center gap-3 md:w-56 shrink-0">
          <div className="w-12 h-12 rounded-full bg-[#efe8d8] flex items-center justify-center text-[#236c2a] font-bold text-base shrink-0 overflow-hidden">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              receiverInitial(fullName)
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-neutral-800 text-sm truncate">{fullName}</p>
            <p className="text-xs text-neutral-500 font-normal truncate">{phone}</p>
          </div>
        </div>

        {/* Item + times */}
        <div className="flex-1 min-w-0 flex items-start gap-3">
          <div className="w-14 h-14 rounded-xl bg-neutral-100 shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={item.listing.title} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-neutral-800 text-sm truncate">{item.listing.title}</p>
            <p className="text-xs text-neutral-500 font-normal mt-0.5">
              Mã <span className="font-mono text-neutral-700">#{code}</span> · {qty}
            </p>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-neutral-500 font-normal">
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                Đặt: {formatDateTime(item.createdAt)}
              </span>
              <span className="hidden md:inline text-neutral-300">•</span>
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">event_upcoming</span>
                Hạn: {formatDate(item.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Status + actions */}
        <div className="flex flex-col items-stretch md:items-end gap-2 md:w-44 shrink-0">
          <span className={`self-start md:self-end px-2.5 py-1 rounded-full text-[11px] font-semibold ${meta.badge}`}>
            {meta.label}
          </span>
          <div className="flex gap-1.5 mt-auto">
            <button
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-xs font-medium text-neutral-700 transition-colors"
              title="Xem chi tiết"
            >
              <span className="material-symbols-outlined text-[14px]">visibility</span>
              Chi tiết
            </button>
            {meta.group === 'pending' && (
              <button className="flex-1 md:flex-none inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-[#236c2a] hover:bg-[#1a4f1f] text-white text-xs font-medium transition-colors">
                <span className="material-symbols-outlined text-[14px]">check</span>
                Duyệt
              </button>
            )}
            {meta.group === 'confirmed' && (
              <Link
                href="/provider/scan"
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-[#236c2a] hover:bg-[#1a4f1f] text-white text-xs font-medium transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">qr_code_scanner</span>
                Quét QR
              </Link>
            )}
            {canProviderCancel && (
              <button
                onClick={onCancelRequest}
                title="Huỷ đơn này (không phạt điểm người nhận)"
                className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-medium transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">block</span>
                Huỷ đơn
              </button>
            )}
            {meta.group === 'cancelled' && (
              <button className="flex-1 md:flex-none inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-xs font-medium text-neutral-700 transition-colors">
                <span className="material-symbols-outlined text-[14px]">refresh</span>
                Đăng lại
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
