'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAssignDistribution } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

/**
 * Phân công người đi phát cho đợt đang BỎ TRỐNG (shipper trả việc vì sự cố) — ngay trên
 * dòng của bảng đợt phát, không phụ thuộc sự cố còn mở hay đã bị đóng.
 */
export default function AssignDistributionButton({
  campaignId,
  distributionId,
  candidates,
}: {
  campaignId: string;
  distributionId: string;
  /** TNV giao hàng & phục vụ đã duyệt của chiến dịch. */
  candidates: Array<{ volunteerId: string; fullName: string }>;
}) {
  const assign = useAssignDistribution();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const ids = candidates.filter((c) => picked[c.volunteerId]).map((c) => c.volunteerId);

  async function submit() {
    if (ids.length === 0) return toast.error('Chọn ít nhất một người.');
    try {
      const res = await assign.mutateAsync({ campaignId, distributionId, ids });
      toast.success(`Đã giao đợt phát cho ${res.assignedTo.join(', ')} — họ đã được báo.`);
      setOpen(false);
      setPicked({});
    } catch (e) {
      toast.error(errMsg(e, 'Không phân công được'));
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-rose-700"
      >
        <span className="material-symbols-outlined text-[14px]">person_add</span>
        Phân công shipper
      </button>
      {open && (
        <div className="mt-2 w-56 space-y-1.5 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-lg">
          {candidates.length === 0 ? (
            <p className="text-[11px] text-neutral-500">
              Chưa có TNV giao hàng &amp; phục vụ nào đã duyệt — mời thêm người trước.
            </p>
          ) : (
            candidates.map((c) => (
              <label key={c.volunteerId} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!picked[c.volunteerId]}
                  onChange={(e) => setPicked((p) => ({ ...p, [c.volunteerId]: e.target.checked }))}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span className="truncate font-semibold text-neutral-800">{c.fullName}</span>
              </label>
            ))
          )}
          <button
            type="button"
            onClick={submit}
            disabled={assign.isPending || ids.length === 0}
            className="w-full rounded-lg bg-emerald-600 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {assign.isPending ? 'Đang giao…' : 'Giao đợt này'}
          </button>
        </div>
      )}
    </div>
  );
}
