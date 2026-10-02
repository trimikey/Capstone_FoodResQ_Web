'use client';

import { useState } from 'react';
import { useAdminVolunteersOverview, type AdminVolunteerOverview } from '@/hooks/useAdminOperations';
import { usePaged, Pagination, Skeleton, Empty } from './admin-shared';

const SPEC_LABEL: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };
const RANK_LABEL: Record<string, string> = {
  newcomer: 'Mới tham gia',
  active: 'Tích cực',
  experienced: 'Dày dạn',
  expert: 'Chuyên gia',
};
const ACCOUNT_META: Record<string, { label: string; cls: string }> = {
  active: { label: 'Hoạt động', cls: 'bg-emerald-100 text-emerald-800' },
  pending_verification: { label: 'Chờ xác minh', cls: 'bg-sky-100 text-sky-700' },
  suspended: { label: 'Tạm khoá', cls: 'bg-amber-100 text-amber-800' },
  banned: { label: 'Đã khoá', cls: 'bg-rose-100 text-rose-700' },
};

type Filter = '' | 'shipper' | 'chef' | 'issues';

/** Tổng số lần bỏ việc: đơn giao thất bại sau khi nhận + vắng ca chiến dịch + huỷ chuyến giao sỉ. */
const dropCount = (v: AdminVolunteerOverview) => v.deliveriesFailed + v.campaignAbsences + v.bulkRunsCancelled;

export default function VolunteersTab() {
  const { data, isLoading } = useAdminVolunteersOverview();
  const [filter, setFilter] = useState<Filter>('');
  const [q, setQ] = useState('');

  const all = data ?? [];
  const term = q.trim().toLowerCase();
  const rows = all.filter((v) => {
    const specs = v.specializations.map((s) => s.specialization);
    if (filter === 'shipper' && !specs.some((s) => s === 'shipper' || s === 'waiter')) return false;
    if (filter === 'chef' && !specs.includes('chef')) return false;
    if (filter === 'issues' && dropCount(v) === 0) return false;
    if (!term) return true;
    return [v.fullName, v.email, v.phone].some((x) => x?.toLowerCase().includes(term));
  });
  const paged = usePaged(rows, 10, `${filter}|${term}`);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <div className="text-xs font-semibold text-emerald-700 mb-2">Hệ thống / Tình nguyện viên</div>
          <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Tình nguyện viên &amp; shipper</h2>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:flex sm:gap-4">
          <Stat label="Tổng TNV" value={all.length} />
          <Stat label="Có ca sắp tới" value={all.filter((v) => v.shiftsUpcoming > 0).length} />
          <Stat label="Từng huỷ / vắng" value={all.filter((v) => dropCount(v) > 0).length} danger />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            { v: '', l: 'Tất cả' },
            { v: 'shipper', l: 'Giao hàng & phục vụ' },
            { v: 'chef', l: 'Đầu bếp' },
            { v: 'issues', l: 'Từng huỷ / vắng' },
          ] as Array<{ v: Filter; l: string }>).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setFilter(opt.v)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                filter === opt.v ? 'bg-[#166534] text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên, email, số điện thoại…"
          className="w-full sm:w-72 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      {isLoading ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <Empty icon="volunteer_activism" text="Không có tình nguyện viên nào khớp bộ lọc" />
      ) : (
        <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm mt-2 min-w-[940px]">
              <thead className="text-neutral-900 font-bold border-b border-neutral-100 text-[13px]">
                <tr>
                  <th className="px-4 py-4">Tình nguyện viên</th>
                  <th className="px-4 py-4">Chuyên môn</th>
                  <th className="px-4 py-4 text-right">Uy tín</th>
                  <th className="px-4 py-4 text-right">Cống hiến</th>
                  <th className="px-4 py-4 text-right">Ca giao hàng</th>
                  <th className="px-4 py-4 text-right">Đơn đã giao</th>
                  <th className="px-4 py-4 text-right">Huỷ / vắng</th>
                  <th className="px-4 py-4">Tài khoản</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100/50">
                {paged.slice.map((v) => {
                  const acc = ACCOUNT_META[v.accountStatus] ?? { label: v.accountStatus, cls: 'bg-neutral-100 text-neutral-600' };
                  const drops = dropCount(v);
                  return (
                    <tr key={v.volunteerId} className="hover:bg-neutral-50/50 transition-colors align-top">
                      <td className="px-4 py-4">
                        <p className="font-bold text-neutral-900">{v.fullName}</p>
                        <p className="text-[11px] text-neutral-500">{v.email}</p>
                        {v.phone && <p className="text-[11px] text-neutral-500">{v.phone}</p>}
                      </td>
                      <td className="px-4 py-4">
                        {v.specializations.length === 0 ? (
                          <span className="text-neutral-400">Chưa đăng ký</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {v.specializations.map((s) => (
                              <span
                                key={s.specialization}
                                title={s.isVerified ? 'Đã xác minh' : 'Chưa xác minh'}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                                  s.isVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[13px]">{s.isVerified ? 'verified' : 'hourglass_empty'}</span>
                                {SPEC_LABEL[s.specialization] ?? s.specialization}
                              </span>
                            ))}
                          </div>
                        )}
                        {v.vehicleType && (
                          <p className="mt-1 text-[11px] text-neutral-500">{v.vehicleType}{v.vehiclePlate ? ` · ${v.vehiclePlate}` : ''}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className={`font-bold ${v.trustScore <= 30 ? 'text-rose-700' : v.trustScore <= 60 ? 'text-amber-700' : 'text-neutral-900'}`}>
                          {v.trustScore}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <span className="font-bold text-neutral-900">{v.dedicationPoints}</span>
                        <p className="text-[11px] text-neutral-500">{RANK_LABEL[v.rank] ?? v.rank}</p>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <span className="font-bold text-neutral-900">{v.shiftsUpcoming}</span>
                        <span className="text-neutral-400"> sắp tới</span>
                        <p className="text-[11px] text-neutral-500">{v.shiftsTotal} ca đã đăng ký</p>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <span className="font-bold text-neutral-900">{v.deliveriesDelivered}</span>
                        {v.deliveriesActive > 0 && <p className="text-[11px] text-sky-700">{v.deliveriesActive} đang giao</p>}
                        {v.bulkRunsCompleted > 0 && <p className="text-[11px] text-neutral-500">{v.bulkRunsCompleted} chuyến sỉ</p>}
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <span className={`font-bold ${drops > 0 ? 'text-rose-700' : 'text-neutral-400'}`}>{drops}</span>
                        {drops > 0 && (
                          <p className="text-[11px] text-neutral-500">
                            {[
                              v.deliveriesFailed > 0 && `${v.deliveriesFailed} đơn hỏng`,
                              v.campaignAbsences > 0 && `${v.campaignAbsences} vắng ca`,
                              v.bulkRunsCancelled > 0 && `${v.bulkRunsCancelled} huỷ sỉ`,
                            ].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${acc.cls}`}>{acc.label}</span>
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
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`border px-4 sm:px-6 py-4 rounded-3xl shadow-sm text-center sm:min-w-[130px] ${danger ? 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]' : 'bg-[#f9faf9] border-neutral-150 text-emerald-800'}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</p>
      <p className="text-2xl font-extrabold mt-1">{value}</p>
    </div>
  );
}
