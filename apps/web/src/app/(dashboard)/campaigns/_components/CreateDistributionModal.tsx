'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import { useCreateDistribution } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

interface Props {
  campaignId: string;
  onClose: () => void;
  onCreated?: () => void;
}

export default function CreateDistributionModal({ campaignId, onClose, onCreated }: Props) {
  const create = useCreateDistribution();
  const [roundLabel, setRoundLabel] = useState('');
  const [servings, setServings] = useState<string>('');
  const [people, setPeople] = useState<string>('');
  const [leftover, setLeftover] = useState<string>('0');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setErr = (k: string, v: string | undefined) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });
  };

  function validate(): { servingsServed: number; peopleServed: number; leftoverServings: number; roundLabel?: string; note?: string } | null {
    const next: Record<string, string> = {};
    const s = Number(servings);
    const p = Number(people);
    const l = Number(leftover || '0');
    if (!servings.trim() || !Number.isFinite(s) || s < 0 || !Number.isInteger(s)) {
      next.servings = 'Vui lòng nhập số nguyên ≥ 0';
    }
    if (!people.trim() || !Number.isFinite(p) || p < 0 || !Number.isInteger(p)) {
      next.people = 'Vui lòng nhập số nguyên ≥ 0';
    }
    if (leftover.trim() && (!Number.isFinite(l) || l < 0 || !Number.isInteger(l))) {
      next.leftover = 'Số suất thừa phải là số nguyên ≥ 0';
    }
    if (roundLabel.trim().length > 100) {
      next.roundLabel = 'Tên đợt tối đa 100 ký tự';
    }
    if (note.trim().length > 500) {
      next.note = 'Ghi chú tối đa 500 ký tự';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return null;
    return {
      servingsServed: s,
      peopleServed: p,
      leftoverServings: l,
      roundLabel: roundLabel.trim() || undefined,
      note: note.trim() || undefined,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = validate();
    if (!payload) return;
    try {
      await create.mutateAsync({ campaignId, input: payload });
      toast.success('Đã ghi nhận đợt phát');
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'Ghi nhận đợt phát thất bại'));
    }
  }

  return (
    <Modal
      onClose={onClose}
      align="center"
      className="bg-white rounded-3xl border border-neutral-150 w-full max-w-md elevation-3 overflow-hidden"
    >
      <div className="bg-brand-gradient px-6 py-5 text-white">
        <h3 className="font-extrabold text-lg flex items-center gap-2">
          <span className="material-symbols-outlined">takeout_dining</span>
          Ghi nhận đợt phát
        </h3>
        <p className="text-xs text-white/80 mt-1">Số liệu sẽ cộng dồn vào thống kê chiến dịch</p>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Tên đợt (tuỳ chọn)
          <input
            value={roundLabel}
            onChange={(e) => {
              setRoundLabel(e.target.value);
              if (errors.roundLabel) setErr('roundLabel', undefined);
            }}
            placeholder="VD: Đợt 1 — trưa nay"
            maxLength={100}
            className={`input-base ${errors.roundLabel ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
          />
          {errors.roundLabel && <p className="text-[11px] text-rose-600 font-semibold">{errors.roundLabel}</p>}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
            Số suất đã phát <span className="text-rose-500">*</span>
            <input
              type="number"
              min={0}
              value={servings}
              onChange={(e) => {
                setServings(e.target.value);
                if (errors.servings) setErr('servings', undefined);
              }}
              placeholder="VD: 150"
              className={`input-base ${errors.servings ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            />
            {errors.servings && (
              <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">error</span>
                {errors.servings}
              </p>
            )}
          </label>

          <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
            Số người nhận <span className="text-rose-500">*</span>
            <input
              type="number"
              min={0}
              value={people}
              onChange={(e) => {
                setPeople(e.target.value);
                if (errors.people) setErr('people', undefined);
              }}
              placeholder="VD: 150"
              className={`input-base ${errors.people ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            />
            {errors.people && (
              <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">error</span>
                {errors.people}
              </p>
            )}
          </label>
        </div>

        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Số suất thừa (mặc định 0)
          <input
            type="number"
            min={0}
            value={leftover}
            onChange={(e) => {
              setLeftover(e.target.value);
              if (errors.leftover) setErr('leftover', undefined);
            }}
            className={`input-base ${errors.leftover ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
          />
          {errors.leftover && <p className="text-[11px] text-rose-600 font-semibold">{errors.leftover}</p>}
        </label>

        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Ghi chú (tuỳ chọn)
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (errors.note) setErr('note', undefined);
            }}
            maxLength={500}
            rows={2}
            placeholder="VD: Phát tại cổng trường tiểu học A, 12:00–13:00"
            className={`input-base ${errors.note ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
          />
          {errors.note && <p className="text-[11px] text-rose-600 font-semibold">{errors.note}</p>}
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
            disabled={create.isPending}
            className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {create.isPending ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Đang lưu...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">check</span>
                Lưu đợt phát
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
