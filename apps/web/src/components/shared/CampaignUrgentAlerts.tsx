'use client';

import Link from 'next/link';
import { useMyCampaigns } from '@/hooks/useCampaigns';

export function CampaignUrgentAlerts() {
  const { data: campaigns } = useMyCampaigns();

  // Tìm campaign trạng thái "open" mà có slot trống cần tuyển gấp
  const urgent = (campaigns ?? []).filter((c) => {
    if (c.status !== 'open') return false;
    const totalNeeded =
      c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded;
    const totalFilled =
      c.chefSlotsFilled + c.waiterSlotsFilled + c.shipperSlotsFilled;
    return totalFilled < totalNeeded;
  });

  if (urgent.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 px-4 py-2.5 shadow-sm">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-lg">🚨</span>
          <p className="text-sm font-semibold text-amber-800">
            {urgent.length} chiến dịch đang tuyển gấp tình nguyện viên!
          </p>
        </div>
        <Link
          href="/campaigns"
          className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          Xem ngay →
        </Link>
      </div>
    </div>
  );
}
