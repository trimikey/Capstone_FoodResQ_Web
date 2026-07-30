'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import { useAppendSupplyItem } from '@/hooks/useCampaigns';
import { errMsg } from '@/lib/utils';

interface Props {
  campaignId: string;
  onClose: () => void;
}

export default function AddSupplyModal({ campaignId, onClose }: Props) {
  const append = useAppendSupplyItem();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<string>('');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState<string | undefined>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 1) {
      setError('Tên vật phẩm không được để trống');
      return;
    }
    if (name.trim().length > 80) {
      setError('Tên vật phẩm tối đa 80 ký tự');
      return;
    }
    const qNum = quantity.trim() ? Number(quantity) : undefined;
    if (qNum !== undefined && (!Number.isFinite(qNum) || qNum < 0)) {
      setError('Số lượng phải là số ≥ 0');
      return;
    }
    if (unit.length > 20) {
      setError('Đơn vị tối đa 20 ký tự');
      return;
    }
    try {
      await append.mutateAsync({
        campaignId,
        input: { name: name.trim(), quantity: qNum, unit: unit.trim() || undefined },
      });
      toast.success('Đã thêm vật phẩm');
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'Thêm vật phẩm thất bại'));
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
          <span className="material-symbols-outlined">inventory_2</span>
          Thêm vật phẩm
        </h3>
        <p className="text-xs text-white/80 mt-1">Liệt kê để kêu gọi nhà hảo tâm hỗ trợ</p>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
          Tên vật phẩm <span className="text-rose-500">*</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(undefined);
            }}
            placeholder="VD: Gạo sạch"
            maxLength={80}
            className={`input-base ${error ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
            Số lượng cần
            <input
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                if (error) setError(undefined);
              }}
              placeholder="VD: 10"
              className={`input-base ${error ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            />
          </label>
          <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wide space-y-1">
            Đơn vị
            <input
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                if (error) setError(undefined);
              }}
              placeholder="kg / thùng / phần"
              maxLength={20}
              className={`input-base ${error ? '!border-rose-500 !ring-1 !ring-rose-200' : ''}`}
            />
          </label>
        </div>

        {error && (
          <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">error</span>
            {error}
          </p>
        )}

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
            disabled={append.isPending}
            className="flex-1 py-3 bg-[#236c2a] hover:bg-[#1a4f1f] text-white font-bold text-sm rounded-xl disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {append.isPending ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Đang lưu...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">check</span>
                Thêm vật phẩm
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
