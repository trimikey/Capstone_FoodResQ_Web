'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  useStartCampaign,
  useCancelCampaign,
  useCompleteCampaign,
  useConfirmDonation,
  type Campaign,
} from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';
import ChangeRequestModal from './ChangeRequestModal';

const CAMPAIGN_STATUS_META: Record<string, { label: string; chip: string }> = {
  draft: { label: 'Chờ duyệt', chip: 'cm-chip cm-chip--honey' },
  open: { label: 'Đang tuyển', chip: 'cm-chip cm-chip--sky' },
  in_progress: { label: 'Đang diễn ra', chip: 'cm-chip cm-chip--mint' },
  completed: { label: 'Hoàn tất', chip: 'cm-chip cm-chip--mint' },
  cancelled: { label: 'Bị từ chối / huỷ', chip: 'cm-chip cm-chip--rose' },
};

const DONATION_STATUS: Record<string, { label: string; cls: string }> = {
  pledged: { label: 'Đã hứa góp', cls: 'badge-honey' },
  received: { label: 'Đã nhận', cls: 'badge-emerald' },
  cancelled: { label: 'Đã huỷ', cls: 'badge-neutral' },
};

export default function MyCampaignCard({ c }: { c: Campaign }) {
  const start = useStartCampaign();
  const cancelCampaign = useCancelCampaign();
  const complete = useCompleteCampaign();
  const confirmDon = useConfirmDonation();
  const [servings, setServings] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const st = CAMPAIGN_STATUS_META[c.status] ?? { label: c.status, chip: 'cm-chip cm-chip--ink' };

  // Đã qua ngày diễn ra (so theo lịch UTC, đồng bộ với backend daysUntil)
  const overdue = (() => {
    const [yy, mm, dd] = c.scheduledDate.slice(0, 10).split('-').map(Number);
    const now = new Date();
    return Date.UTC(yy, mm - 1, dd) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  })();

  async function doConfirm(donationId: string) {
    try {
      await confirmDon.mutateAsync(donationId);
      toast.success('Đã xác nhận nhận nguyên liệu');
    } catch (e) {
      toast.error(errMsg(e, 'Xác nhận thất bại'));
    }
  }

  async function doStart() {
    try {
      await start.mutateAsync(c.id);
      toast.success('Đã bắt đầu chiến dịch');
    } catch (e) {
      toast.error(errMsg(e, 'Không bắt đầu được'));
    }
  }

  async function doCancel() {
    if (!window.confirm('Huỷ chiến dịch quá hạn này? Hành động không thể hoàn tác.')) return;
    try {
      await cancelCampaign.mutateAsync(c.id);
      toast.success('Đã huỷ chiến dịch quá hạn');
    } catch (e) {
      toast.error(errMsg(e, 'Huỷ thất bại'));
    }
  }

  async function doComplete() {
    const n = Number(servings);
    if (Number.isNaN(n) || n < 0) {
      toast.error('Nhập số suất ăn hợp lệ');
      return;
    }
    try {
      await complete.mutateAsync({ id: c.id, actualServings: n });
      toast.success('Đã kết thúc chiến dịch');
      setFinishing(false);
    } catch (e) {
      toast.error(errMsg(e, 'Không kết thúc được'));
    }
  }

  return (
    <div className="cm-card p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-bold text-neutral-900 text-sm truncate flex-1">{c.title}</h3>
        <span className={st.chip}>{st.label}</span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">event</span>
          {new Date(c.scheduledDate).toLocaleDateString('vi-VN')} · {c.startTime}–{c.endTime}
        </span>
        <span className="inline-flex items-center gap-1 truncate flex-1 min-w-0">
          <span className="material-symbols-outlined text-[14px]">place</span>
          {c.kitchenAddress}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <Link
          href={`/campaigns/${c.id}/manage`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 transition-colors"
        >
          <span className="material-symbols-outlined text-[15px]">settings</span>
          Quản lý
        </Link>
        <Link
          href={`/campaigns/${c.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-honey-700 hover:text-honey-900 transition-colors"
        >
          <span className="material-symbols-outlined text-[15px]">info</span>
          Chi tiết
        </Link>
      </div>

      {c.status === 'draft' && (
        <p className="text-[11px] text-honey-700 mt-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">hourglass_top</span>
          Đang chờ quản trị viên duyệt
        </p>
      )}

      {c.status === 'open' &&
        (overdue ? (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] text-rose-600 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">event_busy</span>
              Đã quá ngày diễn ra mà chưa bắt đầu
            </p>
            <button
              type="button"
              onClick={doCancel}
              disabled={cancelCampaign.isPending}
              className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
            >
              {cancelCampaign.isPending ? 'Đang huỷ...' : 'Huỷ chiến dịch quá hạn'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={doStart}
            disabled={start.isPending}
            className="mt-3 w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
          >
            {start.isPending ? 'Đang bắt đầu...' : 'Bắt đầu chiến dịch'}
          </button>
        ))}

      {c.status === 'in_progress' &&
        (finishing ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              placeholder="Số suất ăn"
              className="flex-1 input-base !py-1.5 text-xs"
              autoFocus
            />
            <button
              type="button"
              onClick={doComplete}
              disabled={complete.isPending}
              className="px-3 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
            >
              Xong
            </button>
            <button
              type="button"
              onClick={() => setFinishing(false)}
              className="px-2 py-2 text-neutral-400 text-xs"
            >
              Huỷ
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFinishing(true)}
            className="mt-3 w-full py-2 bg-honey-500 hover:bg-honey-600 text-white rounded-xl text-xs font-bold transition-colors"
          >
            Kết thúc &amp; nhập số suất
          </button>
        ))}

      {c.status === 'completed' && c.actualServings != null && (
        <p className="text-[11px] text-emerald-700 mt-3 flex items-center gap-1 font-semibold">
          <span className="material-symbols-outlined text-[14px]">check_circle</span>
          Đã phục vụ {c.actualServings} suất
        </p>
      )}

      {/* Nguyên liệu được quyên góp — tổ chức xác nhận đã nhận */}
      {c.donations && c.donations.length > 0 && (
        <div className="border-t border-neutral-100 mt-3 pt-3 space-y-1.5">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">inventory_2</span>
            Nguyên liệu quyên góp ({c.donations.length})
          </p>
          {c.donations.map((d) => {
            const ds = DONATION_STATUS[d.status] ?? { label: d.status, cls: 'badge-neutral' };
            return (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-neutral-700 truncate">
                  {d.quantity ? `${d.quantity} ` : ''}
                  {d.itemName}
                </span>
                <span className="text-neutral-400 truncate">· {d.provider.businessName}</span>
                {d.status === 'pledged' ? (
                  <button
                    type="button"
                    onClick={() => doConfirm(d.id)}
                    disabled={confirmDon.isPending}
                    className="ml-auto px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-full text-[10px] font-bold disabled:opacity-50 transition-colors shrink-0"
                  >
                    Đã nhận
                  </button>
                ) : (
                  <span className={`badge ${ds.cls} ml-auto shrink-0`}>{ds.label}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showChange && <ChangeRequestModal c={c} onClose={() => setShowChange(false)} />}
    </div>
  );
}