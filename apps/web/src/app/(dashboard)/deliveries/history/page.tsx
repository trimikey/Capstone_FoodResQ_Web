'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useVolunteerMe, useDeliveryHistory, type DeliveryHistoryItem } from '@/hooks/useDeliveries';
import { useCreateReport } from '@/hooks/useReports';
import { mediaUrl } from '@/lib/utils';
import { ReportReason, ReportTargetType } from '@foodresq/types';
import { toast } from 'sonner';

const PER_PAGE = 8;

const REPORT_REASONS = [
  { value: ReportReason.OTHER, label: 'Sự cố khác' },
  { value: ReportReason.HARASSMENT, label: 'Ứng xử không phù hợp' },
  { value: ReportReason.FRAUD, label: 'Thông tin không đúng' },
  { value: ReportReason.NO_SHOW_PROVIDER, label: 'Không gặp được bên liên quan' },
  { value: ReportReason.UNSAFE_FOOD, label: 'Thực phẩm không an toàn' },
] as const;

function HistoryRow({
  h,
  onReport,
}: {
  h: DeliveryHistoryItem;
  onReport: (delivery: DeliveryHistoryItem) => void;
}) {
  const delivered = h.status === 'delivered';
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-md transition-shadow">
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-100 shrink-0 mx-auto sm:mx-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={h.deliveryProofUrl ? mediaUrl(h.deliveryProofUrl) : h.reservation.listing.imageUrls[0] ? mediaUrl(h.reservation.listing.imageUrls[0]) : '/food_bread.png'}
          alt={h.reservation.listing.title}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0 text-center sm:text-left">
        <h3 className="font-bold text-neutral-900 truncate text-base">{h.reservation.listing.title}</h3>
        <p className="text-sm text-neutral-500 truncate flex items-center justify-center sm:justify-start gap-1 mt-1">
          <span className="material-symbols-outlined text-[16px]">person</span>
          Giao cho {h.reservation.receiver.user.fullName}
          {h.distanceKm != null && <span className="text-neutral-400 font-medium">· {h.distanceKm} km</span>}
        </p>
        <p className="text-xs text-neutral-400 mt-1 flex items-center justify-center sm:justify-start gap-1">
          <span className="material-symbols-outlined text-[14px]">schedule</span>
          {h.deliveredAt ? new Date(h.deliveredAt).toLocaleString('vi-VN') : new Date(h.createdAt).toLocaleDateString('vi-VN')}
        </p>
        {!delivered && h.failedReason && <p className="text-xs text-rose-600 mt-1 font-medium">Lý do: {h.failedReason}</p>}
      </div>
      <div className="flex flex-col items-center sm:items-end gap-2 shrink-0">
        <span className={`px-4 py-2 rounded-full text-xs font-bold ${delivered ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>
          {delivered ? 'Đã giao thành công' : 'Giao thất bại'}
        </span>
        <button
          type="button"
          onClick={() => onReport(h)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 text-xs font-bold text-neutral-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors"
        >
          <span className="material-symbols-outlined text-[15px]">flag</span>
          Báo cáo
        </button>
      </div>
    </div>
  );
}

export default function DeliveryHistoryPage() {
  const { data: me, isLoading: meLoading } = useVolunteerMe();
  const [page, setPage] = useState(1);
  const [reporting, setReporting] = useState<DeliveryHistoryItem | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>(ReportReason.OTHER);
  const [reportDescription, setReportDescription] = useState('');
  const { data, isLoading: historyLoading } = useDeliveryHistory({ page, limit: PER_PAGE, enabled: !!me?.isShipper });
  const reportMutation = useCreateReport();

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;
  const curPage = data?.meta.page ?? page;

  const closeReport = () => {
    setReporting(null);
    setReportReason(ReportReason.OTHER);
    setReportDescription('');
  };

  const submitReport = async () => {
    if (!reporting) return;
    try {
      await reportMutation.mutateAsync({
        targetType: ReportTargetType.DELIVERY,
        targetId: reporting.id,
        reason: reportReason,
        description: reportDescription.trim() || undefined,
      });
      toast.success('Đã gửi báo cáo sự cố.');
      closeReport();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Không gửi được báo cáo';
      toast.error(msg);
    }
  };

  if (meLoading || (historyLoading && !data)) {
    return (
      <div className="min-h-screen bg-neutral-50/50 flex items-center justify-center py-20">
        <span className="animate-spin border-4 border-emerald-600 border-t-transparent rounded-full w-10 h-10" />
      </div>
    );
  }

  if (me && !me.isShipper) {
    return (
      <div className="min-h-screen bg-neutral-50/50 pb-24">
        <div className="max-w-4xl mx-auto px-6 md:px-12 py-10">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 flex flex-col items-center text-center gap-4 shadow-sm">
            <span className="material-symbols-outlined text-amber-500 text-6xl">info</span>
            <h2 className="text-xl font-bold text-amber-900">Không có quyền truy cập</h2>
            <p className="text-amber-800">Tài khoản của bạn không có chuyên môn Shipper nên không có lịch sử giao hàng.</p>
            <Link href="/campaigns" className="mt-4 px-6 py-3 bg-amber-600 text-white font-bold rounded-xl shadow-sm hover:bg-amber-700 transition-colors inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">soup_kitchen</span>
              Chuyển đến Bếp ăn cộng đồng
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      {reporting && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-neutral-200 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-neutral-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-neutral-900">Báo cáo sự cố giao hàng</h2>
                <p className="text-sm text-neutral-500 mt-1">
                  Đơn: {reporting.reservation.listing.title}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReport}
                className="w-9 h-9 rounded-full hover:bg-neutral-100 text-neutral-500 flex items-center justify-center"
                aria-label="Đóng"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-neutral-500 uppercase">Lý do</span>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value as ReportReason)}
                  className="mt-1 w-full bg-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                >
                  {REPORT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-neutral-500 uppercase">Mô tả sự cố</span>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Mô tả ngắn gọn sự cố trong quá trình giao hàng..."
                  className="mt-1 w-full bg-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 resize-none"
                />
              </label>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeReport}
                  className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-600 text-sm font-bold hover:bg-neutral-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={submitReport}
                  disabled={reportMutation.isPending}
                  className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold disabled:opacity-50"
                >
                  {reportMutation.isPending ? 'Đang gửi...' : 'Gửi báo cáo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-4xl mx-auto px-6 md:px-12 py-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
          <div className="flex items-center gap-3">
            <Link href="/deliveries" className="p-2 -ml-2 rounded-full hover:bg-neutral-200/50 text-neutral-500 transition-colors" title="Quay lại Trung tâm giao hàng">
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <div>
              <h1 className="font-extrabold text-2xl text-neutral-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">history</span>
                Lịch sử giao hàng
              </h1>
              <p className="text-sm text-neutral-500 mt-1">Danh sách các đơn bạn đã thực hiện</p>
            </div>
          </div>
          
          {total > 0 && (
            <div className="px-4 py-2 bg-white border border-neutral-200 rounded-xl shadow-sm text-sm font-semibold text-neutral-700">
              Tổng cộng: <span className="text-emerald-700">{total}</span> đơn
            </div>
          )}
        </div>

        {/* Content */}
        {total === 0 ? (
          <div className="bg-white rounded-3xl border border-neutral-200 p-12 flex flex-col items-center text-center shadow-sm">
            <div className="w-24 h-24 bg-neutral-100 rounded-full flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-neutral-300 text-5xl">receipt_long</span>
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Chưa có lịch sử giao hàng</h3>
            <p className="text-neutral-500 max-w-sm mb-6">Bạn chưa hoàn tất đơn giao nào. Hãy bắt đầu nhận đơn để ghi lại hành trình tình nguyện của mình nhé!</p>
            <Link href="/deliveries" className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-sm hover:bg-emerald-700 transition-colors">
              Tìm đơn giao hàng ngay
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {items.map((h) => (
                <HistoryRow key={h.id} h={h} onReport={setReporting} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-xs text-neutral-500 font-medium">
                  Hiển thị {(curPage - 1) * PER_PAGE + 1}–{Math.min(total, curPage * PER_PAGE)} trên {total}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={curPage <= 1}
                    className="w-9 h-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-9 h-9 rounded-full text-sm font-bold transition-colors ${
                        p === curPage ? 'bg-emerald-700 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={curPage >= totalPages}
                    className="w-9 h-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
