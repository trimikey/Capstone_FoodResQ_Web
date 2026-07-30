'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import {
  useAddShift,
  useUpdateShift,
  type ShiftInput,
  type ShiftUpdateInput,
  type CampaignShift,
} from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

interface Props {
  campaignId: string;
  shift?: CampaignShift;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ShiftFormModal({ campaignId, shift, onClose, onSaved }: Props) {
  const isEdit = !!shift;
  const addShift = useAddShift();
  const updateShift = useUpdateShift();
  const [label, setLabel] = useState(shift?.label ?? '');
  const [role, setRole] = useState<string>(shift?.role ?? '');
  const [startTime, setStartTime] = useState(shift?.startTime?.slice(0, 5) ?? '08:00');
  const [endTime, setEndTime] = useState(shift?.endTime?.slice(0, 5) ?? '12:00');
  const [slotsNeeded, setSlotsNeeded] = useState<number>(shift?.slotsNeeded ?? 1);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setErr = (k: string, v: string | undefined) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });
  };

  function validate(): { ok: boolean } {
    const next: Record<string, string> = {};
    if (label.trim().length < 2) next.label = 'Tên ca tối thiểu 2 ký tự';
    if (label.trim().length > 100) next.label = 'Tên ca tối đa 100 ký tự';
    if (!/^\d{2}:\d{2}$/.test(startTime)) next.startTime = 'Giờ bắt đầu không hợp lệ';
    if (!/^\d{2}:\d{2}$/.test(endTime)) next.endTime = 'Giờ kết thúc không hợp lệ';
    if (startTime && endTime && endTime <= startTime) {
      next.endTime = 'Giờ kết thúc phải sau giờ bắt đầu';
    }
    if (!Number.isInteger(slotsNeeded) || slotsNeeded < 0) {
      next.slotsNeeded = 'Số người cần ≥ 0';
    }
    if (slotsNeeded > 100) next.slotsNeeded = 'Số người cần tối đa 100';
    setErrors(next);
    return { ok: Object.keys(next).length === 0 };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { ok } = validate();
    if (!ok) return;
    try {
      if (isEdit && shift) {
        const payload: ShiftUpdateInput = {
          label: label.trim(),
          startTime,
          endTime,
          slotsNeeded,
          role: (role || null) as ShiftUpdateInput['role'],
        };
        await updateShift.mutateAsync({
          campaignId,
          shiftId: shift.id,
          input: payload,
        });
        toast.success('Đã cập nhật ca trực');
      } else {
        const payload: ShiftInput = {
          label: label.trim(),
          startTime,
          endTime,
          slotsNeeded,
          role: (role || undefined) as ShiftInput['role'],
        };
        await addShift.mutateAsync({ campaignId, input: payload });
        toast.success('Đã thêm ca trực');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(errMsg(err, isEdit ? 'Cập nhật thất bại' : 'Thêm ca thất bại'));
    }
  }

  const pending = addShift.isPending || updateShift.isPending;

  return (
    <Modal
      onClose={onClose}
      align="center"
      className="bg-white rounded-3xl border border-neutral-150 w-full max-w-md elevation-3 overflow-hidden"
    >
      <div className="bg-brand-gradient px-6 py-5 text-white">
        <h3 className="font-extrabold text-lg flex items-center gap-2">
          <span className="material-symbols-outlined">event</span>
          {isEdit ? 'Sửa ca trực' : 'Thêm ca trực'}
        </h3>
        <p className="text-xs text-white/80 mt-1">
          Phân theo sơ chế / nấu / vận chuyển để dễ theo dõi
        </p>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Tên ca <span className="text-rose-500">*</span>
          <input
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (errors.label) setErr('label', undefined);
            }}
            placeholder="VD: Ca sáng — Sơ chế"
            maxLength={100}
            className={`input-base ${errors.label ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
          />
          {errors.label && (
            <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">error</span>
              {errors.label}
            </p>
          )}
        </label>

        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Vai trò (tuỳ chọn)
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input-base"
          >
            <option value="">Tất cả vai trò</option>
            <option value="chef">Đầu bếp</option>
            <option value="waiter">Phục vụ</option>
            <option value="shipper">Giao hàng</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
            Giờ bắt đầu <span className="text-rose-500">*</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                if (errors.startTime) setErr('startTime', undefined);
              }}
              className={`input-base ${errors.startTime ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            />
            {errors.startTime && (
              <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">error</span>
                {errors.startTime}
              </p>
            )}
          </label>
          <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
            Giờ kết thúc <span className="text-rose-500">*</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
                if (errors.endTime) setErr('endTime', undefined);
              }}
              className={`input-base ${errors.endTime ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            />
            {errors.endTime && (
              <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">error</span>
                {errors.endTime}
              </p>
            )}
          </label>
        </div>

        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Số người cần <span className="text-rose-500">*</span>
          <input
            type="number"
            min={0}
            max={100}
            value={slotsNeeded}
            onChange={(e) => {
              setSlotsNeeded(Number(e.target.value));
              if (errors.slotsNeeded) setErr('slotsNeeded', undefined);
            }}
            className={`input-base ${errors.slotsNeeded ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
          />
          {errors.slotsNeeded && (
            <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">error</span>
              {errors.slotsNeeded}
            </p>
          )}
        </label>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 font-bold text-sm rounded-xl"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-3 bg-[#236c2a] hover:bg-[#1a4f1f] text-white font-bold text-sm rounded-xl disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {pending ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Đang lưu...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">check</span>
                {isEdit ? 'Lưu thay đổi' : 'Thêm ca'}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
