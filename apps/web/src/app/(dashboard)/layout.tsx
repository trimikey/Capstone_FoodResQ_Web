'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useMe } from '@/hooks/useProfile';
import { UserRole } from '@foodresq/types';
import PublicHeader from '@/components/home/PublicHeader';
import ShipperOfferWatcher from '@/components/deliveries/ShipperOfferWatcher';
import FaceEnrollmentGate from '@/components/shared/FaceEnrollmentGate';

// Bottom nav (mobile) theo vai trò
function navItemsFor(role: UserRole, isCharityOrg?: boolean): { href: string; icon: string; label: string }[] {
  if (role === UserRole.ADMIN) {
    return [
      { href: '/admin', icon: 'dashboard', label: 'Quản trị' },
      { href: '/profile', icon: 'person', label: 'Hồ sơ' },
    ];
  }
  if (role === UserRole.PROVIDER) {
    return [
      { href: '/provider', icon: 'storefront', label: 'Cửa hàng' },
      { href: '/provider/orders', icon: 'receipt_long', label: 'Đơn hàng' },
      { href: '/provider/scan', icon: 'qr_code_scanner', label: 'Quét QR' },
      { href: '/campaigns', icon: 'soup_kitchen', label: 'Bếp ăn' },
      { href: '/profile', icon: 'person', label: 'Hồ sơ' },
    ];
  }
  if (role === UserRole.VOLUNTEER) {
    return [
      { href: '/listings', icon: 'restaurant', label: 'Tìm' },
      { href: '/deliveries', icon: 'local_shipping', label: 'Giao hàng' },
      { href: '/recipes', icon: 'menu_book', label: 'Công thức' },
      { href: '/profile', icon: 'person', label: 'Hồ sơ' },
    ];
  }
  // Tổ chức từ thiện → có thêm Chiến dịch
  if (isCharityOrg) {
    return [
      { href: '/listings', icon: 'restaurant', label: 'Tìm' },
      { href: '/campaigns', icon: 'soup_kitchen', label: 'Chiến dịch' },
      { href: '/reservations', icon: 'bookmark', label: 'Đơn nhận' },
      { href: '/profile', icon: 'person', label: 'Hồ sơ' },
    ];
  }
  return [
    { href: '/listings', icon: 'restaurant', label: 'Tìm thực phẩm' },
    { href: '/reservations', icon: 'bookmark', label: 'Đơn nhận' },
    { href: '/history', icon: 'history', label: 'Lịch sử' },
  ];
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  // Đăng ký nhận push FCM khi đã đăng nhập (no-op nếu chưa cấu hình Firebase)
  useEffect(() => {
    if (!user) return;
    void import('@/lib/push').then((m) => m.registerPush());
  }, [user]);

  const { data: me } = useMe(!!user);

  if (!user) return null;

  const navItems = navItemsFor(user.role as UserRole, !!me?.receiver?.isCharityOrg);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#fcf9f2]">
      {/* Popup nhận đơn giao toàn cục cho shipper (hiện ở mọi trang) */}
      {user.role === UserRole.VOLUNTEER && <ShipperOfferWatcher />}

      {/* Cổng eKYC: tài khoản social login chưa có khuôn mặt → bắt enroll ngay,
          chặn mọi trang cho đến khi xong (BE cũng chặn đặt chỗ/nhận đơn) */}
      <FaceEnrollmentGate />

      {/* Desktop Top Header replaced with PublicHeader */}
      {!pathname.startsWith('/admin') && (
        <div className="hidden md:block">
          <PublicHeader />
        </div>
      )}

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
      <main className={`flex-1 flex flex-col ${pathname.startsWith('/admin') ? 'md:pt-0' : 'pt-16 md:pt-[104px]'} pb-16 md:pb-0 min-h-screen`}>
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
