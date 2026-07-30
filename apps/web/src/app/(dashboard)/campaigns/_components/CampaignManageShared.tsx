'use client';

import { CampaignParticipant, CampaignDistribution } from '@/hooks/useCampaigns';
import { mediaUrl } from '@/lib/utils';

export const ROLE_LABEL: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

export function RegistrationRow({
  p,
  decision,
  pending,
  onDecide,
}: {
  p: CampaignParticipant;
  decision?: 'approved' | 'rejected';
  /** Đang gửi mutation (disable nút để chặn click 2 lần). */
  pending?: boolean;
  onDecide: (id: string, name: string, action: 'approved' | 'rejected') => void;
}) {
  const roleKey = p.role as keyof typeof ROLE_LABEL;
  const roleLabel = ROLE_LABEL[roleKey] ?? p.role;
  const roleClass =
    p.role === 'waiter'
      ? 'cm-reg-role-pill--waiter'
      : p.role === 'shipper'
        ? 'cm-reg-role-pill--shipper'
        : '';

  // Status từ server là nguồn chính — chỉ hiển thị nút Duyệt/Từ chối khi BE còn cho phép (status=pending).
  const serverStatus = p.status ?? null;
  const isPendingReview = !serverStatus || serverStatus === 'pending';

  // Map trạng thái server → nhãn tiếng Việt cho badge.
  const serverBadge = (() => {
    if (serverStatus === 'assigned') return { label: 'Đã duyệt', cls: 'cm-reg-status--approved' };
    if (serverStatus === 'rejected') return { label: 'Đã từ chối', cls: 'cm-reg-status--rejected' };
    if (serverStatus === 'checked_in') return { label: 'Đã điểm danh', cls: 'cm-reg-status--info' };
    if (serverStatus === 'in_progress') return { label: 'Đang làm', cls: 'cm-reg-status--info' };
    if (serverStatus === 'completed') return { label: 'Hoàn thành', cls: 'cm-reg-status--approved' };
    if (serverStatus === 'absent') return { label: 'Vắng', cls: 'cm-reg-status--rejected' };
    return null;
  })();

  return (
    <div className="cm-reg-row">
      <span className="cm-reg-thumb">
        {p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(p.avatarUrl)} alt={p.fullName} />
        ) : (
          p.fullName.charAt(0).toUpperCase()
        )}
      </span>
      <div className="min-w-0">
        <p className="cm-reg-name truncate">{p.fullName}</p>
        <p className="cm-reg-meta">Hạng: {p.rank}</p>
      </div>
      <span className={`cm-reg-role-pill ${roleClass}`}>{roleLabel}</span>
      {!isPendingReview && serverBadge ? (
        <span className={`cm-reg-status ${serverBadge.cls}`}>{serverBadge.label}</span>
      ) : decision ? (
        <span className={`cm-reg-status cm-reg-status--${decision}`}>
          {decision === 'approved' ? 'Đã duyệt' : 'Đã từ chối'}
        </span>
      ) : (
        <div className="cm-reg-actions">
          <button
            type="button"
            onClick={() => onDecide(p.id, p.fullName, 'rejected')}
            disabled={pending}
            className="cm-reg-btn cm-reg-btn--reject disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
            Từ chối
          </button>
          <button
            type="button"
            onClick={() => onDecide(p.id, p.fullName, 'approved')}
            disabled={pending}
            className="cm-reg-btn cm-reg-btn--approve disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[14px]">check</span>
            Duyệt
          </button>
        </div>
      )}
    </div>
  );
}

export function DistributionRow({ d }: { d: CampaignDistribution }) {
  const initials = d.servedBy
    .split(' ')
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="cm-dist-row">
      <span className="cm-reg-thumb">{initials}</span>
      <div className="cm-dist-info">
        <p className="cm-dist-name">{d.roundLabel || 'Đợt phân phát'}</p>
        <p className="cm-dist-meta">
          Phụ trách: {d.servedBy} · {new Date(d.distributedAt).toLocaleDateString('vi-VN')}
          {d.leftoverServings > 0 ? ` · còn dư ${d.leftoverServings}` : ''}
        </p>
      </div>
      <span className="cm-dist-portions">{d.servingsServed} suất</span>
      <div className="cm-dist-actions">
        <button type="button" className="cm-dist-btn cm-dist-btn--ghost">
          <span className="material-symbols-outlined text-[14px]">visibility</span>
          Chi tiết
        </button>
      </div>
    </div>
  );
}

export function StatusTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
        active ? 'bg-[#236c2a] text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </button>
  );
}

export function RoleProgressBar({
  label,
  icon,
  filled,
  needed,
  tone,
}: {
  label: string;
  icon: string;
  filled: number;
  needed: number;
  tone: 'honey' | 'sky' | 'emerald';
}) {
  const pct = needed > 0 ? Math.min(100, Math.round((filled / needed) * 100)) : 0;
  const colorMap = {
    honey: { bg: 'rgba(217, 119, 6, 0.12)', fill: '#D97706', text: '#B45309' },
    sky: { bg: 'rgba(56, 189, 248, 0.12)', fill: '#0EA5E9', text: '#0369A1' },
    emerald: { bg: 'rgba(16, 185, 129, 0.12)', fill: '#10B981', text: '#047857' },
  }[tone];

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-neutral-800">
          <span
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: colorMap.bg, color: colorMap.text }}
          >
            <span className="material-symbols-outlined text-[14px]">{icon}</span>
          </span>
          {label}
        </span>
        <span className="text-xs font-bold text-neutral-500">
          {filled}/{needed}
        </span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 10, background: colorMap.bg }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: colorMap.fill }}
        />
      </div>
    </div>
  );
}
