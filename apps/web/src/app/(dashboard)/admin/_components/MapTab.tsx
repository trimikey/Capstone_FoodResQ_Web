'use client';

import dynamic from 'next/dynamic';
import { useListings } from '@/hooks/useListings';
import { useRecentReservations } from '@/hooks/useAdmin';
import { RES_STATUS_META } from './admin-shared';

const HCM_CENTER = { lng: 106.6297, lat: 10.8231 };

const AdminMap = dynamic(() => import('@/components/map/ListingsMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-neutral-100 animate-pulse rounded-3xl" />,
});

export default function MapTab() {
  const { data: listings } = useListings({ lat: HCM_CENTER.lat, lng: HCM_CENTER.lng, radiusKm: 50 });
  const { data: recent } = useRecentReservations(8);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="font-extrabold text-[28px] text-neutral-900 tracking-tight">Bản đồ trực tiếp</h2>
        <p className="text-sm text-neutral-500 mt-1">{listings?.length ?? 0} điểm thực phẩm đang hoạt động tại TP.HCM (dữ liệu thật).</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[320px] sm:h-[420px] lg:h-[600px] rounded-3xl overflow-hidden border border-neutral-200 shadow-sm">
          <AdminMap listings={listings ?? []} center={HCM_CENTER} selectedId={null} onSelect={() => {}} />
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-neutral-150 p-4 sm:p-6 max-h-[420px] lg:max-h-none lg:h-[600px] flex flex-col">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-extrabold text-lg text-neutral-900">Hoạt động gần đây</h3>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="space-y-3 overflow-y-auto flex-1 -mr-2 pr-2">
            {!recent || recent.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-10">Chưa có hoạt động</p>
            ) : (
              recent.map((ev) => {
                const st = RES_STATUS_META[ev.status] ?? { label: ev.status, cls: 'bg-neutral-100 text-neutral-600', icon: 'help' };
                return (
                  <div key={ev.id} className="flex gap-3 bg-neutral-50/80 p-3 rounded-2xl border border-neutral-100">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${st.cls}`}>
                      <span className="material-symbols-outlined text-[16px]">{st.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-neutral-900 truncate">{ev.title}</p>
                      <p className="text-xs text-neutral-600 mt-0.5 truncate">{ev.provider} → {ev.receiver}</p>
                      <p className="text-[10px] text-neutral-400 mt-1 font-medium">{new Date(ev.createdAt).toLocaleString('vi-VN')} · {st.label}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
