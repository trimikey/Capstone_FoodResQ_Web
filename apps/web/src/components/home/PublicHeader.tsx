'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useMe } from '@/hooks/useProfile';
import { UserRole } from '@foodresq/types';
import NotificationBell from '@/components/shared/NotificationBell';

// Dropdown dashboard menu theo vai trò
function dashboardLinksFor(role?: string, isCharityOrg?: boolean): { href: string; icon: string; label: string }[] {
  if (role === UserRole.ADMIN) {
    return [
      { href: '/admin', icon: 'dashboard', label: 'Bảng Quản trị' },
    ];
  }
  if (role === UserRole.PROVIDER) {
    return [
      { href: '/provider', icon: 'storefront', label: 'Cửa hàng của tôi' },
      { href: '/provider/scan', icon: 'qr_code_scanner', label: 'Quét QR' },
      { href: '/campaigns', icon: 'soup_kitchen', label: 'Bếp ăn cộng đồng' },
    ];
  }
  if (role === UserRole.VOLUNTEER) {
    return [
      { href: '/deliveries', icon: 'local_shipping', label: 'Giao hàng' },
      { href: '/deliveries/history', icon: 'history', label: 'Lịch sử giao hàng' },
      { href: '/campaigns', icon: 'volunteer_activism', label: 'Bếp ăn' },
    ];
  }
  // receiver / khách
  const links = [
    { href: '/reservations', icon: 'bookmark', label: 'Đơn nhận của tôi' },
    { href: '/history', icon: 'history', label: 'Lịch sử đơn hàng' },
  ];
  // Tổ chức từ thiện (receiver + isCharityOrg) → thêm Quản lý chiến dịch
  if (isCharityOrg) {
    links.unshift({ href: '/campaigns', icon: 'soup_kitchen', label: 'Quản lý chiến dịch' });
  }
  return links;
}

/**
 * Header công khai cho trang chủ (root /). Thích ứng theo trạng thái đăng nhập:
 * - Chưa đăng nhập: nút Đăng nhập / Đăng ký.
 * - Đã đăng nhập: nav + avatar + đăng xuất.
 * Trang chủ là public nên cần header riêng (không dùng header của (dashboard)).
 */
export default function PublicHeader() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  // Tránh lệch hydration: zustand-persist chỉ có giá trị sau khi mount ở client
  const [mounted, setMounted] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    // Check initial scroll position
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isAuthed = mounted && !!user;
  const isSolid = scrolled || pathname !== '/';
  // Lấy cờ tổ chức từ thiện để thêm link Quản lý chiến dịch (chỉ fetch khi đã đăng nhập)
  const { data: me } = useMe(isAuthed);
  const isCharityOrg = !!me?.receiver?.isCharityOrg;

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header 
      className={`fixed left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300 ${
        isSolid 
          ? 'top-0 w-full rounded-none bg-white/95 backdrop-blur-md border-b border-neutral-200 shadow-[0_4px_20px_rgba(0,0,0,0.05)]' 
          : 'top-6 w-[95%] max-w-5xl rounded-full bg-transparent border border-transparent shadow-none'
      }`}
    >
      <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_FoodResQ.png" alt="FoodResQ Logo" className="h-7 w-auto object-contain" />
        </Link>

        {/* Nav (Luôn hiển thị public links) */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/"
            className={`relative py-1.5 px-3 text-[14px] font-semibold whitespace-nowrap transition-colors ${
              pathname === '/' ? 'text-emerald-800' : 'text-neutral-600 hover:text-emerald-700'
            }`}
          >
            Trang chủ
            {pathname === '/' && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-700 rounded-full" />}
          </Link>
          <Link
            href="/listings"
            className={`relative py-1.5 px-3 text-[14px] font-semibold whitespace-nowrap transition-colors ${
              pathname === '/listings' ? 'text-emerald-800' : 'text-neutral-600 hover:text-emerald-700'
            }`}
          >
            Tìm thực phẩm
            {pathname === '/listings' && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-700 rounded-full" />}
          </Link>
          <Link
            href="/#about"
            className="relative py-1.5 px-3 text-[14px] font-semibold whitespace-nowrap transition-colors text-neutral-600 hover:text-emerald-700"
          >
            Về chúng tôi
          </Link>
          <Link
            href="/#contact"
            className="relative py-1.5 px-3 text-[14px] font-semibold whitespace-nowrap transition-colors text-neutral-600 hover:text-emerald-700"
          >
            Liên hệ
          </Link>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-3 shrink-0">
          {!mounted ? (
            // placeholder tránh nhảy layout trước khi biết trạng thái auth
            <div className="w-24 h-9" />
          ) : isAuthed ? (
            <>
            <NotificationBell />
            <div className="relative flex items-center gap-2 h-full py-1.5">
              {/* Lớp phủ bắt click ra ngoài để đóng menu */}
              {isProfileMenuOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setIsProfileMenuOpen(false)} />
              )}
              <div
                onClick={() => setIsProfileMenuOpen((o) => !o)}
                className="relative z-50 flex items-center gap-2 cursor-pointer hover:bg-neutral-100/50 p-1 rounded-full transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-[#faf9f8] flex items-center justify-center border border-neutral-200 overflow-hidden">
                  {user!.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user!.avatarUrl} alt={user!.fullName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-bold text-xs text-[#236c2a]">
                      {user!.fullName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="hidden lg:block leading-tight text-left pr-2">
                  <p className="text-[13px] font-medium text-on-surface max-w-[100px] truncate">{user!.fullName}</p>
                </div>
                <span className="material-symbols-outlined text-[16px] text-neutral-400">arrow_drop_down</span>
              </div>

              {isProfileMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-155 text-left">
                  <div className="px-4 py-2 border-b border-neutral-100">
                    <p className="font-bold text-xs text-neutral-500 uppercase tracking-wider">Tài khoản</p>
                  </div>
                  <div className="flex flex-col">
                    <Link
                      href="/profile"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 text-sm font-semibold text-neutral-800 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px] text-neutral-500">person</span>
                      <span>Hồ sơ cá nhân</span>
                    </Link>

                    {dashboardLinksFor(user?.role, isCharityOrg).map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 text-sm font-semibold text-neutral-800 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[20px] text-neutral-500">{link.icon}</span>
                        <span>{link.label}</span>
                      </Link>
                    ))}

                    <button
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        handleLogout();
                      }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-rose-50 text-sm font-semibold text-rose-600 transition-colors text-left border-t border-neutral-100 w-full"
                    >
                      <span className="material-symbols-outlined text-[20px]">logout</span>
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-50 rounded-xl transition-colors"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="px-5 py-2 text-sm font-bold text-white bg-emerald-800 hover:bg-emerald-950 rounded-xl transition-colors shadow-sm"
              >
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
