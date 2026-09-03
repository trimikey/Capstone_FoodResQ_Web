'use client';

import { useAdminOverview } from '@/hooks/useAdmin';
import { Skeleton } from './admin-shared';

const CATEGORY_LABEL: Record<string, string> = {
  cooked_meal: 'Đồ chín',
  bakery: 'Bánh ngọt',
  fresh_fruit: 'Trái cây',
  beverage: 'Đồ uống',
  vegetables: 'Rau củ',
  raw_protein: 'Thịt/cá sống',
  dry_goods: 'Đồ khô',
  canned_packaged: 'Đồ hộp',
  other: 'Khác',
};
const CATEGORY_COLOR: Record<string, string> = {
  cooked_meal: '#166534',
  bakery: '#22c55e',
  fresh_fruit: '#f59e0b',
  beverage: '#0ea5e9',
  vegetables: '#86efac',
  raw_protein: '#ef4444',
  dry_goods: '#d97706',
  canned_packaged: '#8b5cf6',
  other: '#a8a29e',
};
const MONTH_TARGET_KG = 2000;
const fmtKg = (n: number) => `${n.toLocaleString('vi-VN')} kg`;

function StatCard({ icon, tone, label, value, sub }: { icon: string; tone: 'emerald' | 'honey' | 'rose' | 'neutral'; label: string; value: string; sub?: string }) {
  const toneCls: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    honey: 'bg-honey-100 text-honey-700',
    rose: 'bg-rose-50 text-rose-500',
    neutral: 'bg-neutral-100 text-neutral-500',
  };
  return (
    <div className="bg-white border border-neutral-150 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${toneCls[tone]}`}>
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <p className="text-xs font-semibold text-neutral-500 mb-1 mt-4">{label}</p>
      <p className="text-2xl font-extrabold text-neutral-900">{value}</p>
      {sub && <p className="text-[11px] text-neutral-400 mt-1">{sub}</p>}
    </div>
  );
}

function FunnelCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: number }) {
  const cls: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-600', honey: 'bg-honey-50 text-honey-600',
    emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-500',
  };
  return (
    <div className="border border-neutral-150 rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cls[color]}`}>
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-extrabold text-neutral-900 leading-none">{value}</p>
        <p className="text-[11px] font-semibold text-neutral-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardTab() {
  const { data, isLoading } = useAdminOverview();

  if (isLoading || !data) return <Skeleton />;

  const totalCatKg = data.categories.reduce((s, c) => s + c.kg, 0) || 1;
  const maxTrend = Math.max(1, ...data.trend.map((t) => t.kg));
  const goalPct = Math.min(100, Math.round((data.kgRescued / MONTH_TARGET_KG) * 100));

  let acc = 0;
  const segments = data.categories.map((c) => {
    const start = (acc / totalCatKg) * 360;
    acc += c.kg;
    const end = (acc / totalCatKg) * 360;
    return { ...c, start, end, color: CATEGORY_COLOR[c.category] ?? '#a8a29e' };
  });
  const conic = segments.length
    ? `conic-gradient(${segments.map((s) => `${s.color} ${s.start}deg ${s.end}deg`).join(', ')})`
    : 'conic-gradient(#e5e7eb 0deg 360deg)';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-extrabold text-[28px] text-emerald-800 tracking-tight">Tổng quan Thống kê</h2>
        <p className="text-sm text-neutral-500 mt-1">Dữ liệu thật, tổng hợp toàn hệ thống cứu trợ thực phẩm.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon="eco" tone="emerald" label="Thực phẩm đã cứu trợ" value={fmtKg(data.kgRescued)} />
        <StatCard icon="group" tone="honey" label="Người dùng" value={data.users.toLocaleString('vi-VN')} sub={`${data.providers} cửa hàng · ${data.volunteers} TNV`} />
        <StatCard icon="restaurant" tone="emerald" label="Bữa ăn đã trao" value={`${data.mealsServed.toLocaleString('vi-VN')} suất`} />
        <StatCard icon="warning" tone={data.pendingReports > 0 ? 'rose' : 'neutral'} label="Khiếu nại chờ xử lý" value={`${data.pendingReports} mục`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-neutral-150 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-lg text-neutral-900">Tác động theo thời gian</h3>
            <span className="text-xs bg-neutral-100 px-3 py-1 rounded-full font-semibold text-neutral-600">6 tháng gần đây</span>
          </div>
          {data.trend.length === 0 ? (
            <div className="flex-1 min-h-[200px] flex items-center justify-center text-sm text-neutral-400">Chưa có dữ liệu cứu trợ hoàn tất</div>
          ) : (
            <>
              <div className="relative flex-1 min-h-[220px] w-full mt-4">
                {[0, 25, 50, 75, 100].map((p) => (
                  <div key={p} className="absolute w-full border-b border-neutral-100" style={{ top: `${p}%` }} />
                ))}
                <div className="absolute inset-0 flex items-end justify-between gap-2 px-1">
                  {data.trend.map((t) => {
                    const ratio = maxTrend > 0 ? t.kg / maxTrend : 0;
                    const heightPct = t.kg > 0 ? Math.max(2, ratio * 92) : 0;
                    return (
                      <div key={t.ym} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: '100%' }}>
                        <div className="absolute bottom-full mb-2 hidden whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-bold text-white shadow-lg group-hover:block">
                          Thg {Number(t.ym.split('-')[1])} · {fmtKg(t.kg)}
                        </div>
                        <div className="w-full max-w-[52px] rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-400 transition-all group-hover:from-emerald-700 group-hover:to-emerald-500" style={{ height: `${heightPct}%` }} />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 flex justify-between gap-2 px-1 text-xs font-medium text-neutral-500">
                {data.trend.map((t) => (
                  <span key={t.ym} className="flex-1 text-center">Thg {Number(t.ym.split('-')[1])}</span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bg-white border border-neutral-150 rounded-2xl p-6 shadow-sm flex flex-col items-center">
          <h3 className="font-bold text-lg text-neutral-900 w-full text-left mb-6">Phân bổ danh mục</h3>
          {data.categories.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-neutral-400 py-10">Chưa có dữ liệu</div>
          ) : (
            <>
              <div className="relative w-40 h-40 rounded-full" style={{ background: conic }}>
                <div className="absolute inset-[16px] bg-white rounded-full flex flex-col items-center justify-center">
                  <p className="font-extrabold text-2xl text-neutral-900">{fmtKg(Math.round(totalCatKg))}</p>
                  <p className="text-[9px] font-bold text-neutral-500">Tổng đã cứu</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-8 text-xs font-semibold text-neutral-700 w-full px-2">
                {segments.map((s) => (
                  <div key={s.category} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    {CATEGORY_LABEL[s.category] ?? s.category} ({Math.round((s.kg / totalCatKg) * 100)}%)
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white border border-neutral-150 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-lg text-neutral-900 mb-6">Trạng thái đơn nhận</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FunnelCard icon="task_alt" color="sky" label="Đã xác nhận" value={data.donations.confirmed} />
          <FunnelCard icon="hourglass_top" color="honey" label="Chờ bàn giao" value={data.donations.pickedUp} />
          <FunnelCard icon="check_circle" color="emerald" label="Hoàn tất" value={data.donations.completed} />
          <FunnelCard icon="cancel" color="rose" label="Huỷ / không đến" value={data.donations.cancelled} />
        </div>
      </div>

      <div className="bg-[#fdfaeb] border border-[#f5ead2] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-lg text-neutral-900">Mục tiêu Cộng đồng</h3>
          <p className="text-sm text-neutral-600 mt-1">Mục tiêu cứu trợ {MONTH_TARGET_KG.toLocaleString('vi-VN')} kg thực phẩm.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="w-full md:w-80 h-6 bg-neutral-200 rounded-full overflow-hidden relative">
            <div className="absolute top-0 left-0 h-full bg-[#86efac] flex items-center justify-end pr-2 text-[10px] font-bold text-emerald-900 transition-all" style={{ width: `${Math.max(8, goalPct)}%` }}>
              {goalPct}%
            </div>
          </div>
          <p className="font-extrabold text-xl text-emerald-800 whitespace-nowrap">{data.kgRescued.toLocaleString('vi-VN')} / {MONTH_TARGET_KG.toLocaleString('vi-VN')} kg</p>
        </div>
      </div>
    </div>
  );
}
