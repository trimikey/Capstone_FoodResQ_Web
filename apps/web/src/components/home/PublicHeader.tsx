'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { UserRole } from '@foodresq/types';

const NAV_LINKS = [
  { href: '/', label: 'Trang chủ' },
  { href: '/listings', label: 'Tìm thực phẩm' },
  { href: '/#about', label: 'Về chúng tôi' },
  { href: '/#contact', label: 'Liên hệ' },
];

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

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header 
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl rounded-full transition-all duration-300 ${
        scrolled 
          ? 'bg-white/95 backdrop-blur-md border border-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.06)]' 
          : 'bg-transparent border border-transparent shadow-none'
      }`}
    >
      <div className="px-6 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_FoodResQ.png" alt="FoodResQ Logo" className="h-7 w-auto object-contain" />
        </Link>

        {/* Nav (chỉ hiện khi đã đăng nhập) */}
        {isAuthed && (
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative py-1.5 px-3 text-[14px] font-semibold whitespace-nowrap transition-colors ${
                  pathname === item.href
                    ? 'text-emerald-800'
                    : 'text-neutral-600 hover:text-emerald-700'
                }`}
              >
                {item.label}
                {pathname === item.href && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-700 rounded-full" />
                )}
              </Link>
            ))}
          </nav>
        )}

        {/* Right actions */}
        <div className="flex items-center gap-3 shrink-0">
          {!mounted ? (
            // placeholder tránh nhảy layout trước khi biết trạng thái auth
            <div className="w-24 h-9" />
          ) : isAuthed ? (
            <div 
              className="relative flex items-center gap-2 h-full py-1.5"
              onMouseEnter={() => setIsProfileMenuOpen(true)}
              onMouseLeave={() => setIsProfileMenuOpen(false)}
            >
              <div className="flex items-center gap-2 cursor-pointer hover:bg-neutral-100/50 p-1 rounded-full transition-colors">
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

                    <Link
                      href="/reservations"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 text-sm font-semibold text-neutral-800 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px] text-neutral-500">bookmark</span>
                      <span>Đơn nhận của tôi</span>
                    </Link>
                    
                    <Link
                      href="/history"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 text-sm font-semibold text-neutral-800 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px] text-neutral-500">history</span>
                      <span>Lịch sử đơn hàng</span>
                    </Link>

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
