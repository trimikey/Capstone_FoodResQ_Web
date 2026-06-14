'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { UserRole } from '@foodresq/types';

const NAV_LINKS = [
  { href: '/', label: 'Trang chủ' },
  { href: '/listings', label: 'Tìm thực phẩm' },
  { href: '/reservations', label: 'Đơn hàng của tôi' },
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
  useEffect(() => setMounted(true), []);

  const isAuthed = mounted && !!user;

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-neutral-200/70">
      <div className="w-full px-6 md:px-16 lg:px-24 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <h1 className="font-extrabold text-xl text-emerald-800 tracking-tight">FoodResQ</h1>
        </Link>

        {/* Nav (chỉ hiện khi đã đăng nhập) */}
        {isAuthed && (
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative py-5 text-sm font-bold transition-colors ${
                  pathname === item.href
                    ? 'text-emerald-800'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {item.label}
                {pathname === item.href && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-700 rounded-full" />
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
            <>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-200 overflow-hidden">
                  {user!.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user!.avatarUrl} alt={user!.fullName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-bold text-sm text-emerald-800">
                      {user!.fullName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="hidden lg:block leading-tight">
                  <p className="text-sm font-bold text-neutral-900 max-w-[120px] truncate">{user!.fullName}</p>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                    {user!.role === UserRole.RECEIVER
                      ? 'Người nhận'
                      : user!.role === UserRole.PROVIDER
                        ? 'Cửa hàng'
                        : 'Tình nguyện'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-neutral-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                title="Đăng xuất"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
              </button>
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
