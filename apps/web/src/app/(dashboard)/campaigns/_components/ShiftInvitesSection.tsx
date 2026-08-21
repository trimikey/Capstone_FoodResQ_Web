'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AssignmentRole } from '@foodresq/types';
import { useMyShiftInvites, useApplyCampaign, type ShiftInvite } from '@/hooks/useCampaigns';
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
 * "Nhận ca" ở đây KHÔNG phải tổ chức gán người: chính TNV bấm, và hệ thống tạo một
 * đăng ký chờ tổ chức duyệt — giống hệt như tự vào chiến dịch đăng ký. Lời mời chỉ
 * rút ngắn đường đi, không bỏ qua bước duyệt nào.
 */
export default function ShiftInvitesSection({ role }: { role: AssignmentRole }) {
  const { data: invites, isLoading } = useMyShiftInvites();
  const apply = useApplyCampaign();
  const markRead = useMarkRead();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isLoading || !invites || invites.length === 0) return null;

  async function accept(invite: ShiftInvite) {
    setBusyId(invite.notificationId);
    try {
      await apply.mutateAsync({
        id: invite.campaignId,
        role,
        shiftId: invite.shiftId ?? undefined,
        workDate: invite.workDate,
      });
      // Đăng ký xong thì lời mời hết vai trò — đánh dấu đã đọc để không hiện lại.
      await markRead.mutateAsync(invite.notificationId);
      toast.success('Đã gửi đăng ký ca. Chờ tổ chức duyệt là bạn vào ca.');
    } catch (e) {
      toast.error(errMsg(e, 'Không đăng ký được ca này'));
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
            Bấm nhận là gửi đăng ký chờ tổ chức duyệt — bạn vẫn chủ động, không bị xếp ca tự động.
          </p>
        </div>
      ))}
    </section>
  );
}
