'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { UserRole } from '@foodresq/types';

const NAV_ITEMS = [
  { href: '/listings', icon: 'restaurant', label: 'Tìm thực phẩm', roles: null },
  { href: '/reservations', icon: 'bookmark', label: 'Đặt chỗ của tôi', roles: null },
  { href: '/deliveries', icon: 'local_shipping', label: 'Giao hàng', roles: [UserRole.VOLUNTEER] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  if (!user) return null;

  const navItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role as UserRole),
  );

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-surface-container-low border-r border-outline-variant/20 sticky top-0 h-screen shrink-0">
        {/* Logo */}
        <div className="p-lg border-b border-outline-variant/20">
          <h1 className="font-headline-md text-headline-md text-primary">FoodResQ</h1>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-xs">Kết nối cộng đồng</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-md space-y-xs overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-md px-md py-3 rounded-xl font-label-lg text-label-lg transition-all ${
                pathname === item.href
                  ? 'bg-primary/10 text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={pathname === item.href ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User profile */}
        <div className="p-md border-t border-outline-variant/20">
          <div className="flex items-center gap-md p-sm rounded-xl">
            <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center shrink-0">
              <span className="font-label-lg text-label-lg text-on-primary-container">
                {user.fullName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-label-lg text-label-lg text-on-surface truncate">{user.fullName}</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">{user.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full mt-xs flex items-center gap-md px-md py-2 rounded-xl text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors font-label-lg text-label-lg"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-surface border-b border-outline-variant/20 px-container-margin py-md flex items-center justify-between">
        <h1 className="font-headline-md text-headline-md text-primary">FoodResQ</h1>
        <div className="flex items-center gap-md">
          <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center">
            <span className="font-label-sm text-label-sm text-on-primary-container">
              {user.fullName.charAt(0).toUpperCase()}
            </span>
          </div>
          <button onClick={handleLogout} className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-y-auto pt-16 md:pt-0 pb-20 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-outline-variant/20 flex">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center py-3 gap-xs transition-colors ${
              pathname === item.href ? 'text-primary' : 'text-on-surface-variant'
            }`}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={pathname === item.href ? { fontVariationSettings: "'FILL' 1" } : {}}
            >
              {item.icon}
            </span>
            <span className="font-label-sm text-label-sm">{item.label.split(' ')[0]}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
