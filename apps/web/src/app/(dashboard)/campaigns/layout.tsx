'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mediaUrl } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { UserRole } from '@foodresq/types';
import { useMe } from '@/hooks/useProfile';
import { useMyCampaigns } from '@/hooks/useCampaigns';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import { useAuthStore } from '@/stores/auth.store';
import CharitySidebar, {
  type Section,
} from './_components/CharitySidebar';
import FaceEnrollmentGate from '@/components/shared/FaceEnrollmentGate';

const VALID_SECTIONS: Section[] = [
  'overview',
  'mine',
  'suppliers',
  'providers',
  'orders',
  'history',
  'tasks',
  'browse',
];

/**
 * Layout dành riêng cho /campaigns* — đồng bộ pattern với /provider:
 *   - Sidebar fixed trái (ẩn mobile, drawer riêng).
 *   - Main wrapper có lg:ml-56 để né sidebar trên desktop.
 *
 * Sidebar ở đây KHÔNG phải global navigation — nó là "kitchen-ops rail"
 * chỉ dùng cho các sub-tab của trang campaigns. Vẫn dùng global layout
 * (header top + bottom nav) của (dashboard)/layout.tsx.
 *
 * Section hiện tại lấy từ ?tab=… trên URL (single source of truth);
 * page.tsx cũng đọc cùng param nên sidebar và main luôn đồng bộ.
 */
export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const auth = useAuthStore();

  const { data: me } = useMe();
  const isVolunteer = me?.role === UserRole.VOLUNTEER;
  const isProvider = me?.role === UserRole.PROVIDER;
  const isCharity = me?.role === UserRole.RECEIVER && !!me?.receiver?.isCharityOrg;

  // Section hiện tại từ URL — single source of truth, layout + page cùng đọc.
  // Riêng /campaigns/{id}/manage/... không có ?tab= nhưng vẫn thuộc nhánh
  // "Chiến dịch của tôi" — highlight đúng mục đó thay vì rơi về Tổng quan.
  const tabParam = searchParams?.get('tab');
  const inManage = /^\/campaigns\/[^/]+\/manage/.test(pathname ?? '');
  const section: Section = (VALID_SECTIONS as string[]).includes(tabParam ?? '')
    ? (tabParam as Section)
    : inManage
      ? 'mine'
      : 'overview';

  // Pre-compute rail entries theo role để hiển thị badge số campaign của charity
  const { data: myCampaigns } = useMyCampaigns(isCharity);
  const { data: vol } = useVolunteerMe(isVolunteer);

  const railEntries = useMemo(() => {
    const entries: Array<{ key: Section; label: string; icon: string; badge?: string | number }> = [
      { key: 'overview', label: 'Tổng quan', icon: 'dashboard' },
    ];
    if (isCharity) {
      const my = myCampaigns ?? [];
      const activeCount =
        my.filter((c) => c.status === 'open' || c.status === 'in_progress').length +
        my.filter((c) => c.status === 'draft').length +
        my.filter((c) => c.status === 'completed' || c.status === 'cancelled').length;
      entries.push(
        {
          key: 'mine',
          label: 'Chiến dịch của tôi',
          icon: 'inventory_2',
          badge: activeCount || undefined,
        },
        { key: 'suppliers', label: 'Nhà cung cấp', icon: 'storefront' },
        { key: 'orders', label: 'Đơn nhận', icon: 'bookmark' },
        { key: 'history', label: 'Lịch sử đơn', icon: 'history' },
      );
    }
    if (isVolunteer) {
      entries.push({ key: 'tasks', label: 'Việc của tôi', icon: 'assignment_ind' });
    }
    entries.push({ key: 'browse', label: 'Khám phá', icon: 'travel_explore' });
    if (isProvider) {
      entries.push({ key: 'providers', label: 'Khác', icon: 'store' });
    }
    // Suppress unused warning for vol — giữ lại vì có thể dùng sau
    void vol;
    return entries;
  }, [isCharity, isVolunteer, isProvider, myCampaigns, vol]);

  const handleSectionChange = (key: Section) => {
    const current = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    if (key === 'overview') current.delete('tab');
    else current.set('tab', key);
    const qs = current.toString();
    // Luôn về /campaigns, KHÔNG dùng pathname hiện tại: khi đang ở
    // /campaigns/{id}/manage/... thì gắn ?tab= vào chính đường dẫn đó chỉ đổi query
    // mà vẫn nằm nguyên trang quản lý — bấm sidebar trông như không có tác dụng.
    // Dùng push (không phải replace) để nút Back của trình duyệt quay lại được trang quản lý.
    router.push(qs ? `/campaigns?${qs}` : '/campaigns');
  };

  const handleLogout = () => {
    auth.logout();
    router.push('/login');
  };

  // Mobile header + drawer state — tách ra khỏi CharitySidebar cho gọn
  const [mobileOpen, setMobileOpen] = useState(false);

  // Đóng drawer khi route đổi (vd: user click link trong drawer)
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchParams]);

  return (
    // Layout dashboard chừa sẵn 104px dưới header bằng padding, và dải đó mang nền kem
    // của dashboard. Kéo ngược lên rồi bù lại padding để nền khu chiến dịch phủ kín,
    // không còn vệt màu lạ ở giữa trang (giống cách /provider xử lý).
    <div className="cm-scope md:-mt-[104px] md:pt-[104px]">
      <FaceEnrollmentGate />

      {/* Mobile top header — chỉ hiện <lg */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-neutral-200 px-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Mở menu"
          className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined text-[#236c2a]">menu</span>
        </button>
        <Link href="/campaigns" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-8 w-auto object-contain" />
        </Link>
        <div className="ml-auto w-9 h-9 rounded-full bg-[#236c2a] overflow-hidden flex items-center justify-center text-white font-bold">
          {me?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(me.avatarUrl)} alt="" className="w-full h-full object-cover" />
          ) : (
            (me?.fullName?.charAt(0) ?? '?').toUpperCase()
          )}
        </div>
      </header>

      {/* Mobile drawer (overlay) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col">
            <div className="flex items-center gap-3 px-5 py-5 border-b border-neutral-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-10 w-auto object-contain" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Đóng menu"
                className="ml-auto p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-neutral-500">close</span>
              </button>
            </div>
            <p className="px-5 mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Bếp ăn cộng đồng
            </p>
            <nav className="flex flex-col gap-1 px-3">
              {railEntries.map((entry) => {
                const isActive = section === entry.key;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    aria-current={isActive}
                    onClick={() => handleSectionChange(entry.key)}
                    className={`${
                      isActive
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    } rounded-xl px-4 py-3 flex items-center gap-3 transition-colors text-sm font-semibold`}
                  >
                    <span
                      className="material-symbols-outlined text-[20px]"
                      style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                    >
                      {entry.icon}
                    </span>
                    <span className="flex-1 text-left">{entry.label}</span>
                    {entry.badge != null && (
                      <span className="text-[11px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                        {entry.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="mt-auto p-3 border-t border-neutral-200">
              <button
                onClick={handleLogout}
                className="w-full text-left text-neutral-700 px-4 py-3 flex items-center gap-3 hover:bg-neutral-100 rounded-xl transition-colors text-sm font-semibold"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
                <span>Đăng xuất</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar (giống provider: fixed, ẩn <lg) */}
      <CharitySidebar
        section={section}
        onSectionChange={handleSectionChange}
        isCharity={isCharity}
        isVolunteer={isVolunteer}
        isProvider={isProvider}
        onCreate={() => {
          // Trigger create modal: dispatch event để page lắng nghe
          window.dispatchEvent(new CustomEvent('campaigns:open-create'));
        }}
        railEntries={railEntries}
        userFullName={me?.fullName}
        avatarUrl={me?.avatarUrl}
        onLogout={handleLogout}
      />

      {/* Main wrapper — né sidebar trên desktop */}
      <div className="lg:ml-56 min-h-screen flex flex-col bg-[#fcf9f2]">
        <div className="flex-grow">{children}</div>
      </div>
    </div>
  );
}
