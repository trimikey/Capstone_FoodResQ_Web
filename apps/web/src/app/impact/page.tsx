'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PublicHeader from '@/components/home/PublicHeader';
import { AreaChart, DataTable, DonutChart } from '@/components/charts/MiniCharts';
import { usePublicImpactReport } from '@/hooks/useCampaigns';

/**
 * Trang "Báo cáo minh bạch" — công khai, không cần đăng nhập.
 *
 * Mọi con số đọc từ dữ liệu vận hành thật (chiến dịch đã hoàn tất, ký nhận nguyên
 * liệu, đơn đã lấy), không có số mô phỏng. Suất ăn và kg là HAI thang đo khác nhau
 * nên tách thành hai biểu đồ riêng, không dùng hai trục trên cùng một khung.
 */

const SOURCE_VN: Record<string, string> = {
  kitchen: 'Nguyên liệu về bếp',
  donation: 'Quyên góp NCC',
  listing: 'Thực phẩm từ tin đăng',
};

/** '2026-09' → 'T9/2026' */
function monthLabel(iso: string): string {
  const [y, m] = iso.split('-');
  return `T${Number(m)}/${y}`;
}

function vnDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

const CAMPAIGNS_PER_PAGE = 12;

export default function ImpactReportPage() {
  const { data, isLoading } = usePublicImpactReport();
  const [page, setPage] = useState(1);

  const kgSources = useMemo(
    () => (data?.kgBySource ?? []).filter((s) => s.kg > 0),
    [data],
  );
  const campaigns = data?.campaigns ?? [];
  const totalPages = Math.max(1, Math.ceil(campaigns.length / CAMPAIGNS_PER_PAGE));
  const pageItems = campaigns.slice((page - 1) * CAMPAIGNS_PER_PAGE, page * CAMPAIGNS_PER_PAGE);

  return (
    <main className="min-h-screen bg-[#FAFBF9] pb-20">
      <PublicHeader />

      <div className="mx-auto max-w-5xl px-4 pt-28 sm:px-6 md:pt-32">
        <header>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            <span className="material-symbols-outlined text-[15px]">verified</span>
            Báo cáo minh bạch
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
            Tác động thật của FoodResQ
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">
            Toàn bộ số liệu dưới đây lấy trực tiếp từ dữ liệu vận hành: chiến dịch đã hoàn tất,
            biên bản ký nhận nguyên liệu và đơn thực phẩm người nhận đã lấy. Không có số liệu
            mô phỏng.
          </p>
        </header>

        {isLoading ? (
          <div className="mt-8 space-y-4">
            <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
          </div>
        ) : !data ? (
          <p className="mt-8 rounded-2xl border border-dashed border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
            Chưa tải được báo cáo. Vui lòng thử lại sau.
          </p>
        ) : (
          <>
            {/* Số tổng — dạng stat tile, không phải biểu đồ (một con số không cần trục) */}
            <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                icon="restaurant"
                label="Suất ăn đã phát"
                value={data.totals.mealsServed.toLocaleString('vi-VN')}
              />
              <StatTile
                icon="eco"
                label="Lương thực cứu được"
                value={`${data.totals.kgRescued.toLocaleString('vi-VN')} kg`}
              />
              <StatTile
                icon="task_alt"
                label="Chiến dịch hoàn tất"
                value={data.totals.completedCampaigns.toLocaleString('vi-VN')}
              />
              <StatTile
                icon="groups"
                label="Lượt người được phục vụ"
                value={data.totals.peopleServed.toLocaleString('vi-VN')}
              />
            </section>

            {/* Hai thang đo khác nhau → hai biểu đồ riêng */}
            <section className="mt-4 grid gap-3 lg:grid-cols-2">
              <article className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
                <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                  Suất ăn đã phát theo tháng
                </h2>
                <div className="mt-2">
                  <AreaChart
                    data={data.monthlySeries.map((m) => ({
                      label: monthLabel(m.month),
                      value: m.servings,
                    }))}
                    unit="suất"
                  />
                </div>
                <DataTable
                  headers={['Tháng', 'Suất ăn']}
                  rows={data.monthlySeries.map((m) => [monthLabel(m.month), m.servings])}
                />
              </article>

              <article className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
                <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                  Lương thực cứu được theo tháng (kg)
                </h2>
                <div className="mt-2">
                  <AreaChart
                    data={data.monthlySeries.map((m) => ({
                      label: monthLabel(m.month),
                      value: m.kg,
                    }))}
                    unit="kg"
                  />
                </div>
                <DataTable
                  headers={['Tháng', 'Kg']}
                  rows={data.monthlySeries.map((m) => [monthLabel(m.month), m.kg])}
                />
              </article>
            </section>

            {kgSources.length > 0 && (
              <section className="mt-4 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
                <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                  Lương thực cứu được đến từ đâu
                </h2>
                <div className="mt-2 max-w-md">
                  <DonutChart
                    data={kgSources.map((s) => ({
                      label: SOURCE_VN[s.key] ?? s.key,
                      value: s.kg,
                    }))}
                    unit="kg"
                  />
                </div>
                <DataTable
                  headers={['Nguồn', 'Kg']}
                  rows={kgSources.map((s) => [SOURCE_VN[s.key] ?? s.key, s.kg])}
                />
              </section>
            )}

            {/* Danh sách chiến dịch thành công — dữ liệu tra cứu, đúng chỗ cho bảng */}
            <section className="mt-4 rounded-2xl border border-neutral-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3.5">
                <h2 className="text-sm font-extrabold text-neutral-900">
                  Tất cả chiến dịch đã hoàn tất ({campaigns.length})
                </h2>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2 text-xs font-bold text-neutral-600">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-full border border-neutral-200 px-2.5 py-1 disabled:opacity-40"
                    >
                      Trước
                    </button>
                    <span>
                      {page}/{totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="rounded-full border border-neutral-200 px-2.5 py-1 disabled:opacity-40"
                    >
                      Sau
                    </button>
                  </div>
                )}
              </div>

              {campaigns.length === 0 ? (
                <p className="p-8 text-center text-sm text-neutral-500">
                  Chưa có chiến dịch nào hoàn tất.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-neutral-100 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                        <th className="px-4 py-2.5">Chiến dịch</th>
                        <th className="px-4 py-2.5">Tổ chức</th>
                        <th className="px-4 py-2.5">Kết thúc</th>
                        <th className="px-4 py-2.5 text-right">Suất ăn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((c) => (
                        <tr key={c.id} className="border-b border-neutral-50 last:border-0">
                          <td className="max-w-[280px] px-4 py-3">
                            <Link
                              href={`/campaigns/${c.id}`}
                              className="line-clamp-2 font-semibold text-neutral-800 hover:text-emerald-700 hover:underline"
                            >
                              {c.title}
                            </Link>
                            {c.address && (
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-400">
                                {c.address}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-neutral-600">
                            {c.organizationName ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-600">
                            {vnDate(c.finishedAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-emerald-800">
                            {c.servings.toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="mt-4 text-xs leading-relaxed text-neutral-500">
              <b>Cách tính:</b> suất ăn lấy từ số tổ chức chốt khi kết thúc chiến dịch. Kg lương
              thực gộp nguyên liệu tình nguyện viên đã ký nhận về bếp, quyên góp nhà cung cấp đã
              nhận và thực phẩm người nhận đã lấy từ tin đăng — chỉ tính phần có khai khối lượng,
              nên đây là con số thận trọng.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function StatTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
        <span className="material-symbols-outlined text-[16px] text-emerald-600">{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-neutral-900">{value}</p>
    </div>
  );
}
