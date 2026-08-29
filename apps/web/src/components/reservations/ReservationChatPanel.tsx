'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  useReservationMessages,
  useSendReservationMessage,
} from '@/hooks/useReservation';

const ROLE_VN: Record<string, string> = {
  receiver: 'Người nhận',
  provider: 'Cửa hàng',
  shipper: 'Shipper',
};
import { errMsg } from '@/lib/utils';

/**
 * Panel chat theo ĐƠN giữa người nhận và cửa hàng — dùng chung cho cả hai phía
 * (BE tự nhận diện ai là ai, FE chỉ cần reservationId).
 *
 * Mobile: bottom-sheet chiếm ~75% màn; desktop: hộp nổi góc phải. Poll 5s qua
 * hook — đủ gần realtime cho trao đổi quanh một đơn, không cần socket riêng.
 */
export default function ReservationChatPanel({
  reservationId,
  open,
  onClose,
}: {
  reservationId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useReservationMessages(reservationId, open);
  const send = useSendReservationMessage();
  const others = (data?.participants ?? []).filter((p) => p.userId !== data?.me);
  const byId = new Map((data?.participants ?? []).map((p) => [p.userId, p]));
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Tin mới (mình gửi hoặc poll về) → cuộn xuống đáy
  const count = data?.messages.length ?? 0;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [count, open]);

  if (!open) return null;

  async function handleSend() {
    const content = draft.trim();
    if (!content) return;
    try {
      await send.mutateAsync({ reservationId, content });
      setDraft('');
    } catch (err) {
      toast.error(errMsg(err, 'Không gửi được tin nhắn — thử lại'));
    }
  }

  return (
    <div className="fixed inset-0 z-[95]">
      {/* Lớp phủ bắt click đóng */}
      <div className="absolute inset-0 bg-black/30 md:bg-transparent" onClick={onClose} />

      <div className="absolute inset-x-0 bottom-0 md:inset-auto md:bottom-6 md:right-6 md:w-[380px] flex h-[75dvh] md:h-[520px] flex-col overflow-hidden rounded-t-2xl md:rounded-2xl border border-neutral-200 bg-white shadow-2xl">
        {/* Header: các bên còn lại của đơn — tên + SĐT bấm gọi được */}
        <div className="flex items-center gap-3 border-b border-neutral-100 bg-emerald-700 px-4 py-3 text-white">
          <span className="material-symbols-outlined">forum</span>
          <div className="min-w-0 flex-1">
            {others.length === 0 ? (
              <p className="truncate text-sm font-bold">Đang tải…</p>
            ) : (
              others.map((p) => (
                <p key={p.userId} className="flex min-w-0 items-center gap-1.5 text-sm leading-snug">
                  <span className="shrink-0 rounded bg-white/15 px-1 text-[9px] font-bold uppercase">
                    {ROLE_VN[p.role]}
                  </span>
                  <span className="truncate font-bold">{p.name}</span>
                  {p.phone && (
                    <a href={`tel:${p.phone}`} aria-label={`Gọi ${p.name}`} className="shrink-0 text-emerald-100 hover:text-white">
                      <span className="material-symbols-outlined align-middle text-[15px]">call</span>
                    </a>
                  )}
                </p>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chat"
            className="rounded-full p-2 transition-colors hover:bg-white/15"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Danh sách tin nhắn */}
        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-neutral-50 p-3">
          {isLoading ? (
            <p className="py-8 text-center text-xs text-neutral-400">Đang tải cuộc trò chuyện…</p>
          ) : count === 0 ? (
            <p className="py-8 text-center text-xs text-neutral-400">
              Chưa có tin nhắn nào — nhắn để trao đổi về đơn này (giờ nhận, chỗ đậu xe, món thay thế…).
            </p>
          ) : (
            data!.messages.map((m) => {
              const mine = m.senderUserId === data!.me;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? 'rounded-br-sm bg-emerald-600 text-white'
                        : 'rounded-bl-sm border border-neutral-200 bg-white text-neutral-800'
                    }`}
                  >
                    {/* Nhóm 3 bên: đề tên người gửi để khỏi lẫn cửa hàng với shipper */}
                    {!mine && others.length > 1 && (
                      <p className="mb-0.5 text-[10px] font-bold text-emerald-700">
                        {byId.get(m.senderUserId)?.name ?? 'Thành viên'}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p className={`mt-0.5 text-[10px] ${mine ? 'text-emerald-100' : 'text-neutral-400'}`}>
                      {new Date(m.createdAt).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Ho_Chi_Minh',
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Ô nhập */}
        <div className="flex items-end gap-2 border-t border-neutral-100 bg-white p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            maxLength={1000}
            placeholder="Nhập tin nhắn…"
            className="max-h-24 min-h-10 flex-1 resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={send.isPending || !draft.trim()}
            aria-label="Gửi"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
