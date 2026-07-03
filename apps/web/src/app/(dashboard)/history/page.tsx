'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useMyReservations, useRateReservation } from '@/hooks/useReservation';
import { useCreateReport } from '@/hooks/useReports';
import { useMe } from '@/hooks/useProfile';
import { ReportReason, ReportTargetType } from '@foodresq/types';

// Shape trả về từ GET /reservations/my (đã mở rộng ở BE)
interface ResHistory {
  id: string;
  status: 'confirmed' | 'picked_up' | 'completed' | 'cancelled' | 'expired' | 'no_show';
  quantity: number;
  createdAt: string;
  listingId: string;
  ratedScore: number | null;
  cancellationReason: string | null;
  listing: {
    title: string;
    pickupAddress: string;
    imageUrls: string[];
    category: string;
    quantityUnit: string;
    weightPerUnitKg: number | null;
    provider: { id: string; businessName: string; userId: string };
  };
}

const CATEGORY_FALLBACK_IMAGE: Record<string, string> = {
  bakery: '/food_bread.png',
  cooked_meal: '/food_lunchbox.png',
  fresh_fruit: '/food_salad.png',
  vegetables: '/food_salad.png',
};
function fallbackImage(category: string): string {
  return CATEGORY_FALLBACK_IMAGE[category] ?? '/food_salad.png';
}

const STATUS_META: Record<
  ResHistory['status'],
  { label: string; badge: string; accent: string; group: 'completed' | 'cancelled' | 'other' }
> = {
  completed: { label: 'Hoàn thành', badge: 'badge-emerald', accent: 'bg-emerald-500', group: 'completed' },
  cancelled: { label: 'Đã hủy', badge: 'badge-neutral', accent: 'bg-neutral-300', group: 'cancelled' },
  no_show: { label: 'Không đến', badge: 'badge-rose', accent: 'bg-rose-400', group: 'cancelled' },
  expired: { label: 'Hết hạn', badge: 'badge-neutral', accent: 'bg-neutral-300', group: 'cancelled' },
  confirmed: { label: 'Đã xác nhận', badge: 'badge-sky', accent: 'bg-sky-400', group: 'other' },
  picked_up: { label: 'Đã lấy hàng', badge: 'badge-honey', accent: 'bg-honey-400', group: 'other' },
};

function formatWeight(r: ResHistory): string {
  if (r.listing.weightPerUnitKg) {
    return `${(r.quantity * r.listing.weightPerUnitKg).toFixed(1)}kg`;
  }
  return `${r.quantity} ${r.listing.quantityUnit}`;
}

export default function HistoryPage() {
  const { data: me } = useMe();
  const rateMutation = useRateReservation();
  const reportMutation = useCreateReport();

  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useMyReservations(page);
  const [items, setItems] = useState<ResHistory[]>([]);

  // Hiển thị dữ liệu theo trang thay vì tích lũy (Pagination)
  useEffect(() => {
    if (!data?.items) return;
    setItems((data.items as ResHistory[]).sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
    ));
  }, [data]);

  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Report Modal
  const [reportingItem, setReportingItem] = useState<ResHistory | null>(null);
  const [reportReason, setReportReason] = useState('');

  // Details Modal
  const [viewingItem, setViewingItem] = useState<ResHistory | null>(null);

  // Review Modal
  const [reviewingItem, setReviewingItem] = useState<ResHistory | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  const filtered = useMemo(() => {
    return items.filter((t) => {
      const group = STATUS_META[t.status].group;
      if (filter === 'all') return true;
      if (filter === 'completed') return group === 'completed';
      if (filter === 'cancelled') return group === 'cancelled';
      return true;
    });
  }, [items, filter]);

  const totalPages = data?.totalPages || 1;

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason.trim()) {
      toast.error('Vui lòng nhập lý do báo cáo.');
      return;
    }
    if (!reportingItem) return;
    try {
      await reportMutation.mutateAsync({
        targetType: ReportTargetType.LISTING,
        targetId: reportingItem.listingId,
        reason: ReportReason.OTHER,
        description: reportReason,
      });
      toast.success('Đã gửi báo cáo. Đội ngũ quản trị sẽ xem xét.');
      setReportingItem(null);
      setReportReason('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Gửi báo cáo thất bại.';
      toast.error(msg);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingItem) return;
    try {
      await rateMutation.mutateAsync({
        id: reviewingItem.id,
        score: rating,
        comment: reviewComment || undefined,
      });
      toast.success(`Cảm ơn bạn đã đánh giá ${rating} sao cho ${reviewingItem.listing.title}!`);
      setReviewingItem(null);
      setRating(5);
      setReviewComment('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Gửi đánh giá thất bại.';
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-mesh-brand pb-24 relative">
      <div className="max-w-7xl mx-auto px-6 md:px-16 lg:px-24 py-10 space-y-10">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-gradient flex items-center justify-center elevation-brand shrink-0">
            <span className="material-symbols-outlined text-white text-[28px]">history</span>
          </div>
          <div>
            <h1 className="font-headline-lg font-extrabold text-3xl sm:text-4xl text-neutral-900">Lịch sử nhận hàng</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Hành trình cứu trợ thực phẩm của bạn.</p>
          </div>
        </div>

        {/* Impact & Metrics (dữ liệu thật từ /users/me) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-[#EBF7EE] border border-[#D3ECD9] rounded-3xl p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between min-h-[190px]">
            <div className="absolute right-0 bottom-0 opacity-15 pointer-events-none translate-x-4 translate-y-4">
              <svg width="180" height="180" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 90 C 20 40, 60 20, 90 10 C 80 50, 40 70, 10 90 Z" fill="#059669" />
              </svg>
            </div>
            <div className="space-y-4 relative z-10">
              <span className="text-[10px] sm:text-xs font-black text-emerald-800 uppercase tracking-widest">
                Tác động cộng đồng
              </span>
              <h2 className="font-extrabold text-2xl sm:text-3xl text-emerald-950 leading-tight">
                Bạn đã cứu được {me?.stats.kgSaved ?? 0}kg thực phẩm
              </h2>
              <p className="text-sm text-emerald-900/85 leading-relaxed max-w-xl">
                Mỗi phần ăn bạn nhận không chỉ giúp giảm lãng phí mà còn đóng góp vào việc bảo vệ môi trường xanh.
              </p>
            </div>
            <div className="mt-6 space-y-2 relative z-10">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-emerald-800">Đã giúp {me?.stats.providersHelped ?? 0} cửa hàng</span>
                <span className="text-neutral-500 font-semibold">
                  {me?.stats.kgSaved ?? 0}/30 kg đến mục tiêu tiếp theo
                </span>
              </div>
              <div className="h-3 w-full bg-emerald-250/30 rounded-full overflow-hidden border border-emerald-200/50">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((me?.stats.kgSaved ?? 0) / 30) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="card-interactive lg:col-span-4 bg-white border border-neutral-150 rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-4 elevation-1 min-h-[190px]">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-honey-300 to-honey-500 text-white flex items-center justify-center shrink-0 ring-4 ring-honey-100 shadow-sm">
              <span className="material-symbols-outlined text-[32px]">restaurant</span>
            </div>
            <div className="space-y-1">
              <h3 className="text-3xl font-extrabold text-neutral-900">{me?.stats.completedCount ?? 0} Bữa ăn</h3>
              <p className="text-xs font-bold text-neutral-600 max-w-[210px] leading-relaxed">
                Tổng số đơn hàng đã hoàn thành.
              </p>
            </div>
          </div>
        </div>

        {/* Transactions */}
        <div className="space-y-6">
          <div className="flex justify-between items-center relative">
            <h2 className="font-extrabold text-2xl text-neutral-900">Giao dịch gần đây</h2>

            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-neutral-700 hover:text-emerald-800 hover:bg-neutral-100/80 transition-all border border-neutral-200/80 bg-white"
              >
                <span className="material-symbols-outlined text-[18px]">filter_list</span>
                <span>Bộ lọc</span>
              </button>

              {showFilterDropdown && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowFilterDropdown(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-neutral-200 rounded-2xl shadow-xl z-30 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                    {(
                      [
                        ['all', 'Tất cả giao dịch'],
                        ['completed', 'Đã hoàn thành'],
                        ['cancelled', 'Đã hủy'],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => {
                          setFilter(val);
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors hover:bg-neutral-50 ${
                          filter === val ? 'text-emerald-800 bg-emerald-50/40' : 'text-neutral-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Loading */}
          {isLoading && items.length === 0 && (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 skeleton" />
              ))}
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="text-center py-12 bg-white rounded-3xl border border-rose-100 elevation-1">
              <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-rose-500 text-[36px]">wifi_off</span>
              </div>
              <p className="font-bold text-neutral-700 mt-3">Không tải được lịch sử từ máy chủ</p>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !isError && filtered.length === 0 && (
            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-neutral-200 elevation-1">
              <div className="w-20 h-20 mx-auto rounded-full bg-brand-gradient-soft flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 text-[44px]">history</span>
              </div>
              <h3 className="font-extrabold text-lg text-neutral-800 mt-4">Chưa có giao dịch nào</h3>
              <p className="text-sm text-neutral-500 mt-1">Hãy tìm thực phẩm và cứu trợ ngay hôm nay.</p>
            </div>
          )}

          {/* Cards */}
          <div className="space-y-4">
            {filtered.map((t) => {
              const meta = STATUS_META[t.status];
              return (
                <div
                  key={t.id}
                  className="card-interactive bg-white rounded-2xl border border-neutral-150 elevation-1 flex overflow-hidden"
                >
                  <div className={`w-1.5 shrink-0 ${meta.accent}`} />
                  <div className="flex-1 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-neutral-100 ring-1 ring-neutral-150">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.listing.imageUrls[0] || fallbackImage(t.listing.category)}
                        alt={t.listing.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-extrabold text-neutral-900 text-base leading-snug">{t.listing.title}</h3>
                      <p className="text-xs text-neutral-500 font-bold">{t.listing.provider.businessName}</p>
                      <div className="flex items-center gap-4 text-[11px] text-neutral-450 font-bold mt-1">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                          {new Date(t.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">scale</span>
                          {formatWeight(t)}
                        </span>
                      </div>
                      {(t.status === 'cancelled' || t.status === 'no_show') && t.cancellationReason && (
                        <p className="text-[11px] text-neutral-500 mt-1 flex items-start gap-1">
                          <span className="material-symbols-outlined text-[13px] text-neutral-400 mt-px">sticky_note_2</span>
                          <span><span className="font-bold">Lý do huỷ:</span> {t.cancellationReason}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 justify-between sm:justify-end flex-1 sm:flex-initial">
                    <span className={`badge ${meta.badge} shrink-0`}>
                      {meta.label}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setReportingItem(t)}
                        className="px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-extrabold transition-all"
                      >
                        Báo cáo
                      </button>

                      <button
                        onClick={() => setViewingItem(t)}
                        className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold transition-all"
                      >
                        Chi tiết
                      </button>

                      {t.status === 'completed' ? (
                        t.ratedScore != null ? (
                          <span className="px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-extrabold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                            Đã đánh giá {t.ratedScore}★
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setReviewingItem(t);
                              setRating(5);
                            }}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm"
                          >
                            Đánh giá
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-10">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-10 h-10 rounded-full text-sm font-bold transition-colors ${
                      page === pageNum 
                        ? 'bg-emerald-600 text-white' 
                        : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>

              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* REPORT MODAL */}
      {reportingItem && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-neutral-200 w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-neutral-150 flex justify-between items-center">
              <h3 className="font-extrabold text-neutral-900 text-lg">Báo cáo đơn hàng</h3>
              <button onClick={() => setReportingItem(null)} className="p-1 hover:bg-neutral-100 rounded-full text-neutral-450 hover:text-neutral-800">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleReportSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-neutral-450 font-bold uppercase">Sản phẩm</p>
                <p className="text-sm font-bold text-neutral-800">{reportingItem.listing.title} - {reportingItem.listing.provider.businessName}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-neutral-450 font-bold uppercase">Lý do báo cáo</label>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Ví dụ: Thực phẩm bị hỏng, không nhận được hàng, thái độ phục vụ không tốt..."
                  rows={4}
                  className="input-base"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setReportingItem(null)} className="flex-1 py-3 border border-neutral-200 text-neutral-700 font-bold text-sm rounded-xl hover:bg-neutral-50 transition-colors">
                  Hủy bỏ
                </button>
                <button type="submit" disabled={reportMutation.isPending} className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50">
                  {reportMutation.isPending ? 'Đang gửi...' : 'Gửi báo cáo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVIEW MODAL */}
      {reviewingItem && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-neutral-200 w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-neutral-150 flex justify-between items-center">
              <h3 className="font-extrabold text-neutral-900 text-lg">Đánh giá sản phẩm</h3>
              <button onClick={() => setReviewingItem(null)} className="p-1 hover:bg-neutral-100 rounded-full text-neutral-450 hover:text-neutral-800">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleReviewSubmit} className="p-6 space-y-6">
              <div className="text-center space-y-2">
                <p className="text-xs text-neutral-500 font-bold">Bạn đánh giá thế nào về thực phẩm này?</p>
                <p className="text-base font-extrabold text-neutral-850">{reviewingItem.listing.title}</p>
                <p className="text-xs text-neutral-450">{reviewingItem.listing.provider.businessName}</p>
              </div>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} type="button" onClick={() => setRating(s)} className="p-1 text-amber-400 hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: s <= rating ? "'FILL' 1" : "'FILL' 0" }}>
                      star
                    </span>
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-neutral-450 font-bold uppercase">Ý kiến đóng góp (Không bắt buộc)</label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Chia sẻ cảm nghĩ của bạn về chất lượng thực phẩm và trải nghiệm nhận hàng..."
                  rows={3}
                  className="input-base"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setReviewingItem(null)} className="flex-1 py-3 border border-neutral-200 text-neutral-700 font-bold text-sm rounded-xl hover:bg-neutral-50 transition-colors">
                  Hủy bỏ
                </button>
                <button type="submit" disabled={rateMutation.isPending} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50">
                  {rateMutation.isPending ? 'Đang gửi...' : 'Gửi đánh giá'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* DETAILS MODAL */}
      {viewingItem && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-neutral-200 w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-neutral-150 flex justify-between items-center bg-neutral-50/50">
              <h3 className="font-extrabold text-neutral-900 text-lg">Chi tiết đơn hàng</h3>
              <button onClick={() => setViewingItem(null)} className="p-1 hover:bg-neutral-200 rounded-full text-neutral-500 transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-start gap-4 pb-6 border-b border-neutral-100">
                <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-neutral-200">
                  <img
                    src={viewingItem.listing.imageUrls[0] || fallbackImage(viewingItem.listing.category)}
                    alt={viewingItem.listing.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="font-extrabold text-neutral-900 text-xl">{viewingItem.listing.title}</h4>
                  <p className="text-sm font-bold text-neutral-500 mt-1">{viewingItem.listing.provider.businessName}</p>
                  <div className="mt-3">
                    <span className={`badge ${STATUS_META[viewingItem.status].badge}`}>
                      {STATUS_META[viewingItem.status].label}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Mã đơn hàng</p>
                  <p className="text-sm font-mono text-neutral-800 font-medium">{viewingItem.id.split('-')[0].toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Ngày tạo</p>
                  <p className="text-sm text-neutral-800 font-medium">{new Date(viewingItem.createdAt).toLocaleString('vi-VN')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Số lượng nhận</p>
                  <p className="text-sm text-neutral-800 font-medium">{formatWeight(viewingItem)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Địa chỉ lấy hàng</p>
                  <p className="text-sm text-neutral-800 font-medium line-clamp-2" title={viewingItem.listing.pickupAddress}>
                    {viewingItem.listing.pickupAddress}
                  </p>
                </div>
              </div>

              {(viewingItem.status === 'cancelled' || viewingItem.status === 'no_show') && viewingItem.cancellationReason && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">Lý do huỷ</p>
                  <p className="text-sm text-neutral-700">{viewingItem.cancellationReason}</p>
                </div>
              )}
            </div>
            <div className="p-4 bg-neutral-50 border-t border-neutral-150 flex justify-end">
              <button 
                onClick={() => setViewingItem(null)} 
                className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-900 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
