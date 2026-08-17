'use client';

import Link from 'next/link';
import { mediaUrl } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useMe } from '@/hooks/useProfile';

const ROW_BASE =
  'rounded-xl px-4 py-3 flex items-center gap-3 transition-colors text-sm font-semibold';

const NAV = [
  { href: '/deliveries', icon: 'dashboard', label: 'Tổng quan' },
  { href: '/deliveries/bulk', icon: 'local_shipping', label: 'Giao sỉ nhiều điểm' },
  { href: '/deliveries/history', icon: 'history', label: 'Lịch sử giao hàng' },
  { href: '/deliveries/ratings', icon: 'star', label: 'Đánh giá' },
];

/** Sidebar khu vực giao hàng của tình nguyện viên shipper. */
export default function ShipperSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuthStore();
  const { data: me } = useMe();
  const avatarSrc = mediaUrl(me?.avatarUrl ?? '');
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarSrc]);

  function handleLogout() {
    auth.logout();
    router.push('/login');
  }

  return (
    // Bắt đầu ngay dưới header chung (fixed, cao 104px) — để top-0 thì phần đầu bị che.
    <aside
      className="hidden lg:flex fixed left-0 top-[104px] h-[calc(100vh-104px)] w-56 flex-col border-r border-neutral-200 bg-white z-40"
      aria-label="Điều hướng giao hàng"
    >
      <div className="px-5 pt-6 mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          Tình nguyện viên
        </p>
        <p className="mt-1 text-[12px] font-bold leading-snug text-emerald-800">Trung tâm giao hàng</p>
      </div>

      <nav className="flex flex-col gap-1 px-3 flex-grow overflow-y-auto">
        {NAV.map((item) => {
          // `/deliveries` là trang gốc nên phải so khớp tuyệt đối, nếu không nó sẽ
          // sáng ở mọi trang con.
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`${ROW_BASE} ${
                isActive ? 'bg-emerald-50 text-emerald-800' : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}

        <Link href="/campaigns?tab=tasks" className={`${ROW_BASE} text-neutral-700 hover:bg-neutral-100`}>
          <span className="material-symbols-outlined text-[20px]">soup_kitchen</span>
          <span className="flex-1">Bếp ăn</span>
        </Link>
      </nav>

      <div className="border-t border-neutral-200">
        <div className="px-3 py-3">
          <button
            type="button"
            onClick={handleLogout}
            className={`${ROW_BASE} w-full text-left text-rose-600 hover:bg-rose-50`}
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span>Đăng xuất</span>
          </button>
        </div>

        {me?.fullName && (
          <div className="flex items-center gap-3 border-t border-neutral-200 px-5 py-4">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#4e9853] to-[#2a662e] font-bold text-white">
              {avatarSrc && !avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                    setAvatarFailed(true);
                  }}
                />
              ) : (
                <span>{me.fullName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{me.fullName}</p>
              <p className="truncate text-[11px] text-neutral-500">Tình nguyện viên giao hàng</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
