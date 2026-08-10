'use client';

import Link from 'next/link';
import { mediaUrl } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { UserRole } from '@foodresq/types';
import ShipperOfferWatcher from '@/components/deliveries/ShipperOfferWatcher';
import FaceEnrollmentGate from '@/components/shared/FaceEnrollmentGate';
import NotificationBell from '@/components/shared/NotificationBell';

const ADMIN_NAV = [
  { href: '/admin', label: 'Tổng quan thống kê', icon: 'dashboard' },
  { href: '/admin/map', label: 'Bản đồ trực tiếp', icon: 'map' },
  { href: '/admin/donations', label: 'Quản lý Quyên góp', icon: 'volunteer_activism' },
  { href: '/admin/campaigns', label: 'Quản lý Chiến dịch', icon: 'soup_kitchen' },
  { href: '/admin/food', label: 'Quản lý thức ăn', icon: 'restaurant_menu' },
  { href: '/admin/reports', label: 'Xử lý khiếu nại', icon: 'warning' },
  { href: '/admin/users', label: 'Quản lý tài khoản', icon: 'manage_accounts' },
  { href: '/admin/monitor', label: 'Giám sát hệ thống', icon: 'monitoring' },
];

/**
 * Mục neo ở đáy sidebar, chung khối với nút Đăng xuất — đây là nhóm "tài khoản &
 * cấu hình", không phải việc phải làm hằng ngày như các mục nghiệp vụ phía trên.
 */
const ADMIN_FOOTER_NAV = [
  { href: '/admin/settings', label: 'Cài đặt hệ thống', icon: 'settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (user) {
      void import('@/lib/push').then((m) => m.registerPush());
    }
  }, [user]);

  if (!mounted || !user) return null;

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // Tìm ở cả hai danh sách — nếu chỉ tra ADMIN_NAV thì trang Cài đặt (đã chuyển
  // xuống khối chân sidebar) sẽ mất tiêu đề và rơi về nhãn mặc định.
  const currentPageLabel =
    [...ADMIN_NAV, ...ADMIN_FOOTER_NAV].find((n) => pathname === n.href)?.label ?? 'Quản trị viên';

  return (
    <div className="min-h-screen bg-[#FAFBF9] font-body-md">
      {user.role === UserRole.VOLUNTEER && <ShipperOfferWatcher />}
      <FaceEnrollmentGate />

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white z-50 flex items-center justify-between px-4">
        <button onClick={() => setMobileMenuOpen(true)} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
          <span className="material-symbols-outlined text-[#236c2a]">menu</span>
        </button>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-8 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <div className="w-10 h-10 rounded-full bg-[#236c2a] overflow-hidden flex items-center justify-center">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(user.avatarUrl)} alt={user.fullName} className="w-full h-full object-cover" />
            ) : (
              <span className="font-bold text-white">{user.fullName?.charAt(0).toUpperCase()}</span>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center gap-3 px-5 py-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-10 w-auto object-contain" />
              <button onClick={() => setMobileMenuOpen(false)} className="ml-auto p-2 hover:bg-neutral-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-neutral-500">close</span>
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3 flex-grow">
              {ADMIN_NAV.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                    className={`${isActive ? 'bg-[#236c2a] text-white' : 'text-neutral-700 hover:bg-neutral-100'} rounded-lg px-4 py-3 flex items-center gap-3 transition-colors text-sm`}>
                    <span className="material-symbols-outlined text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-neutral-200 flex flex-col gap-1">
              {ADMIN_FOOTER_NAV.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                    className={`${isActive ? 'bg-[#236c2a] text-white' : 'text-neutral-700 hover:bg-neutral-100'} rounded-lg px-4 py-3 flex items-center gap-3 transition-colors text-sm`}>
                    <span className="material-symbols-outlined text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button onClick={handleLogout} className="w-full text-left text-neutral-700 px-4 py-3 flex items-center gap-3 hover:bg-neutral-100 rounded-lg transition-colors text-sm">
                <span className="material-symbols-outlined text-lg">logout</span>
                <span>Đăng xuất</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 flex-col bg-white z-40">
        {/* Logo Header */}
        <div className="flex items-center px-5 py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-12 w-auto object-contain" />
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 p-3 flex-grow">
          {ADMIN_NAV.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`${isActive ? 'bg-[#236c2a] text-white' : 'text-neutral-700 hover:bg-neutral-100'} rounded-lg px-4 py-3 flex items-center gap-3 transition-colors text-sm`}>
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section — cài đặt + đăng xuất neo chung ở đáy */}
        <div className="p-3 border-t border-neutral-200 flex flex-col gap-1">
          {ADMIN_FOOTER_NAV.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`${isActive ? 'bg-[#236c2a] text-white' : 'text-neutral-700 hover:bg-neutral-100'} rounded-lg px-4 py-3 flex items-center gap-3 transition-colors text-sm`}>
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button onClick={handleLogout}
            className="w-full text-left text-neutral-700 px-4 py-3 flex items-center gap-3 hover:bg-neutral-100 rounded-lg transition-colors text-sm">
            <span className="material-symbols-outlined text-lg">logout</span>
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64 pt-16 lg:pt-0 min-h-screen flex flex-col bg-[#FAFBF9]">
        {/* TopAppBar - Desktop */}
        <header className="hidden lg:flex justify-between items-center w-full px-6 h-16 sticky top-0 z-30 bg-[#FAFBF9]/95 backdrop-blur-sm border-b border-neutral-200/60">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-[#236c2a] text-base">{currentPageLabel}</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Chuông thông báo — khu admin không render PublicHeader nên trước đây
                không có lối nào thấy được thông báo, dù backend vẫn đang gửi. */}
            <NotificationBell />

            {/* User Info */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-neutral-800">{user.fullName}</p>
                <p className="text-xs text-neutral-500">Quản trị viên</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#236c2a] overflow-hidden flex items-center justify-center">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(user.avatarUrl)} alt={user.fullName} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-white">{user.fullName?.charAt(0).toUpperCase()}</span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Canvas */}
        <div className="flex-grow p-4 lg:p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
