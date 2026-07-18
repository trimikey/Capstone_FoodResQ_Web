'use client';

import { useEffect, useState } from 'react';
import { useProviderOrders, type ProviderOrderItem } from '@/hooks/useProviderListings';
import ProviderHeaderCard from '@/components/provider/ProviderHeaderCard';
import StatCell from '@/components/provider/StatCell';
import DataTable, { type Column } from '@/components/provider/DataTable';
import FilterBar, { type FilterOption } from '@/components/provider/FilterBar';

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

type OrderFilter = 'all' | 'active' | 'done' | 'cancelled';

function formatWeight(item: ProviderOrderItem): string {
  if (item.listing.weightPerUnitKg) {
    return `${(Number(item.quantity) * Number(item.listing.weightPerUnitKg)).toFixed(1)}kg`;
  }
  return `${item.quantity} ${item.listing.quantityUnit}`;
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

export default function ProviderOrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useProviderOrders(page);

  const [items, setItems] = useState<ProviderOrderItem[]>([]);

  useEffect(() => {
    if (!data?.items) return;
    setItems((data.items as ProviderOrderItem[]).sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    ));
  }, [data]);

  const [filter, setFilter] = useState<OrderFilter>('all');

  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;

  const statusCounts = (() => {
    const counts: Record<string, number> = { all: total, active: 0, done: 0, cancelled: 0 };
    for (const item of items) {
      const meta = STATUS_META[item.status];
      if (!meta) continue;
      counts[meta.group] = (counts[meta.group] || 0) + 1;
    }
    return counts;
  })();

  const filtered = items.filter((item) => {
    const meta = STATUS_META[item.status];
    if (!meta) return true;
    if (filter === 'all') return true;
    return meta.group === filter;
  });

  const filterOptions: FilterOption<OrderFilter>[] = [
    { value: 'all',       label: 'Tất cả',         count: statusCounts.all       ?? 0 },
    { value: 'active',    label: 'Đang xử lý',     count: statusCounts.active    ?? 0 },
    { value: 'done',      label: 'Hoàn thành',     count: statusCounts.done      ?? 0 },
    { value: 'cancelled', label: 'Đã huỷ / hết',  count: statusCounts.cancelled ?? 0 },
  ];

  const orderColumns: Column<ProviderOrderItem>[] = [
    {
      key: 'code',
      header: 'Mã đơn',
      width: '120px',
      cell: (i) => <span className="font-mono text-[12px] text-neutral-500">#{i.id.slice(0, 8).toUpperCase()}</span>,
    },
    {
      key: 'item',
      header: 'Thực phẩm',
      cell: (i) => (
        <div className="flex items-center gap-3 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={i.listing.imageUrls[0] || FALLBACK_IMAGE[i.listing.category] || '/food_salad.png'}
            alt={i.listing.title}
            className="w-10 h-10 rounded-lg object-cover bg-neutral-100 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-bold text-neutral-900 truncate">{i.listing.title}</p>
            <p className="text-[11px] text-neutral-500 truncate">{i.listing.pickupAddress}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'receiver',
      header: 'Người nhận',
      cell: (i) => (
        <div className="min-w-0">
          <p className="font-bold text-neutral-800 truncate">{i.receiver.user.fullName}</p>
          {i.receiver.user.phone && <p className="text-[11px] text-neutral-500">{i.receiver.user.phone}</p>}
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Số lượng',
      align: 'right',
      width: '120px',
      cell: (i) => <span className="font-bold text-neutral-800 tabular-nums">{formatWeight(i)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Ngày đặt',
      width: '140px',
      cell: (i) => <span className="text-[12px] text-neutral-600 tabular-nums">{formatDateTime(i.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: '160px',
      cell: (i) => {
        const meta = STATUS_META[i.status] ?? { label: i.status, badge: 'badge-neutral', accent: 'bg-neutral-300', group: 'active' as const };
        return <span className={`badge ${meta.badge}`}>{meta.label}</span>;
      },
    },
  ];

  return (
    <div className="flex-1 min-w-0 bg-mesh-brand">
      <div className="max-w-6xl mx-auto px-4 md:px-8 lg:px-10 py-6 md:py-10 space-y-6">
        <ProviderHeaderCard
          crumbs={[{ href: '/provider', label: 'Cửa hàng' }, { label: 'Đơn hàng' }]}
          eyebrow="Lịch sử"
          title="Đơn nhận thực phẩm"
          description="Tất cả đơn người dùng đã nhận từ cửa hàng của bạn, kèm trạng thái giao nhận và thời gian xử lý."
          meta={
            <p className="text-xs text-neutral-500">
              Tổng cộng <b className="text-neutral-800">{total}</b> đơn · trang {page}/{totalPages}
            </p>
          }
        />

        {isError && (
          <div className="text-center py-12 bg-white rounded-2xl border border-rose-100 shadow-sm">
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <StatCell tone="sage"    icon="inventory_2"    value={statusCounts.all ?? 0}      label="Tổng đơn" />
              <StatCell tone="sky"     icon="hourglass_top"  value={statusCounts.active ?? 0}   label="Đang xử lý" />
              <StatCell tone="sage"    icon="check_circle"   value={statusCounts.done ?? 0}     label="Hoàn thành" />
              <StatCell tone="neutral" icon="cancel"         value={statusCounts.cancelled ?? 0} label="Đã huỷ/hết" />
            </div>

            <FilterBar<OrderFilter>
              value={filter}
              onChange={setFilter}
              options={filterOptions}
            />

            <DataTable<ProviderOrderItem>
              rows={filtered}
              rowKey={(i) => i.id}
              loading={isLoading && items.length === 0}
              columns={orderColumns}
              empty={
                <div className="py-6 flex flex-col items-center gap-2 text-neutral-450">
                  <span className="material-symbols-outlined text-[44px] text-neutral-250">receipt_long</span>
                  <p className="font-extrabold text-sm text-neutral-600">Chưa có đơn hàng nào</p>
                  <p className="text-xs">Khi người dùng nhận thực phẩm của bạn, đơn sẽ hiện ở đây.</p>
                </div>
              }
            />

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors bg-white"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-10 h-10 rounded-full text-sm font-bold transition-colors ${
                        p === page ? 'bg-emerald-700 text-white' : 'text-neutral-600 hover:bg-neutral-100 bg-white border border-neutral-150'
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
          </>
        )}
      </div>
    </div>
  );
}
