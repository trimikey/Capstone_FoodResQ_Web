'use client';

import { mediaUrl } from '@/lib/utils';

export type Section =
  | 'overview'
  | 'mine'
  | 'suppliers'
  | 'providers'
  | 'orders'
  | 'history'
  | 'tasks'
  | 'schedule'
  | 'browse';

interface CharitySidebarProps {
  section: Section;
  onSectionChange: (s: Section) => void;
  isCharity: boolean;
  isVolunteer: boolean;
  isProvider: boolean;
  onCreate: () => void;
  railEntries: Array<{ key: Section; label: string; icon: string; badge?: string | number }>;
  userFullName?: string;
  avatarUrl?: string | null;
  onLogout?: () => void;
}

/**
 * Desktop-only persistent sidebar cho /campaigns* — pattern giống /provider:
 *   - `fixed` ở viewport (trái, full-height).
 *   - Ẩn hoàn toàn trên mobile (<lg); layout (campaigns/layout.tsx) tự render
 *     mobile drawer riêng.
 *   - Main wrapper có `lg:ml-56` để né sidebar trên desktop.
 *
 * KHÔNG nhận props related đến mobile UI (mobileOpen, drawer, header bar)
 * — layout xử lý phần đó để tránh duplicate + dễ test.
 */
export default function CharitySidebar({
  section,
  onSectionChange,
  isCharity,
  onCreate,
  railEntries,
  userFullName,
  avatarUrl,
  onLogout,
}: CharitySidebarProps) {
  return (
    // Bắt đầu NGAY DƯỚI header chung (fixed, cao 104px) — giống sidebar /provider và
    // /deliveries. Để top-0 h-screen thì 104px đầu của sidebar chui xuống dưới header,
    // logo bị cắt còn một mẩu thò ra góc trái.
    <aside
      className="hidden md:flex fixed left-0 top-[104px] h-[calc(100vh-104px)] w-56 flex-col bg-white z-40 border-r border-neutral-200"
      aria-label="Điều hướng chiến dịch"
    >
      {/* Tiêu đề vai trò thay cho logo — logo đã có trên thanh header phía trên,
          lặp lại ở đây vừa thừa vừa bị header che mất. */}
      <div className="px-5 pt-6 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          Bếp ăn cộng đồng
        </p>
        {userFullName && (
          <p className="mt-1 text-base font-extrabold text-neutral-900 truncate">{userFullName}</p>
        )}
        <p className="text-xs text-neutral-500 mt-0.5">Quản lý chiến dịch cộng đồng</p>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-3 flex-grow overflow-y-auto">
        {railEntries.map((entry) => {
          const isActive = section === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              aria-current={isActive}
              onClick={() => onSectionChange(entry.key)}
              className={`${
                isActive
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-neutral-700 hover:bg-neutral-100'
              } rounded-xl px-4 py-3 flex items-center gap-3 transition-colors text-sm font-semibold text-left`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {entry.icon}
              </span>
              <span className="flex-1">{entry.label}</span>
              {entry.badge != null && (
                <span className="text-[11px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  {entry.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom: Create CTA + Logout + User */}
      <div className="border-t border-neutral-200">
        {isCharity && (
          <div className="p-3">
            <button
              type="button"
              onClick={onCreate}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#236c2a] hover:bg-[#1a4f1f] text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              <span>Tạo chiến dịch</span>
            </button>
          </div>
        )}
        {onLogout && (
          <div className="px-3 pb-3">
            <button
              onClick={onLogout}
              className="w-full text-left text-neutral-700 px-4 py-3 flex items-center gap-3 hover:bg-neutral-100 rounded-xl transition-colors text-sm font-semibold"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              <span>Đăng xuất</span>
            </button>
          </div>
        )}
        {userFullName && (
          <div className="flex items-center gap-3 px-5 py-4 border-t border-neutral-200">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4e9853] to-[#2a662e] flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(avatarUrl)} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{userFullName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{userFullName}</p>
              <p className="text-[11px] text-neutral-500 truncate">Bếp ăn cộng đồng</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
