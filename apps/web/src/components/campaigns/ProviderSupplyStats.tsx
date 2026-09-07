'use client';

import {
  useProviderSupplyStats,
} from '@/hooks/useCampaigns';
import { AreaChart, DataTable, PairedBars } from '@/components/charts/MiniCharts';

/**
 * Thống kê cung ứng của NHÀ CUNG CẤP — đặt ngay trên hộp thư yêu cầu để cửa hàng
 * thấy mình đã đóng góp gì trước khi xử lý yêu cầu mới.
 *
 * Dạng biểu đồ theo việc của dữ liệu: so "đặt vs thực nhận" từng chiến dịch là cặp
 * thanh ngang (so độ lớn có nhãn dài); diễn biến kg giao theo ngày là biểu đồ núi.
 */
export default function ProviderSupplyStats() {
  const { data: stats, isLoading } = useProviderSupplyStats();

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />;
  }
  if (!stats || stats.totals.orders === 0) return null;

  const dm = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  };

  const tiles = [
    { label: 'Chiến dịch đã cung cấp', value: stats.totals.campaigns },
    { label: 'Đơn nguyên liệu', value: stats.totals.orders },
    { label: 'Kg được đặt', value: stats.totals.orderedKg },
    { label: 'Kg đã ký nhận', value: stats.totals.receivedKg },
  ];

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-neutral-900">
          <span className="material-symbols-outlined text-emerald-600">monitoring</span>
          Thống kê cung ứng của cửa hàng
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Số liệu tính theo sổ ký nhận — chỉ đơn tình nguyện viên đã ký lấy hàng mới vào cột
          &quot;đã ký nhận&quot;.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-neutral-50 p-3 text-center">
            <p className="text-xl font-extrabold tabular-nums text-neutral-900">
              {t.value.toLocaleString('vi-VN')}
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-500">{t.label}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
          Từng chiến dịch đã cung cấp
        </p>
        <PairedBars
          data={stats.campaigns.map((c) => ({ label: c.title, a: c.orderedKg, b: c.receivedKg }))}
          unitLabel="kg"
          seriesLabels={['Được đặt', 'Đã ký nhận']}
        />
        <DataTable
          headers={['Chiến dịch', 'Kg đặt', 'Kg ký nhận', 'Số đơn', 'Lần giao gần nhất']}
          rows={stats.campaigns.map((c) => [
            c.title,
            c.orderedKg,
            c.receivedKg,
            c.orders,
            c.lastDeliveredAt
              ? new Date(c.lastDeliveredAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
              : 'Chưa giao',
          ])}
        />
      </div>

      {stats.kgSeries.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
            Kg đã giao theo ngày
          </p>
          <AreaChart
            data={stats.kgSeries.map((r) => ({ label: dm(r.date), value: r.kg }))}
            unit="kg"
          />
        </div>
      )}
    </section>
  );
}
