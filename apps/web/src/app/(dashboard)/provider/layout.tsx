'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { UserRole } from '@foodresq/types';
import ShipperOfferWatcher from '@/components/deliveries/ShipperOfferWatcher';
import FaceEnrollmentGate from '@/components/shared/FaceEnrollmentGate';

const PROVIDER_NAV = [
  { href: '/provider', label: 'Cửa hàng', icon: 'storefront' },
  { href: '/provider/orders', label: 'Đơn hàng', icon: 'receipt_long' },
  { href: '/provider/scan', label: 'Quét QR', icon: 'qr_code_scanner' },
  { href: '/campaigns', label: 'Bếp ăn cộng đồng', icon: 'soup_kitchen' },
];

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <div className="min-h-screen bg-[#fcf9f2] font-body-md">
      {user.role === UserRole.VOLUNTEER && <ShipperOfferWatcher />}
      <FaceEnrollmentGate />

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <Link
            href="/"
            aria-label="Về trang chủ"
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[#236c2a]">arrow_back</span>
          </Link>
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[#236c2a]">menu</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-8 w-auto object-contain" />
        </div>
        <div className="w-10 h-10 rounded-full bg-[#236c2a] overflow-hidden flex items-center justify-center">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.fullName} className="w-full h-full object-cover" />
          ) : (
            <span className="font-bold text-white">{user.fullName?.charAt(0).toUpperCase()}</span>
          )}
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
              {PROVIDER_NAV.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                    className={`${isActive ? 'bg-emerald-50 text-emerald-800' : 'text-neutral-700 hover:bg-neutral-100'} rounded-xl px-4 py-3 flex items-center gap-3 transition-colors text-sm font-semibold`}>
                    <span className="material-symbols-outlined text-lg" style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-3">
              <button onClick={handleLogout} className="w-full text-left text-neutral-700 px-4 py-3 flex items-center gap-3 hover:bg-neutral-100 rounded-lg transition-colors text-sm">
                <span className="material-symbols-outlined text-lg">logout</span>
                <span>Đăng xuất</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar - nền trắng */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 flex-col bg-white z-40">
        {/* Logo Header - không border dưới */}
        <div className="flex items-center px-5 py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-12 w-auto object-contain" />
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 p-3 flex-grow">
          {PROVIDER_NAV.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/provider' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={`${isActive ? 'bg-[#236c2a] text-white' : 'text-neutral-700 hover:bg-neutral-100'} rounded-lg px-4 py-3 flex items-center gap-3 transition-colors text-sm`}>
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="p-3">
          <button onClick={handleLogout}
            className="w-full text-left text-neutral-700 px-4 py-3 flex items-center gap-3 hover:bg-neutral-100 rounded-lg transition-colors text-sm">
            <span className="material-symbols-outlined text-lg">logout</span>
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content - nền xanh nhạt */}
      <div className="lg:ml-64 pt-16 lg:pt-0 min-h-screen flex flex-col bg-[#f0f7f3]">
        {/* TopAppBar - Desktop - nút Back ở góc trên tay trái, user info ở tay phải */}
        <header className="hidden lg:flex justify-between items-center w-full px-6 h-16 sticky top-0 z-30">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-neutral-700 hover:bg-white hover:text-[#236c2a] transition-colors"
            aria-label="Về trang chủ"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            <span>Về trang chủ</span>
          </Link>
          <div className="flex items-center gap-3">
            <button className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-full transition-colors">
              <span className="material-symbols-outlined text-neutral-700">notifications</span>
            </button>
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