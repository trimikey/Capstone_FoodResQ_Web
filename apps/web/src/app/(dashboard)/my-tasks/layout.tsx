'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mediaUrl } from '@/lib/utils';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { UserRole } from '@foodresq/types';
import { useMe } from '@/hooks/useProfile';
import { useMyCampaigns } from '@/hooks/useCampaigns';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import { useAuthStore } from '@/stores/auth.store';
import FaceEnrollmentGate from '@/components/shared/FaceEnrollmentGate';

type Section = 'overview' | 'mine' | 'tasks' | 'schedule' | 'browse';

const VALID_SECTIONS: Section[] = ['overview', 'mine', 'tasks', 'schedule', 'browse'];

/**
 * Layout cho /my-tasks/* — bọc sidebar campaigns giống hệt /campaigns/*
 */
export default function MyTasksLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const auth = useAuthStore();

  const { data: me } = useMe();
  const isVolunteer = me?.role === UserRole.VOLUNTEER;
  const isCharity = me?.role === UserRole.RECEIVER && !!me?.receiver?.isCharityOrg;

  const tabParam = searchParams?.get('tab');
  const section: Section = (VALID_SECTIONS as string[]).includes(tabParam ?? '')
    ? (tabParam as Section)
    : 'tasks';

  const { data: myCampaigns } = useMyCampaigns(isCharity);
  const { data: vol } = useVolunteerMe(isVolunteer);

  const railEntries = useMemo(() => {
    const entries: Array<{ key: Section; label: string; icon: string; badge?: string | number }> = [
      { key: 'overview', label: 'Tổng quan', icon: 'dashboard' },
    ];
    if (isCharity) {
      const my = myCampaigns ?? [];
      const activeCount =
        my.filter((c) => c.status === 'approved' || c.status === 'in_progress').length +
        my.filter((c) => c.status === 'pending_approval').length +
        my.filter((c) => c.status === 'completed' || c.status === 'cancelled').length;
      entries.push(
        { key: 'mine', label: 'Chiến dịch của tôi', icon: 'inventory_2', badge: activeCount || undefined },
        { key: 'browse', label: 'Khám phá', icon: 'travel_explore' },
      );
    }
    if (isVolunteer) {
      entries.push(
        { key: 'tasks', label: 'Việc của tôi', icon: 'assignment_ind' },
        { key: 'schedule', label: 'Lịch làm việc', icon: 'calendar_month' },
      );
    }
    void vol;
    return entries;
  }, [isCharity, isVolunteer, myCampaigns, vol]);

  const handleSectionChange = (key: Section) => {
    if (key === 'schedule') {
      router.push('/campaigns/schedule');
      return;
    }
    const current = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    if (key === 'overview') current.delete('tab');
    else current.set('tab', key);
    const qs = current.toString();
    router.push(qs ? `/campaigns?${qs}` : '/campaigns');
  };

  const handleLogout = () => {
    auth.logout();
    router.push('/login');
  };

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchParams]);

  return (
    <div className="cm-scope md:-mt-[104px] md:pt-[104px]">
      <FaceEnrollmentGate />

      {/* Mobile top header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-neutral-200 px-4 flex items-center gap-3">
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

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
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
                      isActive ? 'bg-emerald-50 text-emerald-800' : 'text-neutral-700 hover:bg-neutral-100'
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

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex fixed left-0 top-[104px] h-[calc(100vh-104px)] w-56 flex-col bg-white z-40 border-r border-neutral-200"
        aria-label="Điều hướng chiến dịch"
      >
        <div className="px-5 pt-6 pb-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            Bếp ăn cộng đồng
          </p>
          {me?.fullName && (
            <p className="mt-1 text-base font-extrabold text-neutral-900 truncate">{me.fullName}</p>
          )}
          <p className="text-xs text-neutral-500 mt-0.5">Quản lý chiến dịch cộng đồng</p>
        </div>

        <nav className="flex flex-col gap-1 px-3 flex-grow overflow-y-auto">
          {railEntries.map((entry) => {
            const isActive = section === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                aria-current={isActive}
                onClick={() => handleSectionChange(entry.key)}
                className={`${
                  isActive ? 'bg-emerald-50 text-emerald-800' : 'text-neutral-700 hover:bg-neutral-100'
                } rounded-xl px-4 py-3 flex items-center gap-3 transition-colors text-sm font-semibold text-left`}
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {entry.icon}
                </span>
                <span className="flex-1">{entry.label}</span>
                {entry.badge != null && (
                  <span className="text-[11px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    {entry.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-neutral-200">
          {me?.fullName && (
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4e9853] to-[#2a662e] flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
                {me.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(me.avatarUrl)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{me.fullName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{me.fullName}</p>
                <p className="text-[11px] text-neutral-500 truncate">Bếp ăn cộng đồng</p>
              </div>
              <button
                onClick={handleLogout}
                aria-label="Đăng xuất"
                className="ml-auto p-1.5 hover:bg-neutral-100 rounded-lg transition-colors text-neutral-400 hover:text-neutral-700"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main wrapper */}
      <div className="md:ml-56 min-h-screen flex flex-col bg-[#fcf9f2]">
        <div className="flex-grow">{children}</div>
      </div>
    </div>
  );
}
