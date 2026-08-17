'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import {
  useCampaignChangeRequests,
  useSubmitCampaignChange,
  useCancelCampaignChange,
  type Campaign,
  type CampaignChangeRequest,
  type SubmitCampaignChangeInput,
} from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';
import { vnToday } from '@/lib/vn-date';

const CAMPAIGN_STATUS_META: Record<string, { label: string }> = {
  pending_approval: { label: 'Chờ duyệt' },
  approved: { label: 'Đang tuyển' },
  in_progress: { label: 'Đang diễn ra' },
  completed: { label: 'Hoàn tất' },
  cancelled: { label: 'Bị từ chối / huỷ' },
};

const CHANGE_STATUS_META: Record<string, { label: string; chip: string }> = {
  pending: { label: 'Chờ duyệt', chip: 'cm-chip cm-chip--honey' },
  approved: { label: 'Đã duyệt', chip: 'cm-chip cm-chip--mint' },
  rejected: { label: 'Bị từ chối', chip: 'cm-chip cm-chip--rose' },
  cancelled: { label: 'Đã huỷ', chip: 'cm-chip cm-chip--ink' },
};

export default function ChangeRequestModal({ c, onClose }: { c: Campaign; onClose: () => void }) {
  const { data: requests, isLoading } = useCampaignChangeRequests(c.id);
  const submit = useSubmitCampaignChange();
  const cancel = useCancelCampaignChange();

  const editable = c.status === 'approved';
  const orig = {
    scheduledDate: c.scheduledDate.slice(0, 10),
    startTime: c.startTime.slice(0, 5),
    endTime: c.endTime.slice(0, 5),
    kitchenAddress: c.kitchenAddress,
    chefSlotsNeeded: c.chefSlotsNeeded,
    waiterSlotsNeeded: c.waiterSlotsNeeded,
    shipperSlotsNeeded: c.shipperSlotsNeeded,
  };
  const [f, setF] = useState(orig);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const setErr = (k: string, v: string | undefined) =>
    setErrors((prev) => {
      const next = { ...prev };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });

  const hasPending = (requests ?? []).some((r) => r.status === 'pending');

  // Số ngày còn lại tới ngày diễn ra (để hiển thị nhắc nhở quy tắc khoá sửa)
  const [yy, mm, dd] = c.scheduledDate.slice(0, 10).split('-').map(Number);
  const today = new Date();
  const daysLeft = Math.round(
    (Date.UTC(yy, mm - 1, dd) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) /
      86_400_000,
  );

  function diffInput(): SubmitCampaignChangeInput {
    const out: SubmitCampaignChangeInput = {};
    if (f.scheduledDate !== orig.scheduledDate) out.scheduledDate = f.scheduledDate;
    if (f.startTime !== orig.startTime) out.startTime = f.startTime;
    if (f.endTime !== orig.endTime) out.endTime = f.endTime;
    if (f.kitchenAddress.trim() !== orig.kitchenAddress)
      out.kitchenAddress = f.kitchenAddress.trim();
    if (Number(f.chefSlotsNeeded) !== orig.chefSlotsNeeded)
      out.chefSlotsNeeded = Number(f.chefSlotsNeeded);
    if (Number(f.waiterSlotsNeeded) !== orig.waiterSlotsNeeded)
      out.waiterSlotsNeeded = Number(f.waiterSlotsNeeded);
    if (Number(f.shipperSlotsNeeded) !== orig.shipperSlotsNeeded)
      out.shipperSlotsNeeded = Number(f.shipperSlotsNeeded);
    return out;
  }

  function validate(): { input: SubmitCampaignChangeInput; ok: boolean } {
    const next: Record<string, string> = {};
    const input = diffInput();
    if (Object.keys(input).length === 0) {
      next.form = 'Bạn chưa thay đổi trường nào.';
    }
    // Validate date in future
    if (input.scheduledDate) {
      const picked = new Date(input.scheduledDate);
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      if (picked < t) next.scheduledDate = 'Ngày tổ chức phải từ hôm nay trở đi';
    }
    // Time order
    const startT = input.startTime ?? f.startTime;
    const endT = input.endTime ?? f.endTime;
    if (startT && endT && endT <= startT) {
      next.endTime = 'Giờ kết thúc phải sau giờ bắt đầu';
    }
    // Address
    if (input.kitchenAddress && input.kitchenAddress.trim().length < 5) {
      next.kitchenAddress = 'Địa chỉ tối thiểu 5 ký tự';
    }
    // Slots
    (['chefSlotsNeeded', 'waiterSlotsNeeded', 'shipperSlotsNeeded'] as const).forEach((k) => {
      const v = Number(f[k]);
      if (Number.isNaN(v)) next[k] = 'Phải là số';
      else if (v < 0) next[k] = 'Không được âm';
      else if (v > 50) next[k] = 'Tối đa 50';
    });
    // Reason (optional nhưng nếu nhập thì check)
    if (reason.trim().length > 500) {
      next.reason = 'Lý do tối đa 500 ký tự';
    }
    setErrors(next);
    return { input, ok: Object.keys(next).length === 0 };
  }

  async function doSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { input, ok } = validate();
    if (!ok) {
      const firstKey = Object.keys(errors)[0];
      toast.error(errors[firstKey] ?? 'Vui lòng kiểm tra lại các trường');
      return;
    }
    if (reason.trim()) input.reason = reason.trim();
    try {
      await submit.mutateAsync({ id: c.id, input });
      toast.success('Đã gửi yêu cầu thay đổi — chờ quản trị viên duyệt.');
      setReason('');
      setErrors({});
    } catch (err) {
      toast.error(errMsg(err, 'Gửi yêu cầu thất bại'));
    }
  }

  async function doCancel(id: string) {
    try {
      await cancel.mutateAsync(id);
      toast.success('Đã huỷ yêu cầu.');
    } catch (err) {
      toast.error(errMsg(err, 'Huỷ thất bại'));
    }
  }

  function inputCls(k: string, base: string) {
    return `${base} ${errors[k] ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`;
  }

  function FieldError({ k }: { k: string }) {
    if (!errors[k]) return null;
    return (
      <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
        <span className="material-symbols-outlined text-[13px]">error</span>
        {errors[k]}
      </p>
    );
  }

  return (
    <Modal
      onClose={onClose}
      align="top"
      className="bg-white rounded-3xl border border-neutral-150 w-full max-w-lg elevation-3 overflow-hidden"
    >
      <div className="bg-brand-gradient px-6 py-5 text-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined">tune</span>
          <div className="min-w-0">
            <h3 className="font-extrabold text-lg truncate">{c.title}</h3>
            <p className="text-xs text-white/80">Yêu cầu thay đổi · chờ admin duyệt</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
        {!editable && (
          <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 text-xs text-neutral-600 flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] text-neutral-400">info</span>
            Chỉ gửi được yêu cầu thay đổi khi chiến dịch đang ở trạng thái{' '}
            <b>&nbsp;Đang tuyển</b>. Trạng thái hiện tại:{' '}
            {CAMPAIGN_STATUS_META[c.status]?.label ?? c.status}.
          </div>
        )}

        {editable && (
          <form onSubmit={doSubmit} className="space-y-4">
            <div className="rounded-xl bg-honey-50 border border-honey-200 p-3 text-xs text-honey-800 flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              Chỉ sửa được khi còn đủ số ngày tối thiểu tới ngày diễn ra. Còn{' '}
              <b>&nbsp;{daysLeft} ngày</b>.
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs font-bold text-neutral-600 space-y-1 block">
                Ngày
                <input
                  type="date"
                  value={f.scheduledDate}
                  min={vnToday()}
                  onChange={(e) => {
                    setF({ ...f, scheduledDate: e.target.value });
                    if (errors.scheduledDate) setErr('scheduledDate', undefined);
                  }}
                  className={inputCls('scheduledDate', 'input-base')}
                  aria-invalid={!!errors.scheduledDate}
                />
                <FieldError k="scheduledDate" />
              </label>
              <label className="text-xs font-bold text-neutral-600 space-y-1 block">
                Bắt đầu
                <input
                  type="time"
                  value={f.startTime}
                  onChange={(e) => {
                    setF({ ...f, startTime: e.target.value });
                    if (errors.startTime) setErr('startTime', undefined);
                  }}
                  className={inputCls('startTime', 'input-base')}
                  aria-invalid={!!errors.startTime}
                />
              </label>
              <label className="text-xs font-bold text-neutral-600 space-y-1 block">
                Kết thúc
                <input
                  type="time"
                  value={f.endTime}
                  onChange={(e) => {
                    setF({ ...f, endTime: e.target.value });
                    if (errors.endTime) setErr('endTime', undefined);
                  }}
                  className={inputCls('endTime', 'input-base')}
                  aria-invalid={!!errors.endTime}
                />
                <FieldError k="endTime" />
              </label>
            </div>

            <label className="text-xs font-bold text-neutral-600 space-y-1 block">
              Địa chỉ bếp
              <input
                value={f.kitchenAddress}
                onChange={(e) => {
                  setF({ ...f, kitchenAddress: e.target.value });
                  if (errors.kitchenAddress) setErr('kitchenAddress', undefined);
                }}
                onBlur={() => {
                  if (f.kitchenAddress.trim() && f.kitchenAddress.trim().length < 5)
                    setErr('kitchenAddress', 'Địa chỉ tối thiểu 5 ký tự');
                }}
                className={inputCls('kitchenAddress', 'input-base')}
                aria-invalid={!!errors.kitchenAddress}
                maxLength={500}
              />
              <FieldError k="kitchenAddress" />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs font-bold text-honey-700 space-y-1 block">
                Đầu bếp
                <input
                  type="number"
                  min={c.chefSlotsFilled}
                  max={50}
                  value={f.chefSlotsNeeded}
                  onChange={(e) => {
                    setF({ ...f, chefSlotsNeeded: Number(e.target.value) });
                    if (errors.chefSlotsNeeded) setErr('chefSlotsNeeded', undefined);
                  }}
                  className={inputCls('chefSlotsNeeded', 'input-base')}
                  aria-invalid={!!errors.chefSlotsNeeded}
                />
                <FieldError k="chefSlotsNeeded" />
              </label>
              <label className="text-xs font-bold text-sky-700 space-y-1 block">
                Phục vụ
                <input
                  type="number"
                  min={c.waiterSlotsFilled}
                  max={50}
                  value={f.waiterSlotsNeeded}
                  onChange={(e) => {
                    setF({ ...f, waiterSlotsNeeded: Number(e.target.value) });
                    if (errors.waiterSlotsNeeded) setErr('waiterSlotsNeeded', undefined);
                  }}
                  className={inputCls('waiterSlotsNeeded', 'input-base')}
                  aria-invalid={!!errors.waiterSlotsNeeded}
                />
                <FieldError k="waiterSlotsNeeded" />
              </label>
              <label className="text-xs font-bold text-emerald-700 space-y-1 block">
                Giao hàng
                <input
                  type="number"
                  min={c.shipperSlotsFilled}
                  max={50}
                  value={f.shipperSlotsNeeded}
                  onChange={(e) => {
                    setF({ ...f, shipperSlotsNeeded: Number(e.target.value) });
                    if (errors.shipperSlotsNeeded) setErr('shipperSlotsNeeded', undefined);
                  }}
                  className={inputCls('shipperSlotsNeeded', 'input-base')}
                  aria-invalid={!!errors.shipperSlotsNeeded}
                />
                <FieldError k="shipperSlotsNeeded" />
              </label>
            </div>

            <label className="text-xs font-bold text-neutral-600 space-y-1 block">
              Lý do thay đổi (tuỳ chọn)
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (errors.reason) setErr('reason', undefined);
                }}
                rows={2}
                maxLength={500}
                className={inputCls('reason', 'input-base')}
                placeholder="VD: Đổi giờ vì bếp bận buổi sáng"
                aria-invalid={!!errors.reason}
              />
              <FieldError k="reason" />
            </label>

            <button
              type="submit"
              disabled={submit.isPending || hasPending}
              className="w-full py-3 bg-[#236c2a] hover:bg-[#1a4f1f] text-white font-bold text-sm rounded-xl disabled:opacity-50 transition-colors"
            >
              {hasPending
                ? 'Đã có yêu cầu đang chờ duyệt'
                : submit.isPending
                  ? 'Đang gửi...'
                  : 'Gửi yêu cầu thay đổi'}
            </button>
          </form>
        )}

        {/* Lịch sử yêu cầu thay đổi */}
        <div className="border-t border-neutral-100 pt-4">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-2">
            Lịch sử yêu cầu
          </p>
          {isLoading && <div className="h-12 skeleton rounded-xl" />}
          {!isLoading && (requests ?? []).length === 0 && (
            <p className="text-xs text-neutral-400">Chưa có yêu cầu thay đổi nào.</p>
          )}
          <div className="space-y-2">
            {(requests ?? []).map((r) => (
              <ChangeRequestRow
                key={r.id}
                r={r}
                onCancel={doCancel}
                cancelling={cancel.isPending}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ChangeRequestRow({
  r,
  onCancel,
  cancelling,
}: {
  r: CampaignChangeRequest;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const st = CHANGE_STATUS_META[r.status] ?? { label: r.status, chip: 'cm-chip cm-chip--ink' };
  const parts: string[] = [];
  if (r.scheduledDate)
    parts.push(`Ngày → ${new Date(r.scheduledDate).toLocaleDateString('vi-VN')}`);
  if (r.startTime || r.endTime)
    parts.push(`Giờ → ${r.startTime ?? '?'}–${r.endTime ?? '?'}`);
  if (r.kitchenAddress) parts.push(`Địa chỉ → ${r.kitchenAddress}`);
  if (r.chefSlotsNeeded != null) parts.push(`Đầu bếp → ${r.chefSlotsNeeded}`);
  if (r.waiterSlotsNeeded != null) parts.push(`Phục vụ → ${r.waiterSlotsNeeded}`);
  if (r.shipperSlotsNeeded != null) parts.push(`Giao hàng → ${r.shipperSlotsNeeded}`);

  return (
    <div className="rounded-xl border border-neutral-150 p-3 bg-neutral-50/50">
      <div className="flex items-center justify-between gap-2">
        <span className={st.chip}>{st.label}</span>
        <span className="text-[10px] text-neutral-400">
          {new Date(r.createdAt).toLocaleString('vi-VN')}
        </span>
      </div>
      <ul className="mt-1.5 text-xs text-neutral-700 space-y-0.5">
        {parts.map((p, i) => (
          <li key={i} className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px] text-emerald-600">
              arrow_right
            </span>
            {p}
          </li>
        ))}
      </ul>
      {r.reason && <p className="mt-1 text-[11px] text-neutral-500 italic">“{r.reason}”</p>}
      {r.reviewNote && (
        <p className="mt-1 text-[11px] text-rose-600">Ghi chú admin: {r.reviewNote}</p>
      )}
      {r.status === 'pending' && (
        <button
          type="button"
          onClick={() => onCancel(r.id)}
          disabled={cancelling}
          className="mt-2 text-[11px] font-bold text-rose-600 hover:text-rose-800 disabled:opacity-50"
        >
          Huỷ yêu cầu
        </button>
      )}
    </div>
  );
}