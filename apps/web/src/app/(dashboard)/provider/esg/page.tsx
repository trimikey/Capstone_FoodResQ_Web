'use client';

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useProviderEsgReport, type ProviderEsgReport } from '@/hooks/useEsg';
import { useMe } from '@/hooks/useProfile';
import ProviderHeaderCard from '@/components/provider/ProviderHeaderCard';
import { TrendChart, BarChart, DonutChart, RankBars } from '@/components/charts/TrendChart';
import { DEFAULT_CATEGORIES } from '@/lib/listing-form';

/** Bốn chỉ số CSR chính — dùng chung cho thẻ KPI và bộ chọn chuỗi thời gian. */
const METRICS = [
  {
    key: 'kg',
    label: 'Thực phẩm đã cứu',
    short: 'Thực phẩm',
    unit: 'kg',
    icon: 'eco',
    color: '#236c2a',
    tone: 'bg-emerald-50 text-emerald-700',
  },
  {
    key: 'co2',
    label: 'CO₂ giảm thiểu',
    short: 'CO₂',
    unit: 'kg CO₂e',
    icon: 'cloud_done',
    color: '#0284c7',
    tone: 'bg-sky-50 text-sky-700',
  },
  {
    key: 'meals',
    label: 'Suất ăn chia sẻ',
    short: 'Suất ăn',
    unit: 'suất',
    icon: 'restaurant',
    color: '#d97706',
    tone: 'bg-amber-50 text-amber-700',
  },
  {
    key: 'people',
    label: 'Người được giúp',
    short: 'Người nhận',
    unit: 'người',
    icon: 'volunteer_activism',
    color: '#7c3aed',
    tone: 'bg-violet-50 text-violet-700',
  },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

const STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: 'Hoàn tất', color: '#236c2a' },
  confirmed: { label: 'Đang chờ nhận', color: '#0284c7' },
  picked_up: { label: 'Đã lấy hàng', color: '#14b8a6' },
  cancelled: { label: 'Đã huỷ', color: '#f43f5e' },
  no_show: { label: 'Không đến nhận', color: '#b45309' },
  expired: { label: 'Hết hạn', color: '#a1a1aa' },
};

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.value, c.label]),
);

const RANGES = [
  { months: 6, label: '6 tháng' },
  { months: 12, label: '12 tháng' },
  { months: 24, label: '24 tháng' },
];

export default function ProviderEsgPage() {
  const [months, setMonths] = useState(6);
  const [metric, setMetric] = useState<MetricKey>('meals');
  const { data, isLoading, isError } = useProviderEsgReport(months);
  const { data: me } = useMe();
  const exportedAt = useExportStamp();

  const active = METRICS.find((m) => m.key === metric)!;

  const seriesPoints = useMemo(
    () => (data?.monthly ?? []).map((p) => ({ label: monthLabel(p.month), value: p[metric] })),
    [data, metric],
  );

  const fulfillmentSlices = useMemo(() => {
    const rows = data?.fulfillment ?? [];
    return rows
      .map((r) => ({
        label: STATUS_META[r.status]?.label ?? r.status,
        value: r.count,
        color: STATUS_META[r.status]?.color ?? '#a1a1aa',
      }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const totalOrders = fulfillmentSlices.reduce((s, x) => s + x.value, 0);
  const completedOrders = data?.mealsServed ?? 0;
  const successRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

  if (isLoading && !data) return <LoadingState />;
  if (isError || !data) return <ErrorState />;

  return (
    <div className="flex-1 min-w-0">
      <div className="max-w-6xl mx-auto space-y-6">
        <ProviderHeaderCard
          crumbs={[{ href: '/provider', label: 'Trang quản trị' }, { label: 'Báo cáo CSR' }]}
          eyebrow="Trách nhiệm xã hội doanh nghiệp"
          title="Báo cáo CSR & Tác động ESG"
          description={`${data.businessName} · số liệu tổng hợp từ các đơn đã giao thành công qua FoodResQ.`}
          meta={
            <p className="text-xs text-neutral-500">
              Kỳ báo cáo: {months} tháng gần nhất
              {exportedAt ? ` · Xuất lúc ${exportedAt}` : ''}
              {me?.email ? ` · ${me.email}` : ''}
            </p>
          }
          cta={
            <>
              {/* Bộ chọn kỳ báo cáo — ẩn khi in vì bản in đã ghi rõ kỳ ở dòng meta */}
              <div className="inline-flex rounded-xl border border-neutral-200 p-1 print:hidden">
                {RANGES.map((r) => (
                  <button
                    key={r.months}
                    onClick={() => setMonths(r.months)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      months === r.months
                        ? 'bg-[#236c2a] text-white'
                        : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors print:hidden"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                Xuất báo cáo
              </button>
            </>
          }
        />

        {/* KPI — cũng là nút chọn chuỗi thời gian bên dưới */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`text-left bg-white p-4 md:p-5 rounded-2xl border shadow-sm transition-all ${
                metric === m.key
                  ? 'border-[#236c2a] ring-2 ring-[#236c2a]/15'
                  : 'border-neutral-150 hover:shadow-md'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl ${m.tone} flex items-center justify-center`}>
                <span className="material-symbols-outlined text-[20px]">{m.icon}</span>
              </div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                {m.label}
              </p>
              <p className="mt-1 text-2xl md:text-3xl font-extrabold tabular-nums text-neutral-900">
                {fmt(totalOf(data, m.key))}
                <span className="ml-1 text-xs font-medium text-neutral-500">{m.unit}</span>
              </p>
            </button>
          ))}
        </section>

        {/* Chuỗi thời gian: đường cho đại lượng liên tục (kg, CO₂), cột cho đại lượng đếm */}
        <section className="bg-white rounded-2xl border border-neutral-150 shadow-sm p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h2 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[#236c2a]">trending_up</span>
                {active.label} theo tháng
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Đơn vị: {active.unit} · Bấm vào thẻ chỉ số phía trên để đổi biểu đồ
              </p>
            </div>
            <div className="inline-flex flex-wrap gap-1.5 print:hidden">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    metric === m.key
                      ? 'border-transparent text-white'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                  style={metric === m.key ? { backgroundColor: m.color } : undefined}
                >
                  {m.short}
                </button>
              ))}
            </div>
          </div>

          {metric === 'kg' || metric === 'co2' ? (
            <TrendChart points={seriesPoints} color={active.color} unit={active.unit} />
          ) : (
            <BarChart points={seriesPoints} color={active.color} unit={active.unit} />
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Chất lượng vận hành — phần hội đồng hay hỏi: bao nhiêu đơn thực sự tới tay người nhận */}
          <section className="bg-white rounded-2xl border border-neutral-150 shadow-sm p-5 md:p-6">
            <h2 className="font-bold text-lg text-neutral-900 flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[20px] text-[#236c2a]">donut_large</span>
              Tỷ lệ hoàn tất đơn
            </h2>
            <p className="text-xs text-neutral-500 mb-5">
              Toàn bộ {fmt(totalOrders)} đơn đã phát sinh tại cửa hàng
            </p>
            <DonutChart
              slices={fulfillmentSlices}
              centerLabel="hoàn tất"
              centerValue={`${successRate}%`}
            />
          </section>

          <section className="bg-white rounded-2xl border border-neutral-150 shadow-sm p-5 md:p-6">
            <h2 className="font-bold text-lg text-neutral-900 flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[20px] text-[#236c2a]">category</span>
              Phân bổ theo nhóm thực phẩm
            </h2>
            <p className="text-xs text-neutral-500 mb-5">Số suất đã trao, tính trên đơn hoàn tất</p>
            <RankBars
              rows={data.byCategory.map((c) => ({
                label: CATEGORY_LABEL[c.category] ?? c.category,
                value: c.meals,
                sub: c.kg > 0 ? `${fmt(c.kg)} kg` : undefined,
              }))}
              unit="suất"
              color="#d97706"
            />
          </section>
        </div>

        {data.topListings.length > 0 && (
          <section className="bg-white rounded-2xl border border-neutral-150 shadow-sm p-5 md:p-6">
            <h2 className="font-bold text-lg text-neutral-900 flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[20px] text-[#236c2a]">
                workspace_premium
              </span>
              Bài đăng đóng góp nhiều nhất
            </h2>
            <p className="text-xs text-neutral-500 mb-5">Top 5 theo số suất đã trao</p>
            <RankBars
              rows={data.topListings.map((l) => ({
                label: l.title,
                value: l.meals,
                sub: l.kg > 0 ? `${fmt(l.kg)} kg` : undefined,
              }))}
              unit="suất"
              color="#7c3aed"
            />
          </section>
        )}

        {/* Bảng số liệu — bản in cần con số chính xác, biểu đồ chỉ để nhìn xu hướng */}
        <section className="bg-white rounded-2xl border border-neutral-150 shadow-sm overflow-hidden">
          <div className="p-5 md:p-6 pb-3">
            <h2 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#236c2a]">table_chart</span>
              Số liệu chi tiết theo tháng
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th className="px-5 py-3 font-bold">Tháng</th>
                  <th className="px-5 py-3 font-bold text-right">Thực phẩm (kg)</th>
                  <th className="px-5 py-3 font-bold text-right">CO₂e (kg)</th>
                  <th className="px-5 py-3 font-bold text-right">Suất ăn</th>
                  <th className="px-5 py-3 font-bold text-right">Người nhận</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly.map((m) => (
                  <tr key={m.month} className="border-t border-neutral-100">
                    <td className="px-5 py-3 font-semibold text-neutral-800">{monthLabel(m.month)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-neutral-700">{fmt(m.kg)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-neutral-700">{fmt(m.co2)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-neutral-700">{fmt(m.meals)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-neutral-700">{fmt(m.people)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-bold">
                  <td className="px-5 py-3 text-neutral-900">Tổng kỳ</td>
                  {(['kg', 'co2', 'meals', 'people'] as const).map((k) => (
                    <td key={k} className="px-5 py-3 text-right tabular-nums text-neutral-900">
                      {fmt(data.monthly.reduce((s, m) => s + m[k], 0))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Ghi rõ cách tính — báo cáo ESG không có phương pháp luận thì không dùng đối ngoại được */}
        <section className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5 text-xs text-neutral-600 leading-relaxed">
          <p className="font-bold text-neutral-800 mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-emerald-700">info</span>
            Phương pháp tính
          </p>
          <ul className="space-y-1.5 list-disc pl-5">
            <li>
              Chỉ tính các đơn ở trạng thái <b>hoàn tất</b> — tức người nhận đã thực sự lấy được
              thực phẩm (quét QR hoặc có ảnh minh chứng).
            </li>
            <li>
              Khối lượng = số suất × khối lượng mỗi suất do cửa hàng khai báo. Bài đăng không khai
              báo khối lượng được tính 0 kg, nên cột kg có thể thấp hơn thực tế.
            </li>
            <li>
              CO₂e quy đổi theo hệ số <b>{data.co2PerKg} kg CO₂e / kg thực phẩm</b> (ước lượng
              FAO/WRI cho thực phẩm hỗn hợp).
            </li>
            <li>
              Tác động được quy về <b>tháng giao hàng</b>, không phải tháng đặt đơn. Múi giờ:
              Asia/Ho_Chi_Minh.
            </li>
            <li>&quot;Người được giúp&quot; đếm số người nhận khác nhau, không đếm trùng lượt.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Không có store thật để theo dõi — mốc thời gian chốt một lần lúc mount. */
const noopSubscribe = () => () => {};

/**
 * Mốc "xuất lúc" của báo cáo, chỉ tồn tại phía client.
 *
 * Đọc đồng hồ thẳng trong render sẽ khiến HTML server và HTML sau hydrate lệch nhau.
 * `useSyncExternalStore` cho phép trả `null` ở server snapshot rồi mới có giá trị ở client,
 * và ref giữ cho giá trị không đổi qua mỗi lần re-render (đổi kỳ báo cáo, hover biểu đồ…).
 */
function useExportStamp() {
  const stamp = useRef<string | null>(null);
  const getSnapshot = useCallback(() => {
    stamp.current ??= new Date().toLocaleString('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    return stamp.current;
  }, []);
  return useSyncExternalStore(noopSubscribe, getSnapshot, () => null);
}

function totalOf(data: ProviderEsgReport, key: MetricKey) {
  if (key === 'kg') return data.kgRescued;
  if (key === 'co2') return data.co2SavedKg;
  if (key === 'meals') return data.mealsServed;
  return data.peopleHelped;
}

/** `2026-08` → `T8/26` — nhãn trục X phải ngắn để 24 cột không chồng chữ. */
function monthLabel(month: string) {
  const [y, m] = month.split('-');
  return `T${Number(m)}/${y.slice(2)}`;
}

function fmt(v: number) {
  return Number.isInteger(v)
    ? v.toLocaleString('vi-VN')
    : v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

function LoadingState() {
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="h-32 rounded-3xl bg-white/60 animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-white/60 animate-pulse" />
        ))}
      </div>
      <div className="h-80 rounded-2xl bg-white/60 animate-pulse" />
    </div>
  );
}

function ErrorState() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-2xl border border-rose-100 p-10 text-center">
        <span className="material-symbols-outlined text-[40px] text-rose-500">error</span>
        <p className="mt-3 font-bold text-neutral-900">Không tải được báo cáo CSR</p>
        <p className="mt-1 text-sm text-neutral-500">
          Vui lòng thử lại, hoặc kiểm tra xem tài khoản đã có hồ sơ cửa hàng chưa.
        </p>
      </div>
    </div>
  );
}
