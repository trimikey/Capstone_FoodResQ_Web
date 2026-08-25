'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AreaChart, DataTable, DonutChart } from '@/components/charts/MiniCharts';

interface CharityOverviewReport {
  totals: { servings: number; people: number; kgReceived: number; volunteers: number; campaigns: number };
  servingsSeries: Array<{ date: string; servings: number; people: number }>;
  kgSeries: Array<{ date: string; kg: number }>;
  volunteersByRole: Array<{ role: string; count: number }>;
  campaignsByOutcome: Array<{ key: string; count: number }>;
}

const OUTCOME_VN: Record<string, string> = {
  completed: 'Thành công',
  cancelled: 'Đã hủy',
  expired: 'Quá hạn',
};

/**
 * Biểu đồ gộp toàn tổ chức trên dashboard Tổng quan — mọi chiến dịch cộng lại.
 *
 * Hàng KPI phía trên đã lo các con số đầu bảng, khối này lo phần HÌNH: kết cục
 * chiến dịch (thành công / hủy / quá hạn) là biểu đồ tròn, suất phát theo ngày là
 * biểu đồ núi. Thống kê kg nguyên liệu theo ngày nằm bên dashboard NHÀ CUNG CẤP —
 * không lặp lại ở đây. Mỗi biểu đồ kèm bảng số liệu — nghĩa vụ của palette
 * contrast thấp.
 */
export default function CharityOverviewCharts() {
  const { data: report, isLoading } = useQuery({
    queryKey: ['campaigns', 'charity-overview-report'],
    queryFn: async () =>
      (await api.get('/campaigns/charity/overview-report')).data.data as CharityOverviewReport,
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />;
  }
  // Giữ đủ 3 mục theo THỨ TỰ CỐ ĐỊNH kể cả khi đếm 0 — lọc bớt sẽ làm màu trôi
  // theo chỉ số (VD "Đã hủy" nhận màu xanh lá của "Thành công").
  const outcomes = report?.campaignsByOutcome ?? [];
  const outcomeTotal = outcomes.reduce((sum, o) => sum + o.count, 0);
  // Chưa có dữ liệu nào thì đừng chiếm chỗ — hàng KPI phía trên đã nói lên điều đó.
  if (!report || (report.totals.servings === 0 && outcomeTotal === 0)) {
    return null;
  }

  const dm = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  };

  return (
    <section>
      <div className="cm-section-head">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-emerald-600">monitoring</span>
          Biểu đồ tác động — toàn tổ chức
        </h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="cm-card p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
            Kết cục chiến dịch
          </p>
          {/* Chỉ đếm chiến dịch ĐÃ NGÃ NGŨ — chiến dịch đang chạy/chờ duyệt chưa có
              kết cục nên không vào phần-trên-tổng này. */}
          <DonutChart
            data={outcomes.map((o) => ({ label: OUTCOME_VN[o.key] ?? o.key, value: o.count }))}
            unit="chiến dịch"
          />
          <DataTable
            headers={['Kết cục', 'Số chiến dịch']}
            rows={outcomes.map((o) => [OUTCOME_VN[o.key] ?? o.key, o.count])}
          />
        </div>
        <div className="cm-card p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
            Suất ăn đã phát theo ngày
          </p>
          <AreaChart
            data={report.servingsSeries.map((r) => ({ label: dm(r.date), value: r.servings }))}
            unit="suất"
          />
          <DataTable
            headers={['Ngày', 'Suất phát', 'Người nhận']}
            rows={report.servingsSeries.map((r) => [r.date, r.servings, r.people])}
          />
        </div>
      </div>
    </section>
  );
}
