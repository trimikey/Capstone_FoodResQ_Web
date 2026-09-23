'use client';

import { useEffect, useRef, useState } from 'react';
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
 *
 * Mỗi điểm phát phải có ÍT NHẤT 1 ảnh làm bằng chứng đã giao tới đó — một ảnh chung
 * cho cả đợt không chứng minh được shipper đã tới đủ các điểm.
 */

/** Tối đa ảnh cho một điểm phát — đủ chụp toàn cảnh + cận cảnh, không thành album. */
const MAX_PHOTOS_PER_POINT = 3;

interface Props {
  distributionId: string;
  campaignId: string;
  roundLabel: string | null;
  plannedServings: number;
  points: DistributionPoint[];
  onClose: () => void;
  onDone: () => void;
}

interface ProofPhoto {
  id: string;
  file: File;
  preview: string;
  /** Thứ tự điểm phát (0-based); -1 = đợt không khai điểm, ảnh chung. */
  pointIndex: number;
}

export default function CompleteDistributionModal({
  distributionId,
  campaignId,
  roundLabel,
  plannedServings,
  points,
  onClose,
  onDone,
}: Props) {
  const complete = useCompleteDistribution();
  const [servings, setServings] = useState(String(plannedServings));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showMap, setShowMap] = useState(true);
  const [photos, setPhotos] = useState<ProofPhoto[]>([]);
  /** Điểm đang chọn ảnh — input file dùng chung cho mọi điểm. */
  const [pickingFor, setPickingFor] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ảnh preview là blob URL — thu hồi khi đóng modal để không giữ file trong bộ nhớ.
  const photosRef = useRef<ProofPhoto[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const slots =
    points.length > 0
      ? points.map((pt, i) => ({ index: i, title: `${i + 1}. ${pt.label}`, address: pt.address }))
      : [{ index: -1, title: 'Ảnh bằng chứng phân phát', address: '' }];
  const missingSlots = slots.filter((sl) => !photos.some((p) => p.pointIndex === sl.index));

  const s = Number(servings);
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
    if (missingSlots.length > 0) {
      next.proof =
        points.length > 1
          ? `Mỗi điểm phát cần ít nhất 1 ảnh — còn thiếu điểm ${missingSlots.map((sl) => sl.index + 1).join(', ')}.`
          : 'Chụp hoặc tải ít nhất 1 ảnh làm bằng chứng đã phát.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      // QUY TẮC: 1 suất = 1 người — BE tự ép số người = số suất, không gửi riêng.
      await complete.mutateAsync({
        distributionId,
        campaignId,
        actualServings: s,
        note: note.trim() || undefined,
        photos: photos.map((p) => ({ file: p.file, pointIndex: p.pointIndex })),
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

  function openPicker(pointIndex: number) {
    setPickingFor(pointIndex);
    fileRef.current?.click();
  }

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || pickingFor == null) return;
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, proof: 'Chỉ chấp nhận file ảnh (JPG/PNG/WebP).' }));
      return;
    }
    const pointIndex = pickingFor;
    setPhotos((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, file, preview: URL.createObjectURL(file), pointIndex },
    ]);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.proof;
      return next;
    });
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.id !== id);
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
          {/* 1 suất = 1 người — không còn ô nhập số người riêng, tránh số liệu lệch */}
          <p className="text-[11px] font-semibold normal-case text-neutral-500">
            Mỗi suất phát cho đúng 1 người — hệ thống tự ghi{' '}
            <b>{Number.isInteger(s) && s >= 0 ? s : 0} người nhận</b> theo số suất.
          </p>
        </label>

        {leftover > 0 && (
          <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            <span className="material-symbols-outlined text-[14px]">inventory_2</span>
            Còn dư {leftover} suất — ghi chú lại cách xử lý (gửi lại bếp, chuyển điểm khác…).
          </p>
        )}

        {/* Ảnh bằng chứng — mỗi điểm phát ít nhất 1 ảnh */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">
              Ảnh bằng chứng đã giao <span className="text-rose-500">*</span>
            </p>
            {points.length > 1 && (
              <span className="shrink-0 text-[11px] font-semibold text-neutral-500">
                {slots.length - missingSlots.length}/{slots.length} điểm có ảnh
              </span>
            )}
          </div>
          {points.length > 1 && (
            <p className="text-[11px] text-neutral-500">
              Chụp ít nhất 1 ảnh tại <b>mỗi</b> điểm phát (tối đa {MAX_PHOTOS_PER_POINT} ảnh/điểm).
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePickFile}
          />

          {slots.map((sl) => {
            const mine = photos.filter((p) => p.pointIndex === sl.index);
            const missing = mine.length === 0;
            return (
              <div
                key={sl.index}
                className={`rounded-xl border p-3 ${
                  missing && errors.proof ? 'border-rose-300 bg-rose-50/60' : 'border-neutral-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-xs font-bold text-neutral-800">
                      <span
                        className={`material-symbols-outlined text-[15px] ${missing ? 'text-neutral-400' : 'text-emerald-600'}`}
                      >
                        {missing ? 'radio_button_unchecked' : 'check_circle'}
                      </span>
                      <span className="truncate">{sl.title}</span>
                    </p>
                    {sl.address && <p className="mt-0.5 truncate pl-5 text-[11px] text-neutral-500">{sl.address}</p>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 pl-5">
                  {mine.map((p) => (
                    <div key={p.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.preview} alt={`Ảnh ${sl.title}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                        aria-label="Xoá ảnh"
                      >
                        <span className="material-symbols-outlined text-[13px]">close</span>
                      </button>
                    </div>
                  ))}
                  {mine.length < MAX_PHOTOS_PER_POINT && (
                    <button
                      type="button"
                      onClick={() => openPicker(sl.index)}
                      className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed transition-colors ${
                        missing && errors.proof
                          ? 'border-rose-400 text-rose-600'
                          : 'border-neutral-300 text-neutral-500 hover:border-emerald-400 hover:text-emerald-700'
                      }`}
                      aria-label={`Thêm ảnh cho ${sl.title}`}
                    >
                      <span className="material-symbols-outlined text-[22px]">add_a_photo</span>
                      <span className="text-[9px] font-bold">{missing ? 'Chụp' : 'Thêm'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {errors.proof && (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-600">
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
