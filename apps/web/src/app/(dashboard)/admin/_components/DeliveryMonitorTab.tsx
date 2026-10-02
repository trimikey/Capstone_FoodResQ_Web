'use client';

import { useState } from 'react';
import {
  useAdminDeliveryMonitor,
  type DeliveryMonitorGroup,
  type MonitoredDelivery,
} from '@/hooks/useAdminOperations';
import { usePaged, Pagination, Skeleton, Empty } from './admin-shared';

const STATUS_LABEL: Record<string, string> = {
  pending_assignment: 'Chờ shipper nhận',
  assigned: 'Đã nhận đơn',
  heading_to_provider: 'Đang tới chỗ lấy',
  qc_completed: 'Đã lấy hàng',
  in_transit: 'Đang giao',
  failed: 'Thất bại',
};

const GROUP_META: Record<DeliveryMonitorGroup, { label: string; cls: string; card: string; icon: string }> = {
  waiting: { label: 'Chờ shipper nhận', cls: 'bg-sky-100 text-sky-700', card: 'bg-sky-50 border-sky-200 text-sky-800', icon: 'hourglass_top' },
  active: { label: 'Đang giao', cls: 'bg-emerald-100 text-emerald-800', card: 'bg-[#f9faf9] border-neutral-150 text-emerald-800', icon: 'local_shipping' },
  stalled: { label: 'Bị treo', cls: 'bg-rose-600 text-white', card: 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]', icon: 'warning' },
  unclaimed: { label: 'Hết hạn, không ai nhận', cls: 'bg-neutral-200 text-neutral-700', card: 'bg-neutral-50 border-neutral-200 text-neutral-700', icon: 'person_off' },
};
const GROUP_ORDER: DeliveryMonitorGroup[] = ['stalled', 'waiting', 'active', 'unclaimed'];

const BULK_STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: 'Chờ NCC duyệt', cls: 'bg-sky-100 text-sky-700' },
  approved: { label: 'Chờ shipper lấy', cls: 'bg-amber-100 text-amber-800' },
  picked_up: { label: 'Đang phát', cls: 'bg-emerald-100 text-emerald-800' },
};

function ago(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
  return `${Math.floor(minutes / 1440)} ngày`;
}

const time = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

/** Dòng thời gian nói điều admin cần biết theo từng nhóm, không chỉ in mốc giờ. */
function timing(d: MonitoredDelivery): { text: string; warn: boolean } {
  if (d.group === 'waiting' && d.claimExpiresAt) {
    const left = Math.round((new Date(d.claimExpiresAt).getTime() - Date.now()) / 60_000);
    return left > 0
      ? { text: `Còn ${ago(left)} để nhận`, warn: left <= 5 }
      : { text: 'Đã quá hạn nhận — sắp bị huỷ', warn: true };
  }
  if (d.group === 'stalled') return { text: `${ago(d.minutesSinceUpdate)} không cập nhật`, warn: true };
  if (d.group === 'unclaimed') return { text: `Huỷ lúc ${time(d.updatedAt)}`, warn: false };
  return { text: `Cập nhật ${ago(d.minutesSinceUpdate)} trước`, warn: false };
}

export default function DeliveryMonitorTab() {
  const { data, isLoading } = useAdminDeliveryMonitor();
  const [group, setGroup] = useState<DeliveryMonitorGroup | ''>('');

  const rows = (data?.deliveries ?? [])
    .filter((d) => !group || d.group === group)
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  const paged = usePaged(rows, 10, group);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <div className="text-xs font-semibold text-emerald-700 mb-2">Vận hành / Giám sát giao hàng</div>
        <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Giám sát giao hàng</h2>
        <p className="text-sm text-neutral-500 mt-1">Tự làm mới mỗi 30 giây.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {(['waiting', 'active', 'stalled', 'unclaimed'] as DeliveryMonitorGroup[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(group === g ? '' : g)}
            className={`border px-4 py-4 rounded-3xl shadow-sm text-left transition-shadow ${GROUP_META[g].card} ${group === g ? 'ring-2 ring-[#166534]' : ''}`}
          >
            <span className="material-symbols-outlined text-[20px]">{GROUP_META[g].icon}</span>
            <p className="text-2xl font-extrabold mt-1">{data?.counts[g] ?? 0}</p>
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{GROUP_META[g].label}</p>
            {g === 'stalled' && data && <p className="text-[10px] opacity-70 mt-0.5">trên {data.stalledAfterMinutes} phút không cập nhật</p>}
            {g === 'unclaimed' && data && <p className="text-[10px] opacity-70 mt-0.5">trong {data.unclaimedLookbackDays} ngày qua</p>}
          </button>
        ))}
        <div className="border px-4 py-4 rounded-3xl shadow-sm bg-amber-50 border-amber-200 text-amber-900 col-span-2 lg:col-span-1">
          <span className="material-symbols-outlined text-[20px]">inventory_2</span>
          <p className="text-2xl font-extrabold mt-1">{data?.counts.bulkRuns ?? 0}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">Chuyến giao sỉ đang chạy</p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <Empty icon="local_shipping" text={group ? 'Không có đơn nào trong nhóm này' : 'Hiện không có đơn giao nào cần theo dõi'} />
      ) : (
        <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm mt-2 min-w-[900px]">
              <thead className="text-neutral-900 font-bold border-b border-neutral-100 text-[13px]">
                <tr>
                  <th className="px-4 py-4">Đơn</th>
                  <th className="px-4 py-4">Người nhận</th>
                  <th className="px-4 py-4">Shipper</th>
                  <th className="px-4 py-4">Tình trạng</th>
                  <th className="px-4 py-4">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100/50">
                {paged.slice.map((d) => {
                  const t = timing(d);
                  return (
                    <tr key={d.deliveryId} className="hover:bg-neutral-50/50 transition-colors align-top">
                      <td className="px-4 py-4">
                        <p className="font-bold text-neutral-900">{d.listingTitle}</p>
                        <p className="text-[11px] text-neutral-500">{d.providerName}</p>
                        <p className="text-[11px] text-neutral-400">
                          #{d.deliveryId.slice(-5).toUpperCase()}
                          {d.quantity != null && ` · ${d.quantity} phần`}
                          {d.distanceKm != null && ` · ${d.distanceKm} km`}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-neutral-800">{d.receiverName}</p>
                        {d.receiverPhone && <p className="text-[11px] text-neutral-500">{d.receiverPhone}</p>}
                        <p className="text-[11px] text-neutral-500 max-w-[220px] truncate">{d.deliveryAddress ?? '—'}</p>
                      </td>
                      <td className="px-4 py-4">
                        {d.shipperName ? (
                          <>
                            <p className="font-semibold text-neutral-800">{d.shipperName}</p>
                            {d.shipperPhone && (
                              <a href={`tel:${d.shipperPhone}`} className="text-[11px] font-bold text-emerald-700 hover:underline">{d.shipperPhone}</a>
                            )}
                          </>
                        ) : (
                          <span className="text-neutral-400">Chưa có</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${GROUP_META[d.group].cls}`}>
                          {GROUP_META[d.group].label}
                        </span>
                        {(d.group === 'active' || d.group === 'stalled') && (
                          <p className="mt-1.5 text-[11px] text-neutral-500">{STATUS_LABEL[d.status] ?? d.status}</p>
                        )}
                        {d.group === 'unclaimed' && d.failedReason && (
                          <p className="mt-1.5 text-[11px] text-neutral-500 max-w-[200px]">{d.failedReason}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <p className={`font-bold ${t.warn ? 'text-rose-700' : 'text-neutral-800'}`}>{t.text}</p>
                        <p className="text-[11px] text-neutral-500">Đặt lúc {time(d.createdAt)}</p>
                        {d.scheduledAt && <p className="text-[11px] text-sky-700">Hẹn giao {time(d.scheduledAt)}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} perPage={paged.perPage} onChange={paged.setPage} />
        </div>
      )}

      <section className="space-y-3">
        <h3 className="font-extrabold text-lg text-neutral-900">Chuyến giao sỉ đang chạy</h3>
        {!data || data.bulkRuns.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-neutral-200 bg-white px-6 py-8 text-center text-sm font-semibold text-neutral-500">
            Không có chuyến giao sỉ nào đang chạy.
          </p>
        ) : (
          <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm mt-2 min-w-[760px]">
                <thead className="text-neutral-900 font-bold border-b border-neutral-100 text-[13px]">
                  <tr>
                    <th className="px-4 py-4">Tin &amp; nhà cung cấp</th>
                    <th className="px-4 py-4">Shipper</th>
                    <th className="px-4 py-4">Trạng thái</th>
                    <th className="px-4 py-4 text-right">Đã phát</th>
                    <th className="px-4 py-4 text-right">Điểm phát</th>
                    <th className="px-4 py-4">Yêu cầu lúc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100/50">
                  {data.bulkRuns.map((b) => {
                    const st = BULK_STATUS[b.status] ?? { label: b.status, cls: 'bg-neutral-100 text-neutral-600' };
                    return (
                      <tr key={b.id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-4 py-4">
                          <p className="font-bold text-neutral-900">{b.listingTitle}</p>
                          <p className="text-[11px] text-neutral-500">{b.providerName}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-neutral-800">{b.shipperName}</p>
                          {b.shipperPhone && (
                            <a href={`tel:${b.shipperPhone}`} className="text-[11px] font-bold text-emerald-700 hover:underline">{b.shipperPhone}</a>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <span className="font-bold text-neutral-900">{b.quantityDistributed}</span>
                          <span className="text-neutral-400"> / {b.quantity}</span>
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-neutral-900">{b.stops}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-neutral-700">{time(b.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
