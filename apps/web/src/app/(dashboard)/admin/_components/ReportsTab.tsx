'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAdminReports, useResolveReport, useAdminOverview } from '@/hooks/useAdmin';
import { usePaged, Pagination, Skeleton, Empty } from './admin-shared';

export default function ReportsTab() {
  const [status, setStatus] = useState('');
  const { data, isLoading } = useAdminReports(status || undefined);
  const { data: ov } = useAdminOverview();
  const resolve = useResolveReport();
  const paged = usePaged(data ?? [], 8, status);

  async function act(id: string, st: 'resolved' | 'dismissed') {
    try {
      await resolve.mutateAsync({ id, status: st });
      toast.success(st === 'resolved' ? 'Đã xử lý' : 'Đã bỏ qua');
    } catch {
      toast.error('Thao tác thất bại');
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <div className="text-xs font-semibold text-emerald-700 mb-2">Hệ thống / Xử lý khiếu nại</div>
          <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Danh sách Khiếu nại</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
          <div className="bg-[#f9faf9] border border-neutral-150 px-4 sm:px-6 py-4 rounded-3xl shadow-sm text-center sm:min-w-[140px]">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Tổng khiếu nại</p>
            <p className="text-2xl font-extrabold text-emerald-800 mt-1">{ov?.reports.total ?? 0}</p>
          </div>
          <div className="bg-[#fef2f2] border border-[#fecaca] px-4 sm:px-6 py-4 rounded-3xl shadow-sm text-center sm:min-w-[140px]">
            <p className="text-[10px] font-bold text-[#b91c1c] uppercase tracking-widest">Đang chờ xử lý</p>
            <p className="text-2xl font-extrabold text-[#b91c1c] mt-1">{ov?.reports.pending ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { v: '', l: 'Tất cả' },
          { v: 'pending', l: 'Đang chờ' },
          { v: 'resolved', l: 'Đã xử lý' },
          { v: 'dismissed', l: 'Đã bỏ qua' },
        ].map((opt) => (
          <button
            key={opt.v}
            onClick={() => setStatus(opt.v)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              status === opt.v ? 'bg-[#166534] text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton />
      ) : !data || data.length === 0 ? (
        <Empty icon="flag" text="Không có khiếu nại nào" />
      ) : (
        <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm mt-2 min-w-[680px]">
              <thead className="text-neutral-900 font-bold border-b border-neutral-100 text-[13px]">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Lý do</th>
                  <th className="px-6 py-4">Mô tả</th>
                  <th className="px-6 py-4">Người gửi</th>
                  <th className="px-6 py-4">Ngày</th>
                  <th className="px-6 py-4">Trạng thái</th>
                  <th className="px-6 py-4">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100/50">
                {paged.slice.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-[#166534] whitespace-nowrap">#FR-{r.id.slice(-5).toUpperCase()}</td>
                    <td className="px-6 py-4 font-medium text-neutral-800">{r.reason}</td>
                    <td className="px-6 py-4 text-neutral-500 max-w-[220px] truncate">{r.description || '—'}</td>
                    <td className="px-6 py-4 text-neutral-700 whitespace-nowrap">{r.reporter.fullName}</td>
                    <td className="px-6 py-4 text-neutral-700 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${r.status === 'pending' ? 'bg-[#fee2e2] text-[#991b1b]' : 'bg-[#bbf7d0] text-emerald-900'}`}>
                        {r.status === 'pending' ? 'Đang chờ' : r.status === 'resolved' ? 'Đã xử lý' : 'Đã bỏ qua'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {r.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button onClick={() => act(r.id, 'dismissed')} disabled={resolve.isPending} title="Bỏ qua" className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:bg-neutral-100"><span className="material-symbols-outlined text-[18px]">close</span></button>
                          <button onClick={() => act(r.id, 'resolved')} disabled={resolve.isPending} title="Đã xử lý" className="w-8 h-8 rounded-full bg-[#166534] text-white flex items-center justify-center hover:bg-[#14532d]"><span className="material-symbols-outlined text-[18px]">check</span></button>
                        </div>
                      ) : (
                        <span className="material-symbols-outlined text-emerald-500">task_alt</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} perPage={paged.perPage} onChange={paged.setPage} />
        </div>
      )}
    </div>
  );
}
