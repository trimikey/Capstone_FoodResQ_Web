'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { UserRole } from '@foodresq/types';
import PublicHeader from '@/components/home/PublicHeader';

const NAV_ITEMS: { href: string; icon: string; label: string; roles: UserRole[] | null }[] = [
  { href: '/listings', icon: 'restaurant', label: 'Tìm thực phẩm', roles: null },
  { href: '/reservations', icon: 'bookmark', label: 'Đơn nhận của tôi', roles: null },
  { href: '/history', icon: 'history', label: 'Lịch sử', roles: null },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  // Hooks phải đứng trước mọi early-return — số hook mỗi lần render phải cố định
  const [searchValue, setSearchValue] = useState('');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  if (!user) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/listings?q=${encodeURIComponent(searchValue)}`);
  };

  const navItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role as UserRole),
  );

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#fcf9f2]">
      {/* Desktop Top Header replaced with PublicHeader */}
      <div className="hidden md:block">
        <PublicHeader />
      </div>

      {/* Mobile Top Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-surface border-b border-outline-variant/20 px-container-margin py-md flex items-center justify-between h-16">
        <h1 className="font-headline-md text-headline-md text-primary font-bold">FoodResQ</h1>
        <div className="flex items-center gap-md">
          <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center">
            <span className="font-label-sm text-label-sm text-on-primary-container font-semibold">
              {user.fullName.charAt(0).toUpperCase()}
            </span>
          </div>
          <button onClick={handleLogout} className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col pt-16 md:pt-[104px] pb-16 md:pb-0 min-h-screen">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-outline-variant/20 flex shadow-lg">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center py-2 gap-xs transition-colors ${
              pathname === item.href ? 'text-primary' : 'text-on-surface-variant'
            }`}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={pathname === item.href ? { fontVariationSettings: "'FILL' 1" } : {}}
            >
              {item.icon}
            </span>
            <span className="font-label-sm text-[10px]">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
