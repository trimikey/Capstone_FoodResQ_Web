'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  type AppNotification,
  useNotifications,
  useUnreadCount,
  useMarkAllRead,
  useNotificationSocket,
} from '@/hooks/useNotifications';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function notificationHref(n: AppNotification): string | null {
  const rawLink = typeof n.data?.link === 'string' ? n.data.link.trim() : '';
  if (rawLink) {
    if (/^https?:\/\//i.test(rawLink) || rawLink.startsWith('/')) return rawLink;
    if (UUID_RE.test(rawLink)) return `/campaigns/${rawLink}`;
    return `/${rawLink.replace(/^\/+/, '')}`;
  }

  const assignmentId = typeof n.data?.assignmentId === 'string' ? n.data.assignmentId.trim() : '';
  if (UUID_RE.test(assignmentId)) return `/my-tasks/${assignmentId}`;

  const campaignId = typeof n.data?.campaignId === 'string' ? n.data.campaignId.trim() : '';
  if (UUID_RE.test(campaignId)) return `/campaigns/${campaignId}`;

  return null;
}

export default function NotificationBell({ variant = 'header' }: { variant?: 'header' | 'sidebar' }) {
  useNotificationSocket(); // mở kết nối real-time
  const { data: notifs } = useNotifications();
  const { data: unread } = useUnreadCount();
  const markAllRead = useMarkAllRead();
  const [open, setOpen] = useState(false);

  const count = unread?.count ?? 0;
  const items = notifs ?? [];

  const sidebar = variant === 'sidebar';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open && count > 0) markAllRead.mutate();
        }}
        className={sidebar
          ? 'relative w-full rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100'
          : 'relative p-2 rounded-full text-neutral-500 hover:bg-neutral-100 transition-colors'}
        title="Thông báo"
      >
        <span className="material-symbols-outlined text-[22px]">notifications</span>
        {sidebar && <span className="flex-1 text-left">Thông báo</span>}
        {count > 0 && (
          <span className={sidebar
            ? 'min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center'
            : 'absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center'}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute mt-2 w-80 bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 ${sidebar ? 'left-0' : 'right-0'}`}>
            <div className="px-4 py-2 border-b border-neutral-100">
              <h4 className="font-bold text-sm text-neutral-800">Thông báo</h4>
            </div>
            <div className="max-h-[360px] overflow-y-auto divide-y divide-neutral-50">
              {items.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-400">Chưa có thông báo</div>
              ) : (
                items.map((n) => {
                  const href = notificationHref(n);
                  const content = (
                    <>
                      <p className="text-sm font-bold text-neutral-800 leading-snug">{n.title}</p>
                      <p className="text-xs text-neutral-500 mt-0.5 leading-normal">{n.body}</p>
                      <p className="text-[10px] text-neutral-400 mt-1">
                        {new Date(n.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </>
                  );
                  const className = `block p-3.5 text-left transition-colors hover:bg-neutral-50 ${n.isRead ? '' : 'bg-emerald-50/40'}`;

                  return href ? (
                    <Link key={n.id} href={href} onClick={() => setOpen(false)} className={className}>
                      {content}
                    </Link>
                  ) : (
                    <div key={n.id} className={className}>
                      {content}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
