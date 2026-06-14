'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { UserRole } from '@foodresq/types';

const NAV_ITEMS = [
  { href: '/listings', icon: 'restaurant', label: 'Tìm thực phẩm', roles: null },
  { href: '/reservations', icon: 'bookmark', label: 'Đơn hàng của tôi', roles: null },
  { href: '/deliveries', icon: 'local_shipping', label: 'Giao hàng', roles: [UserRole.VOLUNTEER] },
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
    <div className="flex flex-col min-h-screen bg-surface">
      {/* Desktop Top Header */}
      <header className="hidden md:flex items-center justify-between px-6 py-3 bg-surface-container-lowest border-b border-outline-variant/15 sticky top-0 z-50 h-16">
        {/* Left: Logo & Search */}
        <div className="flex items-center gap-6 flex-1 max-w-xl">
          <Link href="/listings" className="flex items-center gap-2 shrink-0">
            <h1 className="font-headline-md text-headline-md text-primary font-bold tracking-tight">FoodResQ</h1>
          </Link>
          
          {/* Header Search Input */}
          <form onSubmit={handleSearch} className="relative w-full max-w-sm">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Tìm kiếm niềm hạnh phúc..."
              className="w-full pl-11 pr-4 py-2 bg-surface-container-low border-none rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-low/80 font-body-md text-sm transition-all placeholder:text-outline-variant"
            />
          </form>
        </div>

        {/* Center: Navigation Links */}
        <nav className="flex items-center gap-6 px-4 h-full shrink-0">
          <Link
            href="/"
            className={`relative py-5 font-label-lg text-label-lg transition-all ${
              pathname === '/'
                ? 'text-primary font-bold'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Trang chủ
            {pathname === '/' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </Link>
          
          <Link
            href="/listings"
            className={`relative py-5 font-label-lg text-label-lg transition-all ${
              pathname.startsWith('/listings')
                ? 'text-primary font-bold'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Tìm thực phẩm
            {pathname.startsWith('/listings') && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </Link>

          <Link
            href="/reservations"
            className={`relative py-5 font-label-lg text-label-lg transition-all ${
              pathname === '/reservations'
                ? 'text-primary font-bold'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Đơn hàng của tôi
            {pathname === '/reservations' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </Link>

          {user.role === UserRole.VOLUNTEER && (
            <Link
              href="/deliveries"
              className={`relative py-5 font-label-lg text-label-lg transition-all ${
                pathname === '/deliveries'
                  ? 'text-primary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Giao hàng
              {pathname === '/deliveries' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </Link>
          )}
        </nav>

        {/* Right: Actions & Profile */}
        <div className="flex items-center gap-4 justify-end flex-1">
          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors relative"
            >
              <span className="material-symbols-outlined text-[24px]">notifications</span>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
            </button>

            {isNotificationsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)} />
                <div className="absolute right-0 mt-2 w-80 bg-surface border border-outline-variant/20 rounded-2xl shadow-xl z-50 py-3 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 pb-2 border-b border-outline-variant/15 flex items-center justify-between">
                    <h4 className="font-label-lg text-sm text-on-surface font-bold">Thông báo</h4>
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">3 mới</span>
                  </div>
                  
                  <div className="max-h-[300px] overflow-y-auto divide-y divide-outline-variant/10 text-left">
                    <div className="p-4 hover:bg-surface-container-low transition-colors cursor-pointer text-xs space-y-1">
                      <p className="font-semibold text-on-surface leading-normal">
                        Tiệm Bánh Mặt Trời vừa đăng một phần bánh ngọt mới!
                      </p>
                      <p className="text-[10px] text-on-surface-variant/70">10 phút trước</p>
                    </div>
                    <div className="p-4 hover:bg-surface-container-low transition-colors cursor-pointer text-xs space-y-1">
                      <p className="font-semibold text-on-surface leading-normal">
                        Tình nguyện viên Nguyễn Văn A đã nhận đơn giao hàng của bạn.
                      </p>
                      <p className="text-[10px] text-on-surface-variant/70">32 phút trước</p>
                    </div>
                    <div className="p-4 hover:bg-surface-container-low transition-colors cursor-pointer text-xs space-y-1">
                      <p className="font-semibold text-on-surface leading-normal">
                        Đơn đặt trước Bánh su kem của bạn đã hoàn thành tại cửa hàng.
                      </p>
                      <p className="text-[10px] text-on-surface-variant/70">1 ngày trước</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User profile dropdown trigger */}
          <div className="relative">
            <div 
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-sm pl-sm border-l border-outline-variant/20 cursor-pointer hover:bg-surface-container-low p-1.5 rounded-2xl transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-primary-container overflow-hidden flex items-center justify-center shrink-0 border border-primary/10">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.fullName} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-label-lg text-label-lg text-on-primary-container font-semibold">
                    {user.fullName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              
              <div className="hidden lg:block text-left max-w-[120px]">
                <p className="font-label-lg text-label-lg text-on-surface truncate leading-none mb-[2px]">{user.fullName}</p>
                <span className="text-[10px] text-on-surface-variant/75 uppercase tracking-wider font-semibold">
                  {user.role === UserRole.RECEIVER ? 'Người nhận' : user.role === UserRole.PROVIDER ? 'Cửa hàng' : 'Tình nguyện'}
                </span>
              </div>

              <span className="material-symbols-outlined text-[18px] text-on-surface-variant ml-1">arrow_drop_down</span>
            </div>

            {isProfileMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsProfileMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-surface border border-outline-variant/20 rounded-2xl shadow-xl z-50 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 text-left">
                  <div className="px-4 py-2 border-b border-outline-variant/10">
                    <p className="font-bold text-xs text-on-surface-variant uppercase tracking-wider">Tài khoản</p>
                  </div>
                  <div className="flex flex-col">
                    <Link
                      href="/profile"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low text-sm font-semibold text-on-surface transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">person</span>
                      <span>Hồ sơ cá nhân</span>
                    </Link>
                    
                    <Link
                      href="/reservations?tab=history"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low text-sm font-semibold text-on-surface transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">history</span>
                      <span>Lịch sử đơn hàng</span>
                    </Link>

                    <button
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        handleLogout();
                      }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-error/10 text-sm font-semibold text-error transition-colors text-left border-t border-outline-variant/10 w-full"
                    >
                      <span className="material-symbols-outlined text-[20px]">logout</span>
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

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
      <main className="flex-1 flex flex-col pt-16 md:pt-0 pb-16 md:pb-0 min-h-[calc(100vh-64px)]">
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
