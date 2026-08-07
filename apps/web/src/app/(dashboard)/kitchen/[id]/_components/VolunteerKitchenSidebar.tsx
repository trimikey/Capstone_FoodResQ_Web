'use client';

import Link from 'next/link';
import { mediaUrl } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useMe } from '@/hooks/useProfile';
import type { MyTask } from '@/hooks/useCampaigns';
import NotificationBell from '@/components/shared/NotificationBell';

const ROW_BASE =
  'rounded-xl px-4 py-3 flex items-center gap-3 transition-colors text-sm font-semibold';

export default function VolunteerKitchenSidebar({ task }: { task: MyTask }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuthStore();
  const { data: me } = useMe();
  const basePath = `/kitchen/${task.campaign.id}`;
  const workspaceItems = [
    { href: basePath, icon: 'dashboard', label: 'Bảng điều khiển' },
    { href: `${basePath}/task`, icon: 'assignment_ind', label: 'Nhiệm vụ của tôi' },
    { href: `${basePath}/schedule`, icon: 'calendar_month', label: 'Lịch làm việc' },
  ];

  function handleLogout() {
    auth.logout();
    router.push('/login');
  }

  return (
    <aside
      className="hidden lg:flex fixed left-0 top-0 h-screen w-56 flex-col border-r border-neutral-200 bg-white z-40"
      aria-label="Điều hướng tình nguyện viên"
    >
      <Link href="/campaigns?tab=tasks" className="flex items-center px-5 py-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-10 w-auto object-contain" />
      </Link>

      <div className="px-5 mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          Tình nguyện viên
        </p>
        <p className="mt-1 line-clamp-2 text-[12px] font-bold leading-snug text-emerald-800">
          {task.campaign.title}
        </p>
      </div>

      <nav className="flex flex-col gap-1 px-3 flex-grow overflow-y-auto">
        {workspaceItems.map((item) => {
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

        <Link href="/profile" className={`${ROW_BASE} text-neutral-700 hover:bg-neutral-100`}>
          <span className="material-symbols-outlined text-[20px]">person</span>
          <span className="flex-1">Cá nhân</span>
        </Link>

        <NotificationBell variant="sidebar" />

        <Link
          href="/campaigns?tab=tasks"
          className={`${ROW_BASE} text-neutral-700 hover:bg-neutral-100`}
        >
          <span className="material-symbols-outlined text-[20px]">list_alt</span>
          <span className="flex-1">Tất cả chiến dịch</span>
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
              {me.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(me.avatarUrl)} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{me.fullName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{me.fullName}</p>
              <p className="truncate text-[11px] text-neutral-500">Đầu bếp tình nguyện</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
