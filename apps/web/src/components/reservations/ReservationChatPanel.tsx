'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  useReservationMessages,
  useSendReservationMessage,
  type ChatPartnerSelector,
} from '@/hooks/useReservation';
import { errMsg } from '@/lib/utils';

const ROLE_VN: Record<string, string> = {
  receiver: 'Người nhận',
  provider: 'Cửa hàng',
  shipper: 'Shipper',
};

/**
 * MỘT cửa sổ chat = MỘT người đối thoại (hội thoại 1-1 theo đơn). Không gộp,
 * không tab — muốn nhắn 2 người thì mở 2 cửa sổ song song, xếp cạnh nhau trên
 * desktop qua `offsetIndex` (mobile: bottom-sheet, cái mở sau nằm trên).
 *
 * Poll 5s khi đang mở — đủ gần realtime cho trao đổi quanh một đơn.
 */
export default function ReservationChatPanel({
  reservationId,
  open,
  onClose,
  partner = null,
  offsetIndex = 0,
}: {
  reservationId: string;
  open: boolean;
  onClose: () => void;
  /** Bên đối thoại của cửa sổ này ({id} hoặc {role}); null = bên mặc định theo vai. */
  partner?: ChatPartnerSelector;
  /** Vị trí xếp cửa sổ trên desktop: 0 = sát phải, 1 = cạnh bên trái nó… */
  offsetIndex?: number;
}) {
  const { data, isLoading, error } = useReservationMessages(reservationId, partner, open);
  const send = useSendReservationMessage();
  const active = data?.partner ?? null;
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
    if (!content || !active) return;
    try {
      await send.mutateAsync({ reservationId, content, toUserId: active.userId });
      setDraft('');
    } catch (err) {
      toast.error(errMsg(err, 'Không gửi được tin nhắn — thử lại'));
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[95] md:inset-auto md:bottom-6 md:right-[var(--chat-right,1.5rem)] flex h-[75dvh] md:h-[520px] w-full md:w-[380px] flex-col overflow-hidden rounded-t-2xl md:rounded-2xl border border-neutral-200 bg-white shadow-2xl"
      style={{ '--chat-right': `${24 + offsetIndex * 396}px` } as React.CSSProperties}
    >
      {/* Header: đúng MỘT người — tin gõ ở đây chắc chắn chỉ tới người này */}
      <div className="flex items-center gap-3 border-b border-neutral-100 bg-emerald-700 px-4 py-3 text-white">
        <span className="material-symbols-outlined">forum</span>
        <div className="min-w-0 flex-1">
          {!active ? (
            <p className="truncate text-sm font-bold">
              {error ? errMsg(error, 'Không mở được cuộc trò chuyện') : 'Đang tải…'}
            </p>
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                {ROLE_VN[active.role]}
              </p>
              <p className="truncate text-sm font-bold leading-snug">{active.name}</p>
            </>
          )}
        </div>
        {active?.phone && (
          <a
            href={`tel:${active.phone}`}
            aria-label={`Gọi ${active.name}`}
            className="shrink-0 rounded-full bg-white/15 p-2 transition-colors hover:bg-white/25"
          >
            <span className="material-symbols-outlined text-[18px]">call</span>
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng chat"
          className="shrink-0 rounded-full p-2 transition-colors hover:bg-white/15"
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
            Chưa có tin nhắn nào với {active ? ROLE_VN[active.role].toLowerCase() : 'bên này'} —
            nhắn để trao đổi về đơn (giờ nhận, chỗ đậu xe, món thay thế…).
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
          placeholder={active ? `Nhắn cho ${active.name}…` : 'Nhập tin nhắn…'}
          className="max-h-24 min-h-10 flex-1 resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={send.isPending || !draft.trim() || !active}
          aria-label="Gửi"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[20px]">send</span>
        </button>
      </div>
    </div>
  );
}
