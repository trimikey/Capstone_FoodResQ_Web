'use client';

import { useCampaignReport } from '@/hooks/useCampaigns';
import { AreaChart, DataTable, DonutChart } from '@/components/charts/MiniCharts';
import { useManageContext } from '../../../_components/ManageShell';

const ROLE_VN: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng & phục vụ',
};

/**
 * Tab "Báo cáo" — bức tranh số liệu của một chiến dịch cho tổ chức chủ bếp.
 *
 * Chọn dạng theo việc của dữ liệu: con số đầu bảng là stat tile (không vẽ chart cho
 * một con số); phần-trên-tổng (TNV theo vai trò) là biểu đồ tròn; diễn biến theo
 * thời gian (kg nguyên liệu về bếp, suất phát từng đợt) là biểu đồ núi. Mỗi biểu đồ
 * kèm bảng số liệu xổ ra được — palette thương hiệu tương phản thấp trên nền sáng
 * nên số liệu không được phép chỉ nằm trong màu.
 */
export default function CampaignReportPage() {
  const { campaign } = useManageContext();
  const { data: report, isLoading } = useCampaignReport(campaign.id);

  if (isLoading || !report) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    );
  }

  const tiles = [
    { icon: 'restaurant', label: 'Suất ăn đã phát', value: report.totals.servings },
    { icon: 'group', label: 'Người được hỗ trợ', value: report.totals.people },
    { icon: 'scale', label: 'Kg nguyên liệu về bếp', value: report.totals.kgReceived },
    { icon: 'volunteer_activism', label: 'TNV tham gia', value: report.totals.volunteers },
    { icon: 'takeout_dining', label: 'Đợt phát', value: report.totals.distributionRounds },
  ];

  const dm = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  };

  return (
    <div className="space-y-4">
      {/* Hàng con số đầu bảng */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="cm-manage-card !p-4 text-center">
            <span className="material-symbols-outlined text-[22px] text-emerald-600">{t.icon}</span>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-neutral-900">
              {t.value.toLocaleString('vi-VN')}
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-500">{t.label}</p>
          </div>
        ))}
      </div>

      {/* TNV theo vai trò — phần trên tổng */}
      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title !mb-1">
          <span className="material-symbols-outlined">group</span>
          Tình nguyện viên theo vai trò
        </h2>
        <p className="cm-manage-card-sub !mt-0 mb-3">
          Đếm người duy nhất đã xác nhận ca — một người trực nhiều ca vẫn tính một.
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
      </section>

      {/* Kg nguyên liệu về bếp theo ngày — diễn biến thời gian */}
      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title !mb-1">
          <span className="material-symbols-outlined">scale</span>
          Nguyên liệu về bếp theo ngày
        </h2>
        <p className="cm-manage-card-sub !mt-0 mb-3">
          Cộng từ sổ ký nhận của các đơn NCC và khoản quyên góp thẳng đã xác nhận.
        </p>
        <AreaChart
          data={report.kgSeries.map((r) => ({ label: dm(r.date), value: r.kg }))}
          unit="kg"
        />
        <DataTable
          headers={['Ngày', 'Kg nhận']}
          rows={report.kgSeries.map((r) => [r.date, r.kg])}
        />
      </section>

      {/* Suất ăn theo từng đợt phát */}
      <section className="cm-manage-card">
        <h2 className="cm-manage-card-title !mb-1">
          <span className="material-symbols-outlined">takeout_dining</span>
          Suất ăn đã phát theo đợt
        </h2>
        <p className="cm-manage-card-sub !mt-0 mb-3">
          Số THỰC TẾ shipper chốt khi kết thúc từng đợt phát.
        </p>
        <AreaChart
          data={report.servingsSeries.map((r) => ({ label: r.label, value: r.servings }))}
          unit="suất"
        />
        <DataTable
          headers={['Đợt phát', 'Suất đã phát', 'Người nhận']}
          rows={report.servingsSeries.map((r) => [r.label, r.servings, r.people])}
        />
      </section>
    </div>
  );
}
