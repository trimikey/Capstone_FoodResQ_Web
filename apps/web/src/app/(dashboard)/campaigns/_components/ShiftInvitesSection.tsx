'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useMyShiftInvites, useAcceptShiftInvite, type ShiftInvite } from '@/hooks/useCampaigns';
import { useMarkRead } from '@/hooks/useNotifications';
import { errMsg } from '@/lib/utils';

const PERIOD_LABEL: Record<string, string> = {
  midnight: 'Ca khuya (00:00–06:00)',
  morning: 'Ca sáng (06:00–12:00)',
  afternoon: 'Ca chiều (12:00–18:00)',
  evening: 'Ca tối (18:00–24:00)',
};

function formatDay(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+07:00`).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * Lời mời nhận ca do tổ chức gửi.
 *
 * "Nhận ca" đưa TNV VÀO THẲNG ca, không qua bước tổ chức duyệt lại: tổ chức đã chủ
 * động chọn đích danh người này khi gửi lời mời, TNV bấm nhận là bên còn lại đồng ý.
 * (Đăng ký tự phát vẫn giữ luồng chờ duyệt vì lúc đó tổ chức chưa biết người đăng ký.)
 */
// Vai trò lấy từ chính ca được mời (backend đọc shift.role) nên không cần truyền vào.
export default function ShiftInvitesSection() {
  const { data: invites, isLoading } = useMyShiftInvites();
  const accept_ = useAcceptShiftInvite();
  const markRead = useMarkRead();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isLoading || !invites || invites.length === 0) return null;

  async function accept(invite: ShiftInvite) {
    setBusyId(invite.notificationId);
    try {
      const res = await accept_.mutateAsync({
        campaignId: invite.campaignId,
        notificationId: invite.notificationId,
      });
      toast.success(`Bạn đã vào ca ${res.shiftLabel}. Hẹn gặp bạn tại bếp!`);
    } catch (e) {
      toast.error(errMsg(e, 'Không nhận được ca này'));
    } finally {
      setBusyId(null);
    }
  }

  async function decline(invite: ShiftInvite) {
    setBusyId(invite.notificationId);
    try {
      await markRead.mutateAsync(invite.notificationId);
      toast.info('Đã bỏ qua lời mời này.');
    } catch (e) {
      toast.error(errMsg(e, 'Không bỏ qua được lời mời'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="cm-section-head !mb-1">
        <h2 className="cm-section-title !text-base">
          <span className="material-symbols-outlined text-sky-600 text-[18px]">mail</span>
          Lời mời nhận ca ({invites.length})
        </h2>
      </div>

      {invites.map((invite) => (
        <div key={invite.notificationId} className="cm-card border-sky-200 bg-sky-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/campaigns/${invite.campaignId}`}
                className="text-sm font-extrabold text-neutral-900 hover:text-emerald-700"
              >
                {invite.campaignTitle}
              </Link>
              <p className="mt-0.5 text-[11px] text-neutral-600">
                {formatDay(invite.workDate)}
                {invite.period ? ` · ${PERIOD_LABEL[invite.period] ?? invite.period}` : ''}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-500">
                <span className="material-symbols-outlined text-[13px]">place</span>
                {invite.kitchenAddress}
              </p>
            </div>
            <span className="cm-chip cm-chip--sky shrink-0">Được mời</span>
          </div>

          <p className="mt-2 rounded-lg bg-white/70 p-2 text-[11px] leading-relaxed text-neutral-600">
            {invite.message}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void accept(invite)}
              disabled={busyId === invite.notificationId}
              className="rounded-xl bg-[#236c2a] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#1a4f1f] disabled:opacity-50"
            >
              {busyId === invite.notificationId ? 'Đang gửi…' : 'Nhận ca này'}
            </button>
            <button
              type="button"
              onClick={() => void decline(invite)}
              disabled={busyId === invite.notificationId}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              Bỏ qua
            </button>
          </div>

          <p className="mt-1.5 text-[10px] italic text-neutral-500">
            Bấm nhận là bạn vào ca ngay, không phải chờ duyệt lại — vì tổ chức đã chọn đích danh bạn.
          </p>
        </div>
      ))}
    </section>
  );
}
