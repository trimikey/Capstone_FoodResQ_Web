'use client';

import { useState } from 'react';
import { useAdminCampaignIncidents, type AdminCampaignIncident } from '@/hooks/useAdminOperations';
import { mediaUrl } from '@/lib/utils';
import { usePaged, Pagination, Skeleton, Empty } from './admin-shared';

const CONTEXT_LABEL: Record<string, string> = { pickup: 'Lấy nguyên liệu', distribution: 'Phát suất ăn' };

function openFor(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} giờ`;
  return `${Math.floor(minutes / 1440)} ngày`;
}

function badge(r: AdminCampaignIncident): { label: string; cls: string } {
  if (r.status !== 'open') {
    return { label: r.actionTaken === 'reassigned' ? 'Đã đổi người' : 'Đã xử lý', cls: 'bg-emerald-100 text-emerald-700' };
  }
  return r.canContinue
    ? { label: 'Chưa xử lý', cls: 'bg-rose-100 text-rose-700' }
    : { label: 'Cần đổi shipper', cls: 'bg-rose-600 text-white' };
}

/**
 * Sự cố shipper báo trên MỌI chiến dịch. Admin chỉ theo dõi — đổi người / đóng sự cố là
 * việc của tổ chức chủ chiến dịch, nên trang này cho số điện thoại để gọi nhắc.
 */
export default function IncidentsTab() {
  const [status, setStatus] = useState<'open' | 'resolved' | ''>('open');
  const { data, isLoading } = useAdminCampaignIncidents(status || undefined);
  const { data: openRows } = useAdminCampaignIncidents('open');
  const rows = data ?? [];
  const paged = usePaged(rows, 8, status);
  const blocking = (openRows ?? []).filter((r) => !r.canContinue).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <div className="text-xs font-semibold text-emerald-700 mb-2">Vận hành / Sự cố chiến dịch</div>
          <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Sự cố chiến dịch</h2>
          <p className="text-sm text-neutral-500 mt-1">Tổ chức chủ chiến dịch là bên xử lý; admin theo dõi và nhắc khi sự cố để lâu.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
          <div className="bg-[#fef2f2] border border-[#fecaca] px-4 sm:px-6 py-4 rounded-3xl shadow-sm text-center sm:min-w-[140px]">
            <p className="text-[10px] font-bold text-[#b91c1c] uppercase tracking-widest">Chưa xử lý</p>
            <p className="text-2xl font-extrabold text-[#b91c1c] mt-1">{openRows?.length ?? 0}</p>
          </div>
          <div className="bg-rose-600 px-4 sm:px-6 py-4 rounded-3xl shadow-sm text-center sm:min-w-[140px] text-white">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-90">Cần đổi shipper</p>
            <p className="text-2xl font-extrabold mt-1">{blocking}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { v: 'open', l: 'Chưa xử lý' },
          { v: 'resolved', l: 'Đã xử lý' },
          { v: '', l: 'Tất cả' },
        ] as Array<{ v: 'open' | 'resolved' | ''; l: string }>).map((opt) => (
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
      ) : rows.length === 0 ? (
        <Empty icon="task_alt" text={status === 'open' ? 'Không có sự cố nào đang mở' : 'Chưa có sự cố nào'} />
      ) : (
        <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden">
          <div className="divide-y divide-neutral-100">
            {paged.slice.map((r) => {
              const b = badge(r);
              return (
                <div key={r.id} className="p-5 flex gap-4">
                  {r.photoUrl && (
                    <a href={mediaUrl(r.photoUrl)} target="_blank" rel="noreferrer" className="hidden sm:block h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-neutral-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(r.photoUrl)} alt="Ảnh sự cố" className="h-full w-full object-cover" />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-neutral-900">{r.reasonLabel}</p>
                        <p className="text-[12px] text-neutral-500">
                          {CONTEXT_LABEL[r.context] ?? r.context} · {r.campaignTitle}
                        </p>
                      </div>
                      <span className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${b.cls}`}>{b.label}</span>
                    </div>
                    <p className={`mt-1.5 text-[12px] font-semibold ${r.canContinue ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {r.canContinue
                        ? `Shipper vẫn tiếp tục${r.delayMinutes ? ` — dự kiến trễ khoảng ${r.delayMinutes} phút` : ''}.`
                        : 'Shipper không thể tiếp tục — việc đang chờ tổ chức phân công người khác.'}
                    </p>
                    {r.detail && <p className="mt-1 text-[13px] text-neutral-700">{r.detail}</p>}
                    <div className="mt-2 grid gap-1 text-[12px] text-neutral-600 sm:grid-cols-2">
                      <p>
                        <span className="text-neutral-400">Shipper báo: </span>
                        <span className="font-semibold text-neutral-800">{r.reporterName}</span>
                        {r.reporterPhone && <a href={`tel:${r.reporterPhone}`} className="ml-1 font-bold text-emerald-700 hover:underline">{r.reporterPhone}</a>}
                      </p>
                      <p>
                        <span className="text-neutral-400">Tổ chức: </span>
                        <span className="font-semibold text-neutral-800">{r.organizationName}</span>
                        {r.organizationPhone && <a href={`tel:${r.organizationPhone}`} className="ml-1 font-bold text-emerald-700 hover:underline">{r.organizationPhone}</a>}
                      </p>
                    </div>
                    <p className="mt-1.5 text-[11px] text-neutral-500">
                      Báo lúc {new Date(r.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                      {r.minutesOpen != null && (
                        <span className={r.minutesOpen >= 30 ? 'font-bold text-rose-700' : ''}> · đã mở {openFor(r.minutesOpen)}</span>
                      )}
                    </p>
                    {r.status !== 'open' && r.resolvedNote && (
                      <p className="mt-1 text-[12px] text-emerald-700">Cách xử lý: {r.resolvedNote}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} perPage={paged.perPage} onChange={paged.setPage} />
        </div>
      )}
    </div>
  );
}
