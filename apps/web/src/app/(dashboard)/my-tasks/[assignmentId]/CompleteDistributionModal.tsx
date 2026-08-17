'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import { useCompleteDistribution, type DistributionPoint } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

const PointsMap = dynamic(() => import('./DistributionPointsMap'), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse rounded-xl bg-neutral-100" />,
});

/**
 * Chốt một đợt phát: shipper báo số THỰC PHÁT rồi mới đóng đợt.
 *
 * Trước đây bấm "Xác nhận đã phát xong" là đóng luôn theo số tổ chức lên kế hoạch —
 * kế hoạch 50 suất mà chỉ phát được 38 thì thống kê chiến dịch vẫn ghi 50. Nhập tay
 * con số thật ở đây mới ra báo cáo dùng được.
 */

interface Props {
  distributionId: string;
  campaignId: string;
  roundLabel: string | null;
  plannedServings: number;
  plannedPeople: number;
  points: DistributionPoint[];
  onClose: () => void;
  onDone: () => void;
}

export default function CompleteDistributionModal({
  distributionId,
  campaignId,
  roundLabel,
  plannedServings,
  plannedPeople,
  points,
  onClose,
  onDone,
}: Props) {
  const complete = useCompleteDistribution();
  const [servings, setServings] = useState(String(plannedServings));
  const [people, setPeople] = useState(String(Math.min(plannedPeople, plannedServings)));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showMap, setShowMap] = useState(true);
  /** Ảnh bằng chứng phân phát — bắt buộc để tránh shipper bấm chốt mà không đi phát thật. */
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const s = Number(servings);
  const p = Number(people);
  const leftover = Number.isFinite(s) ? Math.max(0, plannedServings - s) : 0;
  const pinned = points.filter(
    (pt): pt is DistributionPoint & { lng: number; lat: number } =>
      typeof pt.lng === 'number' && typeof pt.lat === 'number',
  );

  async function submit() {
    const next: Record<string, string> = {};
    if (!servings.trim() || !Number.isInteger(s) || s < 0) {
      next.servings = 'Nhập số nguyên ≥ 0';
    } else if (s > plannedServings) {
      next.servings = `Không thể vượt ${plannedServings} suất đã nhận`;
    }
    if (!people.trim() || !Number.isInteger(p) || p < 0) {
      next.people = 'Nhập số nguyên ≥ 0';
    } else if (!next.servings && p > s) {
      next.people = `Không thể nhiều hơn ${s} suất đã phát`;
    }
    if (!proofFile) {
      next.proof = 'Chụp hoặc tải ảnh làm bằng chứng phân phát';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      await complete.mutateAsync({
        distributionId,
        campaignId,
        actualServings: s,
        actualPeopleServed: p,
        note: note.trim() || undefined,
        proofPhoto: proofFile!,
      });
      toast.success(
        leftover > 0
          ? `Đã chốt: phát ${s}/${plannedServings} suất, còn dư ${leftover}.`
          : `Đã chốt: phát đủ ${s} suất.`,
      );
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Xác nhận thất bại'));
    }
  }

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, proof: 'Chỉ chấp nhận file ảnh (JPG/PNG/WebP).' }));
      return;
    }
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.proof;
      return next;
    });
  }

  return (
    <Modal
      onClose={onClose}
      align="center"
      className="w-full max-w-lg max-h-[92vh] overflow-hidden rounded-3xl border border-neutral-150 bg-white elevation-3 flex flex-col"
    >
      <div className="bg-brand-gradient px-6 py-5 text-white shrink-0">
        <h3 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="material-symbols-outlined">fact_check</span>
          Chốt đợt phát
        </h3>
        <p className="mt-1 text-xs text-white/80">
          {roundLabel || 'Đợt phát'} · kế hoạch {plannedServings} suất
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {/* Bản đồ các điểm phát */}
        {pinned.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700"
            >
              <span className="material-symbols-outlined text-[16px]">map</span>
              {showMap ? 'Ẩn bản đồ' : `Xem bản đồ ${pinned.length} điểm`}
            </button>
            {showMap && (
              <div className="h-48 overflow-hidden rounded-xl border border-neutral-200">
                <PointsMap points={pinned} />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-neutral-600">
            Số suất đã phát <span className="text-rose-500">*</span>
            <input
              type="number"
              min={0}
              max={plannedServings}
              value={servings}
              onChange={(e) => {
                setServings(e.target.value);
                setErrors((p2) => ({ ...p2, servings: '' }));
              }}
              className={`input-base ${errors.servings ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            />
            {errors.servings && (
              <p className="text-[11px] font-semibold normal-case text-rose-600">{errors.servings}</p>
            )}
          </label>

          <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-neutral-600">
            Số người nhận <span className="text-rose-500">*</span>
            <input
              type="number"
              min={0}
              value={people}
              onChange={(e) => {
                setPeople(e.target.value);
                setErrors((p2) => ({ ...p2, people: '' }));
              }}
              className={`input-base ${errors.people ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            />
            {errors.people && (
              <p className="text-[11px] font-semibold normal-case text-rose-600">{errors.people}</p>
            )}
          </label>
        </div>

        {leftover > 0 && (
          <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            <span className="material-symbols-outlined text-[14px]">inventory_2</span>
            Còn dư {leftover} suất — ghi chú lại cách xử lý (gửi lại bếp, chuyển điểm khác…).
          </p>
        )}

        {/* Ảnh bằng chứng phân phát — bắt buộc để xác minh đợt phát thực sự diễn ra. */}
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">
            Ảnh bằng chứng phân phát <span className="text-rose-500">*</span>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePickFile}
          />
          <div className="flex items-start gap-3">
            {proofPreview ? (
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-neutral-200">
                <img src={proofPreview} alt="Ảnh bằng chứng" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setProofFile(null);
                    setProofPreview(null);
                  }}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                  aria-label="Xoá ảnh"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition-colors ${
                  errors.proof
                    ? 'border-rose-400 bg-rose-50 text-rose-600'
                    : 'border-neutral-300 bg-neutral-50 text-neutral-500 hover:border-emerald-400 hover:text-emerald-700'
                }`}
              >
                <span className="material-symbols-outlined text-[28px]">photo_camera</span>
                <span className="text-[10px] font-bold">Chụp / tải</span>
              </button>
            )}
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
              >
                <span className="material-symbols-outlined text-[14px]">add_a_photo</span>
                {proofFile ? 'Đổi ảnh khác' : 'Chọn ảnh bằng chứng'}
              </button>
              <p className="mt-1 text-[11px] text-neutral-500">
                Bắt buộc: chụp khung cảnh sau khi phát xong để làm bằng chứng cho tổ chức.
              </p>
              {proofFile && (
                <p className="mt-0.5 truncate text-[11px] font-semibold text-neutral-700">
                  {proofFile.name} · {(proofFile.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>
          </div>
          {errors.proof && (
            <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">error</span>
              {errors.proof}
            </p>
          )}
        </div>

        <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-neutral-600">
          Ghi chú (tuỳ chọn)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="VD: mưa lớn nên ít người tới, còn dư 12 suất đã gửi lại bếp."
            className="input-base resize-none"
          />
        </label>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-neutral-100 p-4">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
        >
          Huỷ
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={complete.isPending}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#236c2a] py-3 text-sm font-bold text-white hover:bg-[#1a4f1f] disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">check</span>
          {complete.isPending ? 'Đang lưu…' : 'Xác nhận đã phát'}
        </button>
      </div>
    </Modal>
  );
}
