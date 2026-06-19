'use client';

import { useState } from 'react';
import {
  useNotifications,
  useUnreadCount,
  useMarkAllRead,
  useNotificationSocket,
} from '@/hooks/useNotifications';

export default function NotificationBell() {
  useNotificationSocket(); // mở kết nối real-time
  const { data: notifs } = useNotifications();
  const { data: unread } = useUnreadCount();
  const markAllRead = useMarkAllRead();
  const [open, setOpen] = useState(false);

  const count = unread?.count ?? 0;
  const items = notifs ?? [];

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open && count > 0) markAllRead.mutate();
        }}
        className="relative p-2 rounded-full text-neutral-500 hover:bg-neutral-100 transition-colors"
        title="Thông báo"
      >
        <span className="material-symbols-outlined text-[22px]">notifications</span>
        {count > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-4 py-2 border-b border-neutral-100">
              <h4 className="font-bold text-sm text-neutral-800">Thông báo</h4>
            </div>
            <div className="max-h-[360px] overflow-y-auto divide-y divide-neutral-50">
              {items.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-400">Chưa có thông báo</div>
              ) : (
                items.map((n) => (
                  <div key={n.id} className={`p-3.5 ${n.isRead ? '' : 'bg-emerald-50/40'}`}>
                    <p className="text-sm font-bold text-neutral-800 leading-snug">{n.title}</p>
                    <p className="text-xs text-neutral-500 mt-0.5 leading-normal">{n.body}</p>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      {new Date(n.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
