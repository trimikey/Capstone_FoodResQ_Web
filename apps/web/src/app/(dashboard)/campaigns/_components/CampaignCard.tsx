'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AssignmentRole } from '@foodresq/types';
import { usePledgeDonation, type Campaign } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';
import RoleBadge, { ROLE_LABEL, ROLE_META } from './RoleBadge';

const DONATION_STATUS: Record<string, { label: string; cls: string }> = {
  pledged: { label: 'Đã hứa góp', cls: 'badge-honey' },
  received: { label: 'Đã nhận', cls: 'badge-emerald' },
  cancelled: { label: 'Đã huỷ', cls: 'badge-neutral' },
};

interface CampaignCardProps {
  c: Campaign;
  myRoles: string[];
  onApply: (id: string, role: AssignmentRole) => void;
  applying: boolean;
  isProvider?: boolean;
  /** Tài khoản chưa active → vô hiệu hoá nút apply / pledge. */
  disabled?: boolean;
}

export default function CampaignCard({ c, myRoles, onApply, applying, isProvider, disabled }: CampaignCardProps) {
  const pledge = usePledgeDonation();
  const [donating, setDonating] = useState(false);
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('');

  const dateStr = new Date(c.scheduledDate).toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });

  // Đã qua ngày diễn ra (so theo lịch UTC, đồng bộ với backend) → không còn nhận đăng ký
  const overdue = (() => {
    const [yy, mm, dd] = c.scheduledDate.slice(0, 10).split('-').map(Number);
    const now = new Date();
    return Date.UTC(yy, mm - 1, dd) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  })();

  async function doPledge() {
    if (item.trim().length < 1) {
      toast.error('Nhập tên nguyên liệu');
      return;
    }
    try {
      await pledge.mutateAsync({
        campaignId: c.id,
        itemName: item.trim(),
        quantity: qty.trim() || undefined,
      });
      toast.success('Đã gửi quyên góp — chờ tổ chức xác nhận. Cảm ơn bạn!');
      setItem('');
      setQty('');
      setDonating(false);
    } catch (e) {
      toast.error(errMsg(e, 'Quyên góp thất bại'));
    }
  }

  return (
    <Link
      href={`/campaigns/${c.id}`}
      className="cm-card block overflow-hidden p-5 group"
    >
      {/* Top — title + date chip */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">soup_kitchen</span>
            <span className="cm-chip cm-chip--ink">{dateStr}</span>
            {overdue && <span className="cm-chip cm-chip--rose">Đã qua ngày</span>}
          </div>
          <h3 className="font-extrabold text-neutral-900 text-base leading-snug line-clamp-2 group-hover:text-emerald-700 transition-colors">
            {c.title}
          </h3>
          {c.description && (
            <p className="text-sm text-neutral-500 mt-1.5 line-clamp-2">{c.description}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Giờ</p>
          <p className="text-sm font-extrabold text-neutral-900">
            {c.startTime}–{c.endTime}
          </p>
        </div>
      </div>

      {/* Address */}
      <p className="text-xs text-neutral-500 mt-3 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[15px] text-neutral-400">place</span>
        <span className="truncate">{c.kitchenAddress}</span>
      </p>

      {/* 3 slot grid */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <Slot
          role={AssignmentRole.CHEF}
          filled={c.chefSlotsFilled}
          needed={c.chefSlotsNeeded}
          canApply={myRoles.includes('chef')}
          onApply={(r) => onApply(c.id, r)}
          applying={applying}
          overdue={overdue}
          disabled={disabled}
        />
        <Slot
          role={AssignmentRole.WAITER}
          filled={c.waiterSlotsFilled}
          needed={c.waiterSlotsNeeded}
          canApply={myRoles.includes('waiter')}
          onApply={(r) => onApply(c.id, r)}
          applying={applying}
          overdue={overdue}
          disabled={disabled}
        />
        <Slot
          role={AssignmentRole.SHIPPER}
          filled={c.shipperSlotsFilled}
          needed={c.shipperSlotsNeeded}
          canApply={myRoles.includes('shipper')}
          onApply={(r) => onApply(c.id, r)}
          applying={applying}
          overdue={overdue}
          disabled={disabled}
        />
      </div>

      {overdue && (
        <p className="text-[11px] text-rose-600 mt-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">event_busy</span>
          Đã qua ngày diễn ra — chiến dịch không còn nhận đăng ký.
        </p>
      )}

      {!overdue && myRoles.length === 0 && !isProvider && (
        <p className="text-[11px] text-neutral-400 mt-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">info</span>
          Chỉ tình nguyện viên mới đăng ký được — theo đúng chuyên môn của mình.
        </p>
      )}

      {/* Tình nguyện viên đã tham gia */}
      {(() => {
        const approved = (c.assignments ?? []).filter(
          (a) => !['pending', 'rejected', 'cancelled'].includes(a.status),
        );
        if (approved.length === 0) return null;
        return (
          <div className="border-t border-neutral-100 mt-4 pt-3">
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-2">
              Đã tham gia ({approved.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {approved.map((a) => {
                const rm = ROLE_META[a.role];
                return (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 bg-neutral-50 border border-neutral-150 rounded-full pl-1 pr-2.5 py-0.5"
                  >
                    <span
                      className={`w-5 h-5 rounded-full ${rm?.soft ?? 'bg-neutral-100'} flex items-center justify-center text-[9px] font-bold ${rm?.text ?? 'text-neutral-700'}`}
                    >
                      {a.volunteer.user.fullName.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-[11px] font-semibold text-neutral-700">
                      {a.volunteer.user.fullName}
                    </span>
                    <span className={`text-[10px] font-bold ${rm?.text ?? 'text-neutral-500'}`}>
                      · {ROLE_LABEL[a.role]}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Nguyên liệu được quyên góp */}
      {c.donations && c.donations.length > 0 && (
        <div className="border-t border-neutral-100 mt-4 pt-3">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">inventory_2</span>
            Nguyên liệu quyên góp ({c.donations.length})
          </p>
          <div className="space-y-1.5">
            {c.donations.map((d) => {
              const ds = DONATION_STATUS[d.status] ?? { label: d.status, cls: 'badge-neutral' };
              return (
                <div key={d.id} className="flex items-center gap-2 text-xs">
                  <span className="material-symbols-outlined text-[15px] text-emerald-600">
                    volunteer_activism
                  </span>
                  <span className="font-semibold text-neutral-700">
                    {d.quantity ? `${d.quantity} ` : ''}
                    {d.itemName}
                  </span>
                  <span className="text-neutral-400">· {d.provider.businessName}</span>
                  <span className={`badge ${ds.cls} ml-auto`}>{ds.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Provider: pledge ingredient */}
      {isProvider && (
        <div
          className="border-t border-neutral-100 mt-4 pt-3"
          onClick={(e) => {
            // ngăn bubble lên Link → không navigate khi bấm nút quyên góp
            e.preventDefault();
          }}
        >
          {donating ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="Nguyên liệu (vd: Gạo)"
                  className="input-base !py-2 text-sm flex-1"
                  autoFocus
                />
                <input
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="20 kg"
                  className="input-base !py-2 text-sm w-24"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={doPledge}
                  disabled={pledge.isPending}
                  className="flex-1 py-2 bg-[#236c2a] hover:bg-[#1a4f1f] text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
                >
                  {pledge.isPending ? 'Đang gửi...' : 'Gửi quyên góp'}
                </button>
                <button
                  type="button"
                  onClick={() => setDonating(false)}
                  className="px-3 py-2 text-neutral-400 text-xs"
                >
                  Huỷ
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDonating(true)}
              className="w-full py-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">add</span> Quyên góp nguyên liệu
            </button>
          )}
        </div>
      )}
    </Link>
  );
}

function Slot({
  role,
  filled,
  needed,
  canApply,
  onApply,
  applying,
  overdue,
  disabled,
}: {
  role: AssignmentRole;
  filled: number;
  needed: number;
  canApply: boolean;
  onApply: (role: AssignmentRole) => void;
  applying: boolean;
  overdue?: boolean;
  disabled?: boolean;
}) {
  if (needed <= 0) return null;
  const full = filled >= needed;
  const rm = ROLE_META[role];
  const pct = Math.min(100, Math.round((filled / needed) * 100));

  return (
    <div
      className={`rounded-2xl border border-neutral-150 p-3 ${rm?.soft ?? 'bg-neutral-50'}`}
      onClick={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-1.5">
        <span className={`material-symbols-outlined text-[18px] ${rm?.text ?? 'text-neutral-700'}`}>
          {rm?.icon ?? 'work'}
        </span>
        <span className="text-xs font-bold text-neutral-700">{rm?.label ?? role}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-extrabold text-lg text-neutral-900">{filled}</span>
        <span className="text-xs text-neutral-400">/ {needed}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/70 overflow-hidden">
        <div className={`h-full rounded-full ${rm?.bar ?? 'bg-neutral-400'} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {canApply && (
        <button
          type="button"
          onClick={() => onApply(role)}
          disabled={full || applying || overdue || disabled}
          title={disabled ? 'Tài khoản đang chờ admin duyệt' : undefined}
          className="mt-2.5 w-full py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed bg-[#236c2a] hover:bg-[#1a4f1f] text-white transition-colors"
        >
          {disabled ? 'Chờ duyệt' : overdue ? 'Hết hạn' : full ? 'Đã đủ' : 'Đăng ký'}
        </button>
      )}
    </div>
  );
}

export { Slot };