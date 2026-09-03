'use client';

import Link from 'next/link';
import { useMyIntakeHistory } from '@/hooks/useCampaigns';

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  approved: 'Đang tuyển',
  in_progress: 'Đang diễn ra',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
  pending_approval: 'Chờ duyệt',
};

function formatVn(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Lịch sử nguyên liệu tổ chức ĐÃ NHẬN, nhóm theo từng chiến dịch.
 *
 * Trước đây tab này nhúng trang lịch sử đặt chỗ của người nhận cá nhân — tổ chức
 * không đặt chỗ mà nhận hàng qua quyên góp/yêu cầu NCC, nên luôn hiện rỗng và 0kg.
 */
export default function IntakeHistorySection() {
  const { data, isLoading } = useMyIntakeHistory();

  if (isLoading) {
    return <div className="h-64 w-full animate-pulse rounded-2xl bg-neutral-100" />;
  }

  const campaigns = data?.campaigns ?? [];
  const summary = data?.summary;

  return (
    <section className="space-y-4">
      <div className="cm-section-head">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-emerald-600">history</span>
          Lịch sử nhận nguyên liệu
        </h2>
      </div>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 sm:gap-3">
        <div className="cm-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Lượt nhận</p>
          <p className="mt-1 text-2xl font-extrabold text-neutral-900">{summary?.totalItems ?? 0}</p>
        </div>
        <div className="cm-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Chiến dịch</p>
          <p className="mt-1 text-2xl font-extrabold text-neutral-900">{summary?.totalCampaigns ?? 0}</p>
        </div>
        <div className="cm-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Nhà cung cấp</p>
          <p className="mt-1 text-2xl font-extrabold text-neutral-900">{summary?.totalProviders ?? 0}</p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="cm-card flex flex-col items-center gap-2 p-10 text-center">
          <span className="material-symbols-outlined text-3xl text-neutral-300">inventory_2</span>
          <p className="text-sm font-bold text-neutral-700">Chưa nhận nguyên liệu nào</p>
          <p className="max-w-md text-xs text-neutral-500">
            Khi nhà cung cấp giao nguyên liệu cho một chiến dịch và bạn bấm “Xác nhận đã nhận”,
            khoản đó sẽ được ghi vào đây theo từng chiến dịch.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.campaignId} className="cm-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/campaigns/${c.campaignId}/manage`}
                    className="truncate text-sm font-extrabold text-neutral-900 hover:text-emerald-700"
                  >
                    {c.campaignTitle}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {new Date(c.scheduledDate).toLocaleDateString('vi-VN')} ·{' '}
                    {CAMPAIGN_STATUS_LABEL[c.campaignStatus] ?? c.campaignStatus}
                  </p>
                </div>
                <span className="cm-chip cm-chip--mint shrink-0">{c.items.length} lượt nhận</span>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr className="border-b text-neutral-500">
                      <th className="p-2">Nguyên liệu</th>
                      <th className="p-2">Số lượng</th>
                      <th className="p-2">Nhà cung cấp</th>
                      <th className="p-2">Thời điểm nhận</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="p-2 font-semibold text-neutral-800">
                          {item.itemName}
                          {item.note && (
                            <span className="block text-[11px] font-normal text-neutral-500">
                              {item.note}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-neutral-700">{item.quantity ?? '—'}</td>
                        <td className="p-2 text-neutral-700">
                          {item.providerName}
                          {item.providerPhone && (
                            <span className="block text-[11px] text-neutral-400">
                              {item.providerPhone}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-neutral-500">{formatVn(item.receivedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
