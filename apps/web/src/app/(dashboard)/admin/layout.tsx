'use client';

import Link from 'next/link';
import { mediaUrl } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { UserRole } from '@foodresq/types';
import FaceEnrollmentGate from '@/components/shared/FaceEnrollmentGate';
import NotificationBell from '@/components/shared/NotificationBell';

/**
 * Sidebar chia theo BA nhóm việc thật của admin, thay vì tám mục ngang hàng:
 *  - Theo dõi: nhìn là hiểu chuyện gì đang diễn ra (tổng quan, bản đồ).
 *  - Vận hành: các đối tượng nghiệp vụ phải xử lý hằng ngày (đơn, chiến dịch, tin đăng).
 *  - Hệ thống: dữ liệu nền và con người (danh mục, khiếu nại, tài khoản).
 *
 * "Quản lý Quyên góp" đổi thành "Đơn nhận thực phẩm": trang đó liệt kê các ĐƠN ĐẶT
 * CHỖ của người nhận (confirmed/picked_up/completed), không phải khoản quyên góp —
 * tên cũ khiến admin tìm quyên góp chiến dịch ở nhầm chỗ.
 */
const ADMIN_NAV_GROUPS: Array<{
  title: string;
  items: Array<{ href: string; label: string; icon: string }>;
}> = [
  {
    title: 'Theo dõi',
    items: [
      { href: '/admin', label: 'Tổng quan thống kê', icon: 'dashboard' },
      { href: '/admin/map', label: 'Bản đồ trực tiếp', icon: 'map' },
    ],
  },
  {
    title: 'Vận hành',
    items: [
      { href: '/admin/donations', label: 'Đơn nhận thực phẩm', icon: 'receipt_long' },
      { href: '/admin/campaigns', label: 'Quản lý Chiến dịch', icon: 'soup_kitchen' },
      { href: '/admin/food', label: 'Tin đăng thực phẩm', icon: 'restaurant_menu' },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { href: '/admin/catalog', label: 'Danh mục thực phẩm', icon: 'category' },
      { href: '/admin/reports', label: 'Xử lý khiếu nại', icon: 'warning' },
      { href: '/admin/users', label: 'Quản lý tài khoản', icon: 'manage_accounts' },
    ],
  },
];

/** Danh sách phẳng — cho tra tiêu đề trang và menu mobile. */
const ADMIN_NAV = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

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
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated()) {
      router.push('/login');
    }
  }, [mounted, isAuthenticated, router]);

  useEffect(() => {
    if (user) {
      void import('@/lib/push').then((m) => m.registerPush());
    }
  }, [user]);

  if (!mounted || !user) {
    return (
      <div className="h-screen overflow-hidden bg-[#FAFBF9] flex">
        {/* Skeleton sidebar */}
        <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 flex-col bg-white border-r border-neutral-100 z-40">
          <div className="px-5 py-6">
            <div className="h-10 w-32 bg-neutral-100 rounded-xl animate-pulse" />
          </div>
          <nav className="flex flex-col gap-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-11 rounded-lg bg-neutral-100 animate-pulse" />
            ))}
          </nav>
        </aside>
        {/* Skeleton content */}
        <div className="lg:ml-64 flex-1 flex flex-col">
          <header className="hidden lg:flex h-16 border-b border-neutral-200/60 px-6 items-center gap-3">
            <div className="h-5 w-40 bg-neutral-100 rounded-lg animate-pulse" />
          </header>
          <div className="flex-1 p-6 space-y-4">
            <div className="h-8 w-64 bg-neutral-100 rounded-xl animate-pulse" />
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 bg-neutral-100 rounded-2xl animate-pulse" />
              ))}
            </div>
            <div className="h-64 bg-neutral-100 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // Tìm ở cả hai danh sách — nếu chỉ tra ADMIN_NAV thì trang Cài đặt (đã chuyển
  // xuống khối chân sidebar) sẽ mất tiêu đề và rơi về nhãn mặc định.
  const currentPageLabel =
    [...ADMIN_NAV, ...ADMIN_FOOTER_NAV].find((n) => pathname === n.href)?.label ?? 'Quản trị viên';

  return (
    <div className="h-screen overflow-hidden bg-[#FAFBF9] font-body-md flex flex-col">
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

        {/* Navigation — nhóm theo loại việc để 8 mục không nằm ngang hàng nhau */}
        <nav className="flex flex-col gap-1 p-3 flex-grow overflow-y-auto">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-2">
              <p className="px-4 pb-1 pt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                {group.title}
              </p>
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href}
                    className={`${isActive ? 'bg-[#236c2a] text-white' : 'text-neutral-700 hover:bg-neutral-100'} rounded-lg px-4 py-3 flex items-center gap-3 transition-colors text-sm`}>
                    <span className="material-symbols-outlined text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
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
      <div className="lg:ml-64 pt-16 lg:pt-0 h-screen flex flex-col bg-[#FAFBF9]">
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
        <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
