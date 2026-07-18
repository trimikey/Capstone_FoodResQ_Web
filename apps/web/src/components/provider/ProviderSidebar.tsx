'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* Hallmark · component: provider-sidebar · genre: editorial · theme: studio
 * voice: nav · active treatment: filled icon + left-rule · purpose: persistent side rail
 */

export interface SidebarItem {
  href: string;
  label: string;
  icon: string;
  badge?: number | string;
  hint?: string;
}

const PROVIDER_ITEMS: SidebarItem[] = [
  { href: '/provider', label: 'Cửa hàng', icon: 'storefront', hint: 'Tổng quan & tin đăng' },
  { href: '/provider/orders', label: 'Đơn hàng', icon: 'receipt_long', hint: 'Đơn nhận & theo dõi' },
  { href: '/provider/scan', label: 'Quét QR', icon: 'qr_code_scanner', hint: 'Xác nhận lấy hàng' },
  { href: '/campaigns', label: 'Bếp ăn', icon: 'soup_kitchen', hint: 'Chiến dịch cộng đồng' },
  { href: '/profile', label: 'Hồ sơ', icon: 'person', hint: 'Cửa hàng & tài khoản' },
];

interface Props {
  businessName?: string;
  version?: string;
}

export default function ProviderSidebar({ businessName, version = 'FoodResQ v1.0' }: Props) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:shrink-0 md:sticky md:top-[104px] md:self-start md:h-[calc(100vh-104px)] md:border-r md:border-neutral-150 bg-white">
      <div className="px-5 pt-6 pb-5 border-b border-neutral-150">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-450">Vai trò của bạn</p>
        <p className="mt-1 text-base font-extrabold text-neutral-900 truncate">{businessName ?? 'Nhà cung cấp'}</p>
        <p className="text-xs text-neutral-500 mt-0.5">Quản lý cửa hàng thực phẩm</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {PROVIDER_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/provider' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                active
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-emerald-700" />}
              <span
                className={`material-symbols-outlined text-[20px] shrink-0 ${
                  active ? 'text-emerald-700' : 'text-neutral-500 group-hover:text-neutral-700'
                }`}
                style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold leading-tight">{item.label}</span>
                {item.hint && <span className="block text-[11px] text-neutral-450 truncate">{item.hint}</span>}
              </span>
              {item.badge != null && (
                <span className="px-1.5 min-w-[20px] h-[20px] rounded-full bg-honey-200 text-honey-700 text-[10px] font-extrabold flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-neutral-150">
        <div className="flex items-center gap-2 text-[11px] text-neutral-450">
          <span className="material-symbols-outlined text-[14px]">eco</span>
          <span>{version}</span>
        </div>
      </div>
    </aside>
  );
}
