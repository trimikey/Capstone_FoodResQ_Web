'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useProviderRequests, useReviewProviderRequest, type ProviderRequestItem } from '@/hooks/useCampaigns';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-700 border border-amber-200' },
  accepted:  { label: 'Đã đồng ý', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  rejected:  { label: 'Từ chối', cls: 'bg-rose-100 text-rose-700 border border-rose-200' },
  expired:   { label: 'Hết hạn', cls: 'bg-neutral-100 text-neutral-500 border border-neutral-200' },
};

export default function ProviderRequestsSection() {
  const { data: requests, isLoading } = useProviderRequests();
  const review = useReviewProviderRequest();
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function handleReview(reqId: string, action: 'accept' | 'reject') {
    setReviewingId(reqId);
    try {
      await review.mutateAsync({ requestId: reqId, action, note: noteById[reqId] });
      toast.success(
        action === 'accept'
          ? 'Đã chấp nhận yêu cầu hợp tác!'
          : 'Đã từ chối yêu cầu.',
      );
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Thao tác thất bại';
      toast.error(msg);
    } finally {
      setReviewingId(null);
    }
  }

  const pending = (requests ?? []).filter((r) => r.status === 'pending');
  const others = (requests ?? []).filter((r) => r.status !== 'pending');

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-neutral-100 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!requests?.length) {
    return (
      <div className="bg-neutral-50 rounded-xl p-8 text-center border border-neutral-200">
        <span className="material-symbols-outlined text-5xl text-neutral-300">inbox</span>
        <p className="mt-3 font-semibold text-neutral-600">Chưa có yêu cầu nào</p>
        <p className="text-sm text-neutral-400 mt-1">
          Khi tổ chức gửi yêu cầu hợp tác, bạn sẽ thấy ở đây.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Yêu cầu chờ duyệt */}
      {pending.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500 text-xl">pending_actions</span>
            <h3 className="font-bold text-neutral-800">Yêu cầu chờ duyệt ({pending.length})</h3>
          </div>
          {pending.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              note={noteById[req.id] ?? ''}
              onNote={(v) => setNoteById((p) => ({ ...p, [req.id]: v }))}
              onAccept={() => handleReview(req.id, 'accept')}
              onReject={() => handleReview(req.id, 'reject')}
              loading={reviewingId === req.id}
            />
          ))}
        </section>
      )}

      {/* Đã xử lý */}
      {others.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-neutral-400 text-xl">history</span>
            <h3 className="font-bold text-neutral-500">Đã xử lý ({others.length})</h3>
          </div>
          {others.slice(0, 10).map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              note={noteById[req.id] ?? ''}
              onNote={() => undefined}
              onAccept={() => undefined}
              onReject={() => undefined}
              loading={false}
              compact
            />
          ))}
        </section>
      )}
    </div>
  );
}

function RequestCard({
  req,
  note,
  onNote,
  onAccept,
  onReject,
  loading,
  compact = false,
}: {
  req: ProviderRequestItem;
  note: string;
  onNote: (v: string) => void;
  onAccept: () => void;
  onReject: () => void;
  loading: boolean;
  compact?: boolean;
}) {
  const meta = STATUS_META[req.status] ?? { label: req.status, cls: 'bg-neutral-100 text-neutral-600' };
  const orgName = req.receiver.organizationName ?? req.receiver.user.fullName;
  const isPending = req.status === 'pending';
  const date = req.createdAt ? new Date(req.createdAt).toLocaleString('vi-VN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '';

  return (
    <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-sm space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-amber-600 text-lg">storefront</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-semibold text-neutral-800 text-sm">{orgName}</p>
              {req.campaign && (
                <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                  <span className="material-symbols-outlined text-[12px]">campaign</span>
                  {req.campaign.title}
                </p>
              )}
              {req.durationMonths && (
                <p className="text-xs text-neutral-400">
                  Hợp tác {req.durationMonths} tháng · {date}
                </p>
              )}
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${meta.cls}`}>
              {meta.label}
            </span>
          </div>
        </div>
      </div>

      {/* Lời nhắn */}
      {req.message && !compact && (
        <div className="bg-amber-50 rounded-lg px-3 py-2 text-sm text-neutral-700 border-l-2 border-amber-300">
          <span className="font-semibold text-amber-700 text-[11px] uppercase tracking-wide">Lời nhắn:</span>
          <p className="mt-1">{req.message}</p>
        </div>
      )}

      {/* Actions */}
      {isPending && !compact && (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Ghi chú phản hồi (tuỳ chọn)…"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg resize-none focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
          />
          <div className="flex gap-2">
            <button
              onClick={onReject}
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              Từ chối
            </button>
            <button
              onClick={onAccept}
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              Chấp nhận
            </button>
          </div>
        </div>
      )}

      {/* Compact: reviewed note */}
      {compact && req.reviewedNote && (
        <p className="text-xs text-neutral-500 italic">Ghi chú: {req.reviewedNote}</p>
      )}
    </div>
  );
}
