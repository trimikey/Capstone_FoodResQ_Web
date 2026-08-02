'use client';

import { useState } from 'react';
import Link from 'next/link';

export type Section =
  | 'overview'
  | 'mine'
  | 'suppliers'
  | 'providers'
  | 'orders'
  | 'history'
  | 'tasks'
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile trigger (chỉ hiện trên mobile, desktop ẩn đi) */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-neutral-200 px-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-neutral-100"
          aria-label="Mở menu"
        >
          <span className="material-symbols-outlined text-[24px] text-emerald-800">menu</span>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-7 w-auto object-contain" />
        <span className="font-bold text-sm text-[var(--cm-ink-900)]">Bếp ăn cộng đồng</span>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="cm-sidebar cm-sidebar-drawer" aria-label="Điều hướng chiến dịch">
            <div className="cm-sidebar-header">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-9 w-auto object-contain" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="ml-auto p-2 rounded-lg hover:bg-neutral-100"
                aria-label="Đóng"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <p className="cm-sidebar-section-label">Bếp ăn cộng đồng</p>
            <nav className="cm-sidebar-nav">
              {railEntries.map((entry) => {
                const isActive = section === entry.key;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    aria-current={isActive}
                    onClick={() => {
                      onSectionChange(entry.key);
                      setMobileOpen(false);
                    }}
                    className="cm-sidebar-link"
                  >
                    <span className="material-symbols-outlined text-[20px]">{entry.icon}</span>
                    <span className="flex-1 text-left">{entry.label}</span>
                    {entry.badge != null && <span className="cm-sidebar-badge">{entry.badge}</span>}
                  </button>
                );
              })}
            </nav>
            {isCharity && (
              <div className="cm-sidebar-footer">
                <button
                  type="button"
                  onClick={() => {
                    onCreate();
                    setMobileOpen(false);
                  }}
                  className="cm-sidebar-cta"
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                  <span>Tạo chiến dịch</span>
                </button>
              </div>
            )}
            {onLogout && (
              <div className="cm-sidebar-footer">
                <button
                  type="button"
                  onClick={onLogout}
                  className="cm-sidebar-link cm-sidebar-link-muted"
                >
                  <span className="material-symbols-outlined text-[20px]">logout</span>
                  <span className="flex-1 text-left">Đăng xuất</span>
                </button>
              </div>
            )}
            {userFullName && (
              <div className="cm-sidebar-user">
                <div className="cm-sidebar-avatar">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>{userFullName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{userFullName}</p>
                  <p className="text-[11px] text-neutral-500">Bếp ăn cộng đồng</p>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Desktop persistent sidebar (giống provider) */}
      <aside className="cm-sidebar" aria-label="Điều hướng chiến dịch">
        <div className="cm-sidebar-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_FoodResQ.png" alt="FoodResQ" className="h-10 w-auto object-contain" />
        </div>
        <p className="cm-sidebar-section-label">Bếp ăn cộng đồng</p>
        <nav className="cm-sidebar-nav">
          {railEntries.map((entry) => {
            const isActive = section === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                aria-current={isActive}
                onClick={() => onSectionChange(entry.key)}
                className="cm-sidebar-link"
              >
                <span className="material-symbols-outlined text-[20px]">{entry.icon}</span>
                <span className="flex-1 text-left">{entry.label}</span>
                {entry.badge != null && <span className="cm-sidebar-badge">{entry.badge}</span>}
              </button>
            );
          })}
        </nav>
        {isCharity && (
          <div className="cm-sidebar-footer">
            <button
              type="button"
              onClick={onCreate}
              className="cm-sidebar-cta"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              <span>Tạo chiến dịch</span>
            </button>
          </div>
        )}
        {onLogout && (
          <div className="cm-sidebar-footer">
            <button
              type="button"
              onClick={onLogout}
              className="cm-sidebar-link cm-sidebar-link-muted"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              <span className="flex-1 text-left">Đăng xuất</span>
            </button>
          </div>
        )}
        {userFullName && (
          <div className="cm-sidebar-user">
            <div className="cm-sidebar-avatar">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{userFullName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{userFullName}</p>
              <p className="text-[11px] text-neutral-500">Bếp ăn cộng đồng</p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
