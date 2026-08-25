'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AreaChart, DataTable, DonutChart } from '@/components/charts/MiniCharts';

interface CharityOverviewReport {
  totals: { servings: number; people: number; kgReceived: number; volunteers: number; campaigns: number };
  servingsSeries: Array<{ date: string; servings: number; people: number }>;
  kgSeries: Array<{ date: string; kg: number }>;
  volunteersByRole: Array<{ role: string; count: number }>;
}

const ROLE_VN: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng & phục vụ',
};

/**
 * Biểu đồ gộp toàn tổ chức trên dashboard Tổng quan — mọi chiến dịch cộng lại.
 *
 * Hàng KPI phía trên đã lo các con số đầu bảng, khối này lo phần HÌNH: phần-trên-tổng
 * (TNV theo vai trò) là biểu đồ tròn, diễn biến theo ngày (suất phát, kg nguyên liệu)
 * là biểu đồ núi. Mỗi biểu đồ kèm bảng số liệu — nghĩa vụ của palette contrast thấp.
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
  // Chưa có dữ liệu nào thì đừng chiếm chỗ — hàng KPI phía trên đã nói lên điều đó.
  if (!report || (report.totals.servings === 0 && report.totals.kgReceived === 0 && report.totals.volunteers === 0)) {
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
            Tình nguyện viên theo vai trò
          </p>
          <DonutChart
            data={report.volunteersByRole.map((r) => ({
              label: ROLE_VN[r.role] ?? r.role,
              value: r.count,
            }))}
            unit="người"
          />
          <DataTable
            headers={['Vai trò', 'Số người']}
            rows={report.volunteersByRole.map((r) => [ROLE_VN[r.role] ?? r.role, r.count])}
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
        <div className="cm-card p-4 lg:col-span-2">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
            Nguyên liệu về bếp theo ngày (kg)
          </p>
          <AreaChart
            data={report.kgSeries.map((r) => ({ label: dm(r.date), value: r.kg }))}
            unit="kg"
          />
          <DataTable
            headers={['Ngày', 'Kg nhận']}
            rows={report.kgSeries.map((r) => [r.date, r.kg])}
          />
        </div>
      </div>
    </section>
  );
}
