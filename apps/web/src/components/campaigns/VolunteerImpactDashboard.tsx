'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatVnDate } from '@/lib/vn-date';
import { CHART_COLORS, DataTable, DonutChart, RankBars, StackedColumns } from '@/components/charts/MiniCharts';

export interface VolunteerImpact {
  totals: {
    campaignsJoined: number;
    campaignsCompleted: number;
    shiftsDone: number;
    upcomingShifts: number;
    points: number;
    servingsDistributed: number;
    distributionRounds: number;
    kgPickedUp: number;
    pickups: number;
    dishStepsDone: number;
    onTimeRate: number | null;
  };
  roles: Array<{ role: string; shifts: number }>;
  monthly: Array<{ ym: string; chef: number; ops: number; campaigns: number }>;
  periods: Array<{ period: string; shifts: number }>;
  punctuality: { onTime: number; late: number; absent: number };
  campaigns: Array<{
    id: string;
    title: string;
    date: string;
    status: string;
    roles: string[];
    shifts: number;
    servings: number;
    kg: number;
    steps: number;
    points: number;
  }>;
}

const ROLE_VN: Record<string, string> = { chef: 'Đầu bếp', shipper: 'Giao hàng', waiter: 'Phục vụ' };
const PERIOD_VN: Record<string, string> = {
  morning: 'Ca sáng',
  afternoon: 'Ca chiều',
  evening: 'Ca tối',
  midnight: 'Ca khuya',
  other: 'Không theo ca',
};
const STATUS_VN: Record<string, string> = {
  completed: 'Đã hoàn tất',
  in_progress: 'Đang chạy',
  approved: 'Sắp diễn ra',
  cancelled: 'Đã huỷ',
};
const fmt = (n: number) => n.toLocaleString('vi-VN');

export function useMyVolunteerImpact(enabled: boolean) {
  return useQuery({
    queryKey: ['campaigns', 'my-impact'],
    queryFn: async () => (await api.get('/campaigns/my-impact')).data.data as VolunteerImpact,
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Dashboard CÁ NHÂN của TNV (đầu bếp / giao hàng / phục vụ) trên trang Tổng quan.
 * Thay cho 4 ô số liệu toàn hệ thống trước đây — TNV cần thấy mình đã góp gì:
 * bao nhiêu chiến dịch, bao nhiêu ca, suất đã phát / khâu bếp đã xong, đúng giờ ra sao.
 */
export default function VolunteerImpactDashboard() {
  const { data, isLoading } = useMyVolunteerImpact(true);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }
  if (!data) return null;

  const t = data.totals;
  const isChef = data.roles.some((r) => r.role === 'chef');
  const isOps = data.roles.some((r) => r.role !== 'chef');
  const hasHistory = t.shiftsDone > 0;

  // Chỉ số "đầu ra" theo vai trò: bếp đo bằng khâu nấu đã xong, vận hành đo bằng suất
  // đã phát. Người làm cả hai vai hiện suất phát (tác động tới người nhận).
  const outputTile =
    isOps || !isChef
      ? {
          label: 'Suất ăn đã phát',
          value: t.servingsDistributed,
          icon: 'takeout_dining',
          sub: `${fmt(t.distributionRounds)} đợt phát · ${fmt(t.kgPickedUp)} kg nguyên liệu`,
        }
      : {
          label: 'Khâu bếp đã hoàn thành',
          value: t.dishStepsDone,
          icon: 'soup_kitchen',
          sub: 'Sơ chế · Nấu · QC · Sẵn sàng',
        };

  // Xếp hạng đóng góp: mỗi chiến dịch một thanh, đo bằng chỉ số chính của vai trò.
  const rankMetric = (c: VolunteerImpact['campaigns'][number]) => (isOps || !isChef ? c.servings : c.steps);
  const ranked = [...data.campaigns]
    .filter((c) => rankMetric(c) > 0)
    .sort((a, b) => rankMetric(b) - rankMetric(a))
    .slice(0, 6);
  const rankUnit = isOps || !isChef ? 'suất' : 'khâu';

  const monthLabel = (ym: string) => `Th${Number(ym.slice(5))}/${ym.slice(2, 4)}`;
  const series = [...(isChef ? ['Ca bếp'] : []), ...(isOps ? ['Ca giao hàng & phục vụ'] : [])];
  const monthlyData = data.monthly.map((m) => ({
    label: monthLabel(m.ym),
    values: [...(isChef ? [m.chef] : []), ...(isOps ? [m.ops] : [])],
    note: m.campaigns > 0 ? `${m.campaigns} chiến dịch` : undefined,
  }));

  return (
    <div className="space-y-6">
      {/* KPI cá nhân */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Chiến dịch đã tham gia"
          value={fmt(t.campaignsJoined)}
          icon="volunteer_activism"
          tone="mint"
          sub={`${fmt(t.campaignsCompleted)} đã hoàn tất`}
        />
        <Tile
          label="Ca đã làm"
          value={fmt(t.shiftsDone)}
          icon="event_available"
          tone="sky"
          sub={t.upcomingShifts > 0 ? `${fmt(t.upcomingShifts)} ca sắp tới` : 'Chưa có ca sắp tới'}
        />
        <Tile
          label={outputTile.label}
          value={fmt(outputTile.value)}
          icon={outputTile.icon}
          tone="honey"
          sub={outputTile.sub}
        />
        <Tile
          label="Đúng giờ"
          value={t.onTimeRate == null ? '—' : `${t.onTimeRate}%`}
          icon="schedule"
          tone={t.onTimeRate != null && t.onTimeRate < 70 ? 'ember' : 'ink'}
          sub={`${fmt(data.punctuality.late)} lần trễ · ${fmt(data.punctuality.absent)} lần vắng`}
        />
      </div>

      {!hasHistory ? (
        <div className="cm-card flex items-center gap-3 p-5">
          <span className="material-symbols-outlined text-[26px] text-emerald-600">rocket_launch</span>
          <div>
            <p className="text-sm font-bold text-neutral-800">Bạn chưa làm ca nào</p>
            <p className="text-xs text-neutral-500">
              Đăng ký một ca ở mục Gợi ý bên dưới — biểu đồ đóng góp của bạn sẽ hiện ở đây sau ca đầu tiên.
            </p>
          </div>
        </div>
      ) : (
        <section>
          <div className="cm-section-head">
            <h2 className="cm-section-title">
              <span className="material-symbols-outlined text-emerald-600">monitoring</span>
              Đóng góp của bạn
            </h2>
            {t.points > 0 && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                {fmt(t.points)} điểm cống hiến
              </span>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="cm-card p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-500">
                Hoạt động 6 tháng gần đây
              </p>
              <StackedColumns data={monthlyData} series={series} unit="ca" />
              <DataTable
                headers={['Tháng', ...series, 'Chiến dịch']}
                rows={data.monthly.map((m) => [
                  monthLabel(m.ym),
                  ...(isChef ? [m.chef] : []),
                  ...(isOps ? [m.ops] : []),
                  m.campaigns,
                ])}
              />
            </div>

            <div className="cm-card p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-500">
                {isOps || !isChef ? 'Suất đã phát theo chiến dịch' : 'Khâu bếp theo chiến dịch'}
              </p>
              <RankBars
                data={ranked.map((c) => ({
                  label: c.title,
                  value: rankMetric(c),
                  sub: [
                    formatVnDate(c.date),
                    c.roles.map((r) => ROLE_VN[r] ?? r).join(', '),
                    c.kg > 0 ? `${fmt(c.kg)} kg nguyên liệu` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }))}
                unit={rankUnit}
              />
            </div>

            <div className="cm-card p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Ca theo buổi</p>
              <DonutChart
                data={data.periods.map((p) => ({ label: PERIOD_VN[p.period] ?? p.period, value: p.shifts }))}
                unit="ca"
              />
            </div>

            <div className="cm-card p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Chuyên cần</p>
              {/* Thứ tự cố định để màu không trôi: đúng giờ luôn xanh, trễ luôn vàng. */}
              <DonutChart
                data={[
                  { label: 'Đúng giờ', value: data.punctuality.onTime },
                  { label: 'Điểm danh trễ', value: data.punctuality.late },
                  { label: 'Vắng mặt', value: data.punctuality.absent },
                ]}
                unit="ca"
              />
              {data.roles.length > 1 && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                  {data.roles.map((r, i) => (
                    <span
                      key={r.role}
                      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-700"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      {ROLE_VN[r.role] ?? r.role}: {fmt(r.shifts)} ca
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Danh sách chiến dịch đã tham gia */}
          <div className="cm-card mt-3 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-500">
              Chiến dịch đã tham gia ({fmt(data.campaigns.length)})
            </p>
            <ul className="divide-y divide-neutral-100">
              {data.campaigns.slice(0, 8).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="min-w-0 flex-1 basis-48 truncate text-sm font-bold text-neutral-900 hover:text-emerald-700"
                  >
                    {c.title}
                  </Link>
                  <span className="text-[11px] text-neutral-500">{formatVnDate(c.date)}</span>
                  <span className="text-[11px] text-neutral-500">
                    {c.roles.map((r) => ROLE_VN[r] ?? r).join(', ')} · {fmt(c.shifts)} ca
                  </span>
                  <span className="text-[11px] font-semibold text-neutral-700">
                    {[
                      c.servings > 0 ? `${fmt(c.servings)} suất` : null,
                      c.kg > 0 ? `${fmt(c.kg)} kg` : null,
                      c.steps > 0 ? `${fmt(c.steps)} khâu` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      c.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {STATUS_VN[c.status] ?? c.status}
                  </span>
                </li>
              ))}
            </ul>
            {data.campaigns.length > 8 && (
              <DataTable
                headers={['Chiến dịch', 'Ngày', 'Ca', 'Suất', 'Kg', 'Khâu']}
                rows={data.campaigns.map((c) => [c.title, c.date, c.shifts, c.servings, c.kg, c.steps])}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  icon,
  tone,
  sub,
}: {
  label: string;
  value: string;
  icon: string;
  tone: 'mint' | 'sky' | 'honey' | 'ember' | 'ink';
  sub: string;
}) {
  const toneBg = {
    mint: 'bg-emerald-50 text-emerald-700',
    sky: 'bg-sky-50 text-sky-700',
    honey: 'bg-amber-50 text-amber-700',
    ember: 'bg-[#FFF1EF] text-[#B91C1C]',
    ink: 'bg-neutral-100 text-neutral-700',
  }[tone];
  return (
    <div className="cm-tile">
      <div className="flex items-center justify-between gap-2">
        <span className="cm-tile-label">{label}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${toneBg}`}>
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
        </span>
      </div>
      <span className="cm-tile-value">{value}</span>
      <span className="cm-tile-sub">{sub}</span>
    </div>
  );
}
