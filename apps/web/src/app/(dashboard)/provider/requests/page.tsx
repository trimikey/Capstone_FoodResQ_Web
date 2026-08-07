'use client';

import { useProviderBulkRuns } from '@/hooks/useBulkRuns';
import { useProviderRequests } from '@/hooks/useCampaigns';
import BulkRunRequests from '@/components/deliveries/BulkRunRequests';
import ProviderRequestsSection from '@/components/campaigns/ProviderRequestsSection';

/**
 * Hộp thư yêu cầu của nhà cung cấp — gom hai nguồn cần cửa hàng phản hồi:
 * tình nguyện viên xin nhận giao sỉ, và tổ chức từ thiện xin hợp tác chiến dịch.
 * Trước đây hai khối này nằm lẫn dưới trang Cửa hàng nên dễ bị bỏ sót.
 */
export default function ProviderRequestsPage() {
  const { data: bulkRuns } = useProviderBulkRuns();
  const { data: charityRequests } = useProviderRequests();

  const pendingBulk = (bulkRuns ?? []).filter((r) => r.status === 'requested').length;
  const pendingCharity = (charityRequests ?? []).filter((r) => r.status === 'pending').length;
  const totalPending = pendingBulk + pendingCharity;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#236c2a] flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-white">inbox</span>
        </div>
        <div>
          <h1 className="font-extrabold text-2xl text-neutral-900">Yêu cầu gửi tới cửa hàng</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {totalPending > 0
              ? `${totalPending} yêu cầu đang chờ bạn phản hồi.`
              : 'Hiện không có yêu cầu nào chờ xử lý.'}
          </p>
        </div>
      </div>

      {/* Tóm tắt theo nguồn — nhìn là biết cần xử lý phía nào */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-neutral-150 p-4">
          <div className="flex items-center gap-2 text-neutral-500">
            <span className="material-symbols-outlined text-[18px]">local_shipping</span>
            <p className="text-xs font-bold">Giao sỉ (tình nguyện viên)</p>
          </div>
          <p className={`text-2xl font-extrabold mt-1 ${pendingBulk > 0 ? 'text-amber-600' : 'text-neutral-800'}`}>
            {pendingBulk}
          </p>
          <p className="text-[11px] text-neutral-400">chờ duyệt</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-150 p-4">
          <div className="flex items-center gap-2 text-neutral-500">
            <span className="material-symbols-outlined text-[18px]">volunteer_activism</span>
            <p className="text-xs font-bold">Hợp tác (tổ chức từ thiện)</p>
          </div>
          <p className={`text-2xl font-extrabold mt-1 ${pendingCharity > 0 ? 'text-amber-600' : 'text-neutral-800'}`}>
            {pendingCharity}
          </p>
          <p className="text-[11px] text-neutral-400">chờ phản hồi</p>
        </div>
      </div>

      {/* Khối này tự ẩn khi không có chuyến nào để duyệt/theo dõi */}
      <BulkRunRequests />

      <section className="bg-white rounded-2xl border border-neutral-150 shadow-sm overflow-hidden">
        <header className="px-5 py-4 border-b border-neutral-100 flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-500 text-[20px]">storefront</span>
          <h3 className="font-bold text-sm text-neutral-900">Yêu cầu hợp tác từ tổ chức</h3>
        </header>
        <div className="p-5">
          <ProviderRequestsSection />
        </div>
      </section>
    </div>
  );
}
