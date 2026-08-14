'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import { useConfirmIngredientPickup, type PickupOrder } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

/**
 * Shipper chốt "đã lấy nguyên liệu": ảnh chụp hàng + số kg THỰC NHẬN.
 *
 * Bấm "xong" suông không đủ — bếp đặt 30kg mà chỉ lấy được 22kg thì thực đơn phải
 * tính lại NGAY, chứ không phải lúc đã nấu dở. Ảnh là bằng chứng, số kg là dữ liệu.
 */

interface Props {
  order: PickupOrder;
  onClose: () => void;
  onDone: () => void;
}

export default function ConfirmPickupModal({ order, onClose, onDone }: Props) {
  const confirm = useConfirmIngredientPickup();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [kg, setKg] = useState(order.quantityKg != null ? String(order.quantityKg) : '');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Ảnh preview là blob URL — không revoke thì giữ file trong bộ nhớ tới khi reload.
  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const received = Number(kg);
  const requested = order.quantityKg;
  const shortfall =
    requested != null && Number.isFinite(received) ? Math.round((requested - received) * 10) / 10 : 0;

  async function submit() {
    const next: Record<string, string> = {};
    if (!photo) next.photo = 'Bắt buộc chụp ảnh nguyên liệu đã lấy';
    if (!kg.trim() || !Number.isFinite(received) || received < 0) {
      next.kg = 'Nhập số kg thực nhận (≥ 0)';
    } else if (requested != null && received > requested * 1.5) {
      next.kg = `Vượt quá 150% số đã đặt (${requested} kg) — kiểm tra lại`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      const res = await confirm.mutateAsync({
        requestId: order.id,
        receivedKg: received,
        photo: photo!,
        note: note.trim() || undefined,
      });
      toast.success(
        res.shortfallKg > 0
          ? `Đã ghi nhận ${res.receivedKg} kg — thiếu ${res.shortfallKg} kg, tổ chức đã được báo.`
          : `Đã ghi nhận lấy đủ ${res.receivedKg} kg.`,
      );
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Xác nhận thất bại'));
    }
  }

  return (
    <Modal
      onClose={onClose}
      align="center"
      className="w-full max-w-lg max-h-[92vh] overflow-hidden rounded-3xl border border-neutral-150 bg-white elevation-3 flex flex-col"
    >
      <div className="bg-brand-gradient px-6 py-5 text-white shrink-0">
        <h3 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="material-symbols-outlined">inventory</span>
          Xác nhận đã lấy nguyên liệu
        </h3>
        <p className="mt-1 text-xs text-white/80">
          {order.providerName}
          {requested != null && ` · đơn đặt ${requested} kg`}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {/* Ảnh bằng chứng */}
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-neutral-600">
            Ảnh nguyên liệu đã lấy <span className="text-rose-500">*</span>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setPhoto(f);
              setErrors((p) => ({ ...p, photo: '' }));
            }}
          />
          {preview ? (
            <div className="relative overflow-hidden rounded-2xl border border-neutral-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Nguyên liệu đã lấy" className="h-44 w-full object-cover" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2.5 py-1.5 text-[11px] font-bold text-white backdrop-blur"
              >
                <span className="material-symbols-outlined text-[14px]">refresh</span>
                Chụp lại
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`flex h-32 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-sm font-bold transition ${
                errors.photo
                  ? 'border-rose-300 bg-rose-50 text-rose-600'
                  : 'border-neutral-300 text-neutral-500 hover:border-emerald-400 hover:text-emerald-700'
              }`}
            >
              <span className="material-symbols-outlined text-[28px]">photo_camera</span>
              Chụp ảnh nguyên liệu
              <span className="text-[11px] font-semibold normal-case text-neutral-400">
                Chụp rõ toàn bộ số hàng đã nhận
              </span>
            </button>
          )}
          {errors.photo && (
            <p className="mt-1 text-[11px] font-semibold text-rose-600">{errors.photo}</p>
          )}
        </div>

        {/* Số kg thực nhận */}
        <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-neutral-600">
          Số kg thực nhận <span className="text-rose-500">*</span>
          <div className="relative">
            <input
              type="number"
              min={0}
              step="0.1"
              value={kg}
              onChange={(e) => {
                setKg(e.target.value);
                setErrors((p) => ({ ...p, kg: '' }));
              }}
              placeholder={requested != null ? String(requested) : 'VD: 28.5'}
              className={`input-base pr-10 ${errors.kg ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400">
              kg
            </span>
          </div>
          {errors.kg && <p className="text-[11px] font-semibold normal-case text-rose-600">{errors.kg}</p>}
          {requested == null && !errors.kg && (
            <p className="text-[11px] font-semibold normal-case text-neutral-400">
              Đơn này chưa khai số kg — nhập đúng số cân thực tế bạn nhận được.
            </p>
          )}
        </label>

        {shortfall > 0 && (
          <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            <span className="material-symbols-outlined text-[14px]">warning</span>
            Thiếu {shortfall} kg so với đơn đặt ({requested} kg). Ghi rõ lý do bên dưới — bếp cần
            biết ngay để tính lại thực đơn.
          </p>
        )}

        <label className="block space-y-1 text-xs font-bold uppercase tracking-wide text-neutral-600">
          Ghi chú {shortfall > 0 ? <span className="text-rose-500">*</span> : '(tuỳ chọn)'}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="VD: NCC chỉ còn 22kg rau, hẹn bổ sung chiều nay."
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
          disabled={confirm.isPending}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#236c2a] py-3 text-sm font-bold text-white hover:bg-[#1a4f1f] disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">check</span>
          {confirm.isPending ? 'Đang gửi…' : 'Xác nhận đã lấy'}
        </button>
      </div>
    </Modal>
  );
}
