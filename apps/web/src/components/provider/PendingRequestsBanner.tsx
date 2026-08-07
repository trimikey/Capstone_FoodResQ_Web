'use client';

import Link from 'next/link';
import { useProviderBulkRuns } from '@/hooks/useBulkRuns';
import { useProviderRequests } from '@/hooks/useCampaigns';

/**
 * Nhắc việc trên trang Cửa hàng khi có yêu cầu chờ phản hồi.
 * Nội dung xử lý nằm ở tab "Yêu cầu" — ở đây chỉ dẫn đường, không lặp lại danh sách.
 */
export default function PendingRequestsBanner() {
  const { data: bulkRuns } = useProviderBulkRuns();
  const { data: charityRequests } = useProviderRequests();

  const pendingBulk = (bulkRuns ?? []).filter((r) => r.status === 'requested').length;
  const pendingCharity = (charityRequests ?? []).filter((r) => r.status === 'pending').length;
  const total = pendingBulk + pendingCharity;

  if (total === 0) return null;

  const parts = [
    pendingBulk > 0 ? `${pendingBulk} yêu cầu giao sỉ` : null,
    pendingCharity > 0 ? `${pendingCharity} yêu cầu hợp tác` : null,
  ].filter(Boolean);

  return (
    <Link
      href="/provider/requests"
      className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 hover:bg-amber-100 transition-colors"
    >
      <span className="material-symbols-outlined text-amber-600">inbox</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-amber-900">
          {total} yêu cầu đang chờ bạn phản hồi
        </p>
        <p className="text-xs text-amber-800/80">{parts.join(' · ')}</p>
      </div>
      <span className="material-symbols-outlined text-amber-600">chevron_right</span>
    </Link>
  );
}
