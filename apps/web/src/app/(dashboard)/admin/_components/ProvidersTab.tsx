'use client';

import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { useReviewVerification, useSetUserStatus } from '@/hooks/useAdmin';
import { useAdminProviders, type AdminProvider } from '@/hooks/useAdminOperations';
import { errMsg, mediaUrl } from '@/lib/utils';
import { usePaged, Pagination, Skeleton, Empty } from './admin-shared';

const BUSINESS_TYPE_LABEL: Record<string, string> = {
  restaurant: 'Nhà hàng',
  supermarket: 'Siêu thị',
  bakery: 'Tiệm bánh',
  hotel: 'Khách sạn',
  other: 'Khác',
};

type Filter = '' | 'pending' | 'verified' | 'locked';

/** Tài khoản bị khoá được ưu tiên hiển thị hơn trạng thái hồ sơ — đó là điều admin cần thấy trước. */
function statusMeta(p: AdminProvider): { label: string; cls: string } {
  if (p.accountStatus === 'banned') return { label: 'Đã khoá', cls: 'bg-rose-100 text-rose-700' };
  if (p.accountStatus === 'suspended') return { label: 'Tạm khoá', cls: 'bg-amber-100 text-amber-800' };
  if (p.verificationStatus === 'approved') return { label: 'Đã xác minh', cls: 'bg-emerald-100 text-emerald-800' };
  if (p.verificationStatus === 'rejected') return { label: 'Bị từ chối', cls: 'bg-neutral-100 text-neutral-600' };
  return { label: 'Chờ duyệt', cls: 'bg-sky-100 text-sky-700' };
}

const isLocked = (p: AdminProvider) => p.accountStatus === 'banned' || p.accountStatus === 'suspended';
const isPending = (p: AdminProvider) =>
  !isLocked(p) && (p.verificationStatus === 'pending' || p.verificationStatus === 'under_review');

export default function ProvidersTab() {
  const { data, isLoading } = useAdminProviders();
  const review = useReviewVerification();
  const setStatus = useSetUserStatus();
  const [filter, setFilter] = useState<Filter>('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);

  const all = data ?? [];
  const term = q.trim().toLowerCase();
  const rows = all.filter((p) => {
    if (filter === 'pending' && !isPending(p)) return false;
    if (filter === 'verified' && !(p.verificationStatus === 'approved' && !isLocked(p))) return false;
    if (filter === 'locked' && !isLocked(p)) return false;
    if (!term) return true;
    return [p.businessName, p.address, p.email, p.ownerName].some((v) => v?.toLowerCase().includes(term));
  });
  const paged = usePaged(rows, 10, `${filter}|${term}`);
  const busy = review.isPending || setStatus.isPending;

  async function decide(p: AdminProvider, decision: 'approved' | 'rejected') {
    try {
      await review.mutateAsync({ type: 'provider', id: p.providerId, decision });
      toast.success(decision === 'approved' ? `Đã duyệt ${p.businessName}` : `Đã từ chối ${p.businessName}`);
    } catch (e) {
      toast.error(errMsg(e, 'Không cập nhật được hồ sơ'));
    }
  }

  async function lock(p: AdminProvider, status: 'active' | 'suspended') {
    if (status === 'suspended' && !window.confirm(`Tạm khoá "${p.businessName}"? Cửa hàng sẽ không đăng tin hay nhận đơn được cho tới khi mở khoá.`)) return;
    try {
      await setStatus.mutateAsync({ id: p.userId, status });
      toast.success(status === 'active' ? `Đã mở khoá ${p.businessName}` : `Đã tạm khoá ${p.businessName}`);
    } catch (e) {
      toast.error(errMsg(e, 'Không đổi được trạng thái'));
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <div className="text-xs font-semibold text-emerald-700 mb-2">Hệ thống / Nhà cung cấp</div>
          <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Quản lý nhà cung cấp</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
          <Stat label="Tổng cửa hàng" value={all.length} />
          <Stat label="Chờ duyệt" value={all.filter(isPending).length} tone="sky" />
          <Stat label="Đang khoá" value={all.filter(isLocked).length} tone="rose" />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            { v: '', l: 'Tất cả' },
            { v: 'pending', l: 'Chờ duyệt' },
            { v: 'verified', l: 'Đã xác minh' },
            { v: 'locked', l: 'Đang khoá' },
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
          placeholder="Tìm theo tên, địa chỉ, email…"
          className="w-full sm:w-72 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      {isLoading ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <Empty icon="storefront" text="Không có nhà cung cấp nào khớp bộ lọc" />
      ) : (
        <div className="bg-white border border-neutral-150 rounded-3xl shadow-sm overflow-hidden p-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm mt-2 min-w-[920px]">
              <thead className="text-neutral-900 font-bold border-b border-neutral-100 text-[13px]">
                <tr>
                  <th className="px-4 py-4">Cửa hàng</th>
                  <th className="px-4 py-4">Trạng thái</th>
                  <th className="px-4 py-4 text-right">Tin đang đăng</th>
                  <th className="px-4 py-4 text-right">Suất đã cho</th>
                  <th className="px-4 py-4 text-right">Hoàn thành</th>
                  <th className="px-4 py-4 text-right">Khiếu nại</th>
                  <th className="px-4 py-4">Đơn nguyên liệu</th>
                  <th className="px-4 py-4">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100/50">
                {paged.slice.map((p) => {
                  const st = statusMeta(p);
                  const open = openId === p.providerId;
                  return (
                    <Fragment key={p.providerId}>
                      <tr className="hover:bg-neutral-50/50 transition-colors align-top">
                        <td className="px-4 py-4">
                          <button type="button" onClick={() => setOpenId(open ? null : p.providerId)} className="text-left">
                            <p className="font-bold text-neutral-900 flex items-center gap-1">
                              {p.businessName}
                              <span className="material-symbols-outlined text-[16px] text-neutral-400">{open ? 'expand_less' : 'expand_more'}</span>
                            </p>
                            <p className="text-[11px] text-neutral-500 max-w-[240px] truncate">{p.address}</p>
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <span className="font-bold text-neutral-900">{p.listingsActive}</span>
                          <span className="text-neutral-400"> / {p.listingsTotal}</span>
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-neutral-900">{p.servingsGiven.toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          {p.completionRate == null ? (
                            <span className="text-neutral-400">—</span>
                          ) : (
                            <>
                              <span className="font-bold text-neutral-900">{p.completionRate}%</span>
                              <p className="text-[11px] text-neutral-500">{p.ordersCompleted}/{p.ordersFinished} đơn</p>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <span className={`font-bold ${p.reportsTotal > 0 ? 'text-rose-700' : 'text-neutral-400'}`}>{p.reportsTotal}</span>
                          {p.reportsPending > 0 && <p className="text-[11px] text-rose-600">{p.reportsPending} chưa xử lý</p>}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-[12px]">
                          <span className="font-bold text-emerald-700">{p.campaignRequests.accepted} nhận</span>
                          <span className="text-neutral-300"> · </span>
                          <span className="font-bold text-rose-700">{p.campaignRequests.rejected} từ chối</span>
                          {p.campaignRequests.pending > 0 && (
                            <p className="text-[11px] text-neutral-500">{p.campaignRequests.pending} đang chờ trả lời</p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            {isPending(p) && (
                              <>
                                <ActionBtn onClick={() => decide(p, 'approved')} disabled={busy} tone="primary">Duyệt</ActionBtn>
                                <ActionBtn onClick={() => decide(p, 'rejected')} disabled={busy}>Từ chối</ActionBtn>
                              </>
                            )}
                            {isLocked(p) ? (
                              <ActionBtn onClick={() => lock(p, 'active')} disabled={busy} tone="primary">Mở khoá</ActionBtn>
                            ) : (
                              !isPending(p) && <ActionBtn onClick={() => lock(p, 'suspended')} disabled={busy} tone="danger">Tạm khoá</ActionBtn>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-neutral-50/60">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid gap-4 sm:grid-cols-2 text-[13px]">
                              <dl className="space-y-1.5">
                                <Row k="Loại hình" v={BUSINESS_TYPE_LABEL[p.businessType] ?? p.businessType} />
                                <Row k="Mã số thuế" v={p.taxCode ?? '—'} />
                                <Row k="Người đại diện" v={p.ownerName} />
                                <Row k="Email" v={p.email} />
                                <Row k="Điện thoại" v={p.contactPhone ?? '—'} />
                                <Row k="Địa chỉ" v={p.address} />
                                <Row k="Đánh giá" v={p.avgRating != null ? `${p.avgRating.toFixed(1)} / 5` : 'Chưa có'} />
                                <Row k="Tham gia" v={new Date(p.createdAt).toLocaleDateString('vi-VN')} />
                              </dl>
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Giấy phép / ảnh xác minh</p>
                                {p.evidenceUrls.length === 0 ? (
                                  <p className="text-neutral-500">Cửa hàng chưa nộp ảnh xác minh.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {p.evidenceUrls.map((u) => (
                                      <button type="button" key={u} onClick={() => setZoomed(mediaUrl(u))} className="h-24 w-24 overflow-hidden rounded-xl border border-neutral-200">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={mediaUrl(u)} alt="Ảnh xác minh" className="h-full w-full object-cover" />
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} perPage={paged.perPage} onChange={paged.setPage} />
        </div>
      )}

      {zoomed && (
        <button type="button" onClick={() => setZoomed(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" aria-label="Đóng ảnh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomed} alt="Ảnh xác minh phóng to" className="max-h-full max-w-full rounded-2xl object-contain" />
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'sky' | 'rose' }) {
  const cls =
    tone === 'rose'
      ? 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]'
      : tone === 'sky'
        ? 'bg-sky-50 border-sky-200 text-sky-800'
        : 'bg-[#f9faf9] border-neutral-150 text-emerald-800';
  return (
    <div className={`border px-4 sm:px-6 py-4 rounded-3xl shadow-sm text-center sm:min-w-[130px] ${cls}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</p>
      <p className="text-2xl font-extrabold mt-1">{value}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-neutral-500">{k}</dt>
      <dd className="font-semibold text-neutral-800 break-words min-w-0">{v}</dd>
    </div>
  );
}

function ActionBtn({ children, onClick, disabled, tone }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: 'primary' | 'danger';
}) {
  const cls =
    tone === 'primary'
      ? 'bg-[#166534] text-white hover:bg-[#14532d]'
      : tone === 'danger'
        ? 'border border-rose-200 text-rose-700 hover:bg-rose-50'
        : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`px-3 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}
