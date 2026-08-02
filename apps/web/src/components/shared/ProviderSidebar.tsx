'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

interface SidebarItem {
  href: string;
  icon: string;
  label: string;
  tab?: string;
}

const ITEMS: SidebarItem[] = [
  { href: '/provider', icon: 'storefront', label: 'Cửa hàng' },
  { href: '/provider/orders', icon: 'receipt_long', label: 'Đơn hàng' },
  { href: '/provider/scan', icon: 'qr_code_scanner', label: 'Quét QR' },
  { href: '/campaigns', icon: 'soup_kitchen', label: 'Bếp ăn cộng đồng' },
];

/**
 * Sidebar bên trái dành cho role nhà cung cấp (provider).
 * Chỉ hiển thị trên màn hình >= md (mobile dùng bottom nav).
 */
export default function ProviderSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');

  return (
    <aside className="hidden md:flex md:flex-col w-56 shrink-0 sticky top-[104px] h-[calc(100vh-104px)] bg-white border-r border-neutral-200 px-3 py-5">
      <p className="px-3 mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
        Nhà cung cấp
      </p>
      <nav className="flex flex-col gap-1">
        {ITEMS.map((it) => {
          const active = pathname === it.href && (it.tab ? currentTab === it.tab : !currentTab);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                active
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {it.icon}
              </span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
