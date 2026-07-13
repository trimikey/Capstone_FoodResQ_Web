'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useProviderOrders, type ProviderOrderItem } from '@/hooks/useProviderListings';
import { useMe } from '@/hooks/useProfile';

interface StatusMeta {
  label: string;
  badge: string;
  accent: string;
  group: 'active' | 'done' | 'cancelled';
}

const STATUS_META: Record<string, StatusMeta> = {
  confirmed:     { label: 'Đã đặt',      badge: 'badge-sky',   accent: 'bg-sky-400',   group: 'active' },
  picked_up:     { label: 'Đã lấy hàng',  badge: 'badge-honey', accent: 'bg-honey-400', group: 'active' },
  completed:     { label: 'Hoàn thành',   badge: 'badge-emerald', accent: 'bg-emerald-500', group: 'done' },
  cancelled:     { label: 'Đã huỷ',      badge: 'badge-neutral', accent: 'bg-neutral-300', group: 'cancelled' },
  expired:       { label: 'Hết hạn',     badge: 'badge-neutral', accent: 'bg-neutral-300', group: 'cancelled' },
  no_show:       { label: 'Không đến',   badge: 'badge-rose',  accent: 'bg-rose-400',  group: 'cancelled' },
};

const FALLBACK_IMAGE: Record<string, string> = {
  bakery: '/food_bread.png',
  cooked_meal: '/food_lunchbox.png',
  fresh_fruit: '/food_salad.png',
  vegetables: '/food_salad.png',
};

function formatWeight(item: ProviderOrderItem): string {
  if (item.listing.weightPerUnitKg) {
    return `${(Number(item.quantity) * Number(item.listing.weightPerUnitKg)).toFixed(1)}kg`;
  }
  return `${item.quantity} ${item.listing.quantityUnit}`;
}

export default function ProviderOrdersPage() {
  const { data: me } = useMe();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useProviderOrders(page);

  const [items, setItems] = useState<ProviderOrderItem[]>([]);

  useEffect(() => {
    if (!data?.items) return;
    setItems((data.items as ProviderOrderItem[]).sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    ));
  }, [data]);

  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'cancelled'>('all');
  const [showFilter, setShowFilter] = useState(false);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const meta = STATUS_META[item.status];
      if (!meta) return true;
      if (filter === 'all') return true;
      return meta.group === filter;
    });
  }, [items, filter]);

  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: total };
    for (const item of items) {
      const meta = STATUS_META[item.status];
      if (!meta) continue;
      counts[meta.group] = (counts[meta.group] || 0) + 1;
    }
    return counts;
  }, [items, total]);

  return (
    <div className="min-h-screen bg-mesh-brand pb-24 relative">
      <div className="max-w-7xl mx-auto px-6 md:px-16 lg:px-24 py-10 space-y-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-gradient elevation-brand flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-white text-[28px]">receipt_long</span>
          </div>
          <div>
            <h1 className="font-headline-lg font-extrabold text-3xl sm:text-4xl text-neutral-900">Lịch sử đơn hàng</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Các đơn nhận thực phẩm từ cửa hàng của bạn.</p>
          </div>
        </div>

        {/* Error */}
        {isError && (
          <div className="text-center py-12 bg-white rounded-3xl border border-rose-100 elevation-1">
            <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 flex items-center justify-center">
              <span className="material-symbols-outlined text-rose-500 text-[36px]">wifi_off</span>
            </div>
            <p className="font-bold text-neutral-700 mt-3">Không tải được lịch sử từ máy chủ</p>
            <button onClick={() => refetch()} className="mt-3 px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700">
              Thử lại
            </button>
          </div>
        )}

        {!isError && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Tổng đơn', value: statusCounts.all ?? 0, icon: 'inventory_2', color: 'from-emerald-600 to-teal-700' },
                { label: 'Đang xử lý', value: statusCounts['active'] ?? 0, icon: 'hourglass_top', color: 'from-sky-500 to-blue-600' },
                { label: 'Hoàn thành', value: statusCounts['done'] ?? 0, icon: 'check_circle', color: 'from-emerald-500 to-green-600' },
                { label: 'Đã huỷ/hết', value: statusCounts['cancelled'] ?? 0, icon: 'cancel', color: 'from-neutral-400 to-neutral-500' },
              ].map((stat) => (
                <div key={stat.label} className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2`}>
                    <span className="material-symbols-outlined text-white text-[18px]">{stat.icon}</span>
                  </div>
                  <p className="text-2xl font-extrabold text-neutral-900">{stat.value}</p>
                  <p className="text-[11px] text-neutral-500 font-bold">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Filter */}
            <div className="relative">
              <button
                onClick={() => setShowFilter(!showFilter)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-neutral-700 hover:bg-neutral-50 transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">filter_list</span>
                {filter === 'all' ? 'Tất cả' : filter === 'active' ? 'Đang xử lý' : filter === 'done' ? 'Hoàn thành' : 'Đã huỷ/hết'}
                <span className="material-symbols-outlined text-[16px] text-neutral-400">keyboard_arrow_down</span>
              </button>
              {showFilter && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowFilter(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-neutral-200 rounded-2xl shadow-xl z-30 py-2">
                    {[
                      ['all', 'Tất cả'],
                      ['active', 'Đang xử lý'],
                      ['done', 'Hoàn thành'],
                      ['cancelled', 'Đã huỷ/hết'],
                    ].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => { setFilter(val as typeof filter); setShowFilter(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors hover:bg-neutral-50 ${
                          filter === val ? 'text-emerald-700 bg-emerald-50' : 'text-neutral-600'
                        }`}
                      >
                        {label} ({statusCounts[val] ?? 0})
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Loading */}
            {isLoading && items.length === 0 && (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-28 rounded-2xl bg-white border border-neutral-200 animate-pulse" />
                ))}
              </div>
            )}

            {/* Empty */}
            {!isLoading && !isError && filtered.length === 0 && (
              <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-neutral-200">
                <div className="w-20 h-20 mx-auto rounded-full bg-brand-gradient-soft flex items-center justify-center">
                  <span className="material-symbols-outlined text-emerald-600 text-[44px]">receipt_long</span>
                </div>
                <h3 className="font-extrabold text-lg text-neutral-800 mt-4">Chưa có đơn hàng nào</h3>
                <p className="text-sm text-neutral-500 mt-1">Khi người dùng nhận thực phẩm của bạn, đơn sẽ hiện ở đây.</p>
              </div>
            )}

            {/* Cards */}
            <div className="space-y-4">
              {filtered.map((item) => {
                const meta = STATUS_META[item.status] || { label: item.status, badge: 'badge-neutral', accent: 'bg-neutral-300', group: 'active' as const };
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-neutral-150 shadow-sm overflow-hidden"
                  >
                    <div className="flex items-center gap-4 p-5">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-neutral-100 shrink-0 ring-1 ring-neutral-150">
                        <img
                          src={item.listing.imageUrls[0] || FALLBACK_IMAGE[item.listing.category] || '/food_salad.png'}
                          alt={item.listing.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-neutral-900 text-base truncate">{item.listing.title}</h3>
                          <span className={`badge ${meta.badge} shrink-0`}>{meta.label}</span>
                        </div>
                        <p className="text-xs text-neutral-500 font-bold mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">person</span>
                          {item.receiver.user.fullName}
                          {item.receiver.user.phone && <span className="text-neutral-400">· {item.receiver.user.phone}</span>}
                        </p>
                        <div className="flex items-center gap-4 text-[11px] text-neutral-500 font-bold mt-1.5">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                            {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">scale</span>
                            {formatWeight(item)}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <span className={`inline-block w-1 h-10 rounded-full ${meta.accent}`} />
                      </div>
                    </div>
                    {item.listing.pickupAddress && (
                      <div className="border-t border-neutral-100 px-5 py-2.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
                        <span className="material-symbols-outlined text-[14px]">place</span>
                        {item.listing.pickupAddress}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-10">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-10 h-10 rounded-full text-sm font-bold transition-colors ${
                        p === page ? 'bg-emerald-600 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
