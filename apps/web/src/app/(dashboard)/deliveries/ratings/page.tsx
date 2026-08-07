'use client';

import { useState } from 'react';
import { useMyRatings } from '@/hooks/useDeliveries';
import { Spinner } from '@/components/shared/Spinner';

const STARS = [5, 4, 3, 2, 1] as const;

export default function ShipperRatingsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useMyRatings(page);

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const dist = data?.distribution;

  if (isLoading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" className="text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="font-extrabold text-3xl text-neutral-900">Đánh giá của bạn</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Nhận xét từ người nhận sau mỗi đơn bạn đã giao thành công.
          </p>
        </div>

        {isError && (
          <div className="bg-white rounded-3xl border border-rose-100 p-8 text-center">
            <span className="material-symbols-outlined text-rose-500 text-[36px]">wifi_off</span>
            <p className="font-bold text-neutral-700 mt-2">Không tải được đánh giá</p>
          </div>
        )}

        {!isError && total === 0 && (
          <div className="bg-white rounded-3xl border border-dashed border-neutral-200 p-12 text-center">
            <span className="material-symbols-outlined text-neutral-300 text-[44px]">reviews</span>
            <h3 className="font-extrabold text-lg text-neutral-800 mt-3">Chưa có đánh giá nào</h3>
            <p className="text-sm text-neutral-500 mt-1 max-w-sm mx-auto">
              Sau khi bạn giao xong, người nhận có thể chấm điểm và để lại nhận xét. Đánh giá tốt giúp
              bạn được ưu tiên nhận đơn về sau.
            </p>
          </div>
        )}

        {!isError && total > 0 && (
          <>
            {/* Tổng quan: điểm trung bình + phân bố sao */}
            <div className="bg-white rounded-3xl border border-neutral-150 shadow-sm p-6 flex flex-col sm:flex-row gap-6">
              <div className="text-center shrink-0 sm:w-32">
                <p className="text-5xl font-extrabold text-neutral-900 leading-none">
                  {data?.avgRating != null ? data.avgRating.toFixed(1) : '—'}
                </p>
                <div className="flex justify-center gap-0.5 mt-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={`material-symbols-outlined text-[16px] ${
                        data?.avgRating != null && n <= Math.round(data.avgRating)
                          ? 'text-amber-400'
                          : 'text-neutral-300'
                      }`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-1">{total} đánh giá</p>
              </div>

              <div className="flex-1 space-y-1.5">
                {STARS.map((s) => {
                  const count = dist?.[String(s) as '1' | '2' | '3' | '4' | '5'] ?? 0;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-neutral-500 w-3">{s}</span>
                      <span className="material-symbols-outlined text-[13px] text-amber-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                        star
                      </span>
                      <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-neutral-400 w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Danh sách nhận xét */}
            <div className="space-y-3">
              {(data?.items ?? []).map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-neutral-150 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-neutral-800 text-sm truncate">
                        {r.raterName ?? 'Người nhận'}
                      </p>
                      {r.listingTitle && (
                        <p className="text-[11px] text-neutral-500 truncate">{r.listingTitle}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          className={`material-symbols-outlined text-[15px] ${
                            n <= r.score ? 'text-amber-400' : 'text-neutral-200'
                          }`}
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          star
                        </span>
                      ))}
                    </div>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-neutral-700 mt-2 leading-relaxed">
                      &ldquo;{r.comment}&rdquo;
                    </p>
                  )}
                  <p className="text-[11px] text-neutral-400 mt-2">
                    {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                  </p>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Trang trước"
                  className="w-10 h-10 rounded-full border border-neutral-200 bg-white flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <span className="text-sm font-bold text-neutral-600 px-3">
                  {page}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label="Trang sau"
                  className="w-10 h-10 rounded-full border border-neutral-200 bg-white flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
