'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import { useCreateDistribution, type CreateDistributionInput } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

interface Props {
  campaignId: string;
  onClose: () => void;
  onCreated?: () => void;
  /** TNV đã được duyệt của chiến dịch — nguồn cho ô "người phụ trách". */
  volunteers: Array<{ volunteerId: string; fullName: string; role: string }>;
  /** Số suất còn được ghi nhận = mục tiêu − (đã phát + đã thừa). null = chưa đặt mục tiêu. */
  remainingServings: number | null;
}

const ROLE_VN: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

export default function CreateDistributionModal({
  campaignId,
  onClose,
  onCreated,
  volunteers,
  remainingServings,
}: Props) {
  const create = useCreateDistribution();
  const [servedBy, setServedBy] = useState('');
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

  function validate(): CreateDistributionInput | null {
    const next: Record<string, string> = {};
    const s = Number(servings);
    const p = Number(people);
    const l = Number(leftover || '0');
    if (!servings.trim() || !Number.isFinite(s) || s < 1 || !Number.isInteger(s)) {
      next.servings = 'Vui lòng nhập số nguyên ≥ 1';
    }
    if (!people.trim() || !Number.isFinite(p) || p < 1 || !Number.isInteger(p)) {
      next.people = 'Vui lòng nhập số nguyên ≥ 1';
    }
    if (leftover.trim() && (!Number.isFinite(l) || l < 0 || !Number.isInteger(l))) {
      next.leftover = 'Số suất thừa phải là số nguyên ≥ 0';
    }
    // Mỗi người nhận ít nhất 1 suất — 10 suất mà ghi 25 người là số liệu sai.
    if (!next.servings && !next.people && p > s) {
      next.people = `Không thể nhiều hơn số suất đã phát (${s})`;
    }
    // Không vượt số suất chiến dịch đăng ký. Suất thừa cùng mẻ nấu nên tính chung.
    if (!next.servings && !next.leftover && remainingServings != null && s + l > remainingServings) {
      next.servings = `Chỉ còn ${remainingServings} suất — đang ghi ${s} phát + ${l} thừa`;
    }
    if (!servedBy) {
      next.servedBy = 'Chọn tình nguyện viên phụ trách đợt phát';
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
      servedByVolunteerId: servedBy,
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
        {/* Người phụ trách phải là TNV đã được duyệt của CHÍNH chiến dịch này — backend
            cũng kiểm lại. Trước đây trường này không có và server tự gán bừa. */}
        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Người phụ trách <span className="text-rose-500">*</span>
          {volunteers.length === 0 ? (
            <p className="mt-1 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-semibold normal-case text-amber-800">
              Chưa có tình nguyện viên nào được duyệt — hãy duyệt ít nhất 1 đăng ký trước.
            </p>
          ) : (
            <select
              value={servedBy}
              onChange={(e) => {
                setServedBy(e.target.value);
                if (errors.servedBy) setErr('servedBy', undefined);
              }}
              className={`input-base ${errors.servedBy ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            >
              <option value="">— Chọn người phụ trách —</option>
              {volunteers.map((v) => (
                <option key={v.volunteerId} value={v.volunteerId}>
                  {v.fullName} · {ROLE_VN[v.role] ?? v.role}
                </option>
              ))}
            </select>
          )}
          {errors.servedBy && (
            <p className="text-[11px] text-rose-600 font-semibold normal-case">{errors.servedBy}</p>
          )}
        </label>

        {remainingServings != null && (
          <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
            <span className="material-symbols-outlined text-[14px]">inventory</span>
            Còn {remainingServings} suất được ghi nhận (đã trừ các đợt trước).
          </p>
        )}

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
            className="flex-1 py-3 bg-[#236c2a] hover:bg-[#1a4f1f] text-white font-bold text-sm rounded-xl disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
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
