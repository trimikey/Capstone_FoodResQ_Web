'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

/**
 * Tab nhúng nội dung trang gốc (reservations / history / profile) vào trang /campaigns
 * bằng dynamic import. Tránh duplicate code & vẫn giữ nguyên logic của trang gốc.
 */
export default function EmbeddedTab({
  title,
  source,
  height = 900,
}: {
  title: string;
  source: 'reservations' | 'history' | 'profile';
  height?: number;
}) {
  const [loading, setLoading] = useState(true);

  // Map source → đường dẫn file page.tsx
  const Page = useMemo(() => {
    return dynamic(
      () => import(`@/app/(dashboard)/${source}/page`),
      {
        ssr: false,
        loading: () => (
          <div className="h-96 flex items-center justify-center text-neutral-400">
            <div className="flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
              <p className="text-xs font-medium">Đang tải…</p>
            </div>
          </div>
        ),
      },
    );
  }, [source]);

  void loading;
  void setLoading;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-neutral-800 flex items-center gap-2">
        <span className="material-symbols-outlined text-emerald-700">arrow_forward</span>
        {title}
      </h2>
      <div
        className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden"
        style={{ minHeight: height }}
      >
        <Page />
      </div>
    </div>
  );
}

