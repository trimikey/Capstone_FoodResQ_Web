'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useUpdateListing, type ProviderListing } from '@/hooks/useProviderListings';
import { UNIT_LABEL } from '@/lib/utils';
import { QuantityUnit } from '@foodresq/types';
import { formatVietnamDateTime, toIso, toLocalInputSingle } from '@/lib/listing-form';

type Mode = 'extend_time' | 'add_quantity' | 'both';

interface Props {
  open: boolean;
  onClose: () => void;
  listing: ProviderListing;
  /** Mặc định mở tab nào; nếu 'both' hiển thị 2 nút gia hạn */
  defaultMode?: Mode;
}

/** Convert timestamp đã lưu về input datetime-local theo giờ Việt Nam. */
function toLocalInputValue(iso: string): string {
  return toLocalInputSingle(iso);
}

function addHours(iso: string, hours: number): string {
  const d = new Date(iso);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

export default function ExtendListingModal({ open, onClose, listing, defaultMode = 'both' }: Props) {
  const updateListing = useUpdateListing();
  const remaining = Number(listing.quantityRemaining);
  const total = Number(listing.quantityTotal);
  const reserved = total - remaining;
  const unit = UNIT_LABEL[listing.quantityUnit as QuantityUnit] || 'suất';

  const [tab, setTab] = useState<Mode>(defaultMode);

  // --- Gia hạn giờ ---
  const [newEndTime, setNewEndTime] = useState(() => toLocalInputValue(listing.pickupEndTime));
  const [newExpiry, setNewExpiry] = useState(() => toLocalInputValue(listing.expiryTime));

  // --- Tăng số lượng ---
  const [addQty, setAddQty] = useState<number>(5);
  const [extendQtyHours, setExtendQtyHours] = useState<boolean>(false);

  useEffect(() => {
    if (!open) return;
    setTab(defaultMode);
    setNewEndTime(toLocalInputValue(listing.pickupEndTime));
    setNewExpiry(toLocalInputValue(listing.expiryTime));
    setAddQty(5);
    setExtendQtyHours(false);
  }, [open, listing, defaultMode]);

  if (!open) return null;

  const isExtend = tab === 'extend_time' || tab === 'both';
  const isQty = tab === 'add_quantity' || tab === 'both';

  async function submitExtendTime() {
    if (!newEndTime) {
      toast.error('Vui lòng chọn giờ kết thúc nhận mới.');
      return;
    }
    const endDate = new Date(toIso(newEndTime));
    if (endDate <= new Date(listing.pickupEndTime)) {
      toast.error('Giờ kết thúc phải sau giờ hiện tại.');
      return;
    }
    try {
      await updateListing.mutateAsync({
        id: listing.id,
        input: {
          pickupEndTime: toIso(newEndTime),
          expiryTime: toIso(newExpiry),
        },
      });
      toast.success('Đã gia hạn thời gian nhận hàng.');
      onClose();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Gia hạn thất bại';
      toast.error(msg);
    }
  }

  async function submitAddQuantity() {
    if (!addQty || addQty <= 0) {
      toast.error('Số lượng thêm phải lớn hơn 0.');
      return;
    }
    const newTotal = total + addQty;
    try {
      await updateListing.mutateAsync({
        id: listing.id,
        input: {
          quantityTotal: newTotal,
          ...(extendQtyHours
            ? {
                pickupEndTime: addHours(listing.pickupEndTime, 2),
                expiryTime: addHours(listing.expiryTime, 2),
              }
            : {}),
        },
      });
      toast.success(
        `Đã thêm ${addQty} ${unit} (tổng mới: ${newTotal}). ${
          extendQtyHours ? 'Đồng thời gia hạn +2h.' : ''
        }`.trim(),
      );
      onClose();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Cập nhật thất bại';
      toast.error(msg);
    }
  }

  async function submitAll() {
    if (!newEndTime) {
      toast.error('Vui lòng chọn giờ kết thúc nhận mới.');
      return;
    }
    const endDate = new Date(toIso(newEndTime));
    if (endDate <= new Date(listing.pickupEndTime)) {
      toast.error('Giờ kết thúc phải sau giờ hiện tại.');
      return;
    }
    if (!addQty || addQty <= 0) {
      toast.error('Số lượng thêm phải lớn hơn 0.');
      return;
    }
    try {
      await updateListing.mutateAsync({
        id: listing.id,
        input: {
          pickupEndTime: toIso(newEndTime),
          expiryTime: toIso(newExpiry),
          quantityTotal: total + addQty,
        },
      });
      toast.success(`Đã gia hạn + thêm ${addQty} ${unit}.`);
      onClose();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Cập nhật thất bại';
      toast.error(msg);
    }
  }

  const submitting = updateListing.isPending;
  const canSubmit = isExtend && isQty ? !submitting : !submitting;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-lg max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0 rounded-t-2xl">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-white text-[18px]">close</span>
          </button>
          <h3 className="font-extrabold text-white text-base pr-8">Gia hạn & bổ sung</h3>
          <p className="text-xs text-white/70 mt-0.5 truncate">{listing.title}</p>
        </div>

        {/* Tabs (sticky above body scroll) */}
        {defaultMode === 'both' && (
          <div className="shrink-0 flex border-b border-neutral-200 bg-neutral-50">
            <TabBtn active={tab === 'extend_time'} onClick={() => setTab('extend_time')} icon="schedule" label="Gia hạn giờ" />
            <TabBtn active={tab === 'add_quantity'} onClick={() => setTab('add_quantity')} icon="add_circle" label="Thêm số lượng" />
            <TabBtn active={tab === 'both'} onClick={() => setTab('both')} icon="bolt" label="Cả hai" />
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="p-5 space-y-5">
          {/* Tổng quan nhanh */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat icon="inventory_2" label="Còn lại" value={`${remaining}`} unit={unit} />
            <Stat icon="shopping_bag" label="Đã đặt" value={`${reserved}`} unit={unit} />
            <Stat icon="schedule" label="Hết hạn" value={formatVietnamDateTime(listing.pickupEndTime).replace(/\/\d{4} /, ' ')} small />
          </div>

          {/* Gia hạn giờ */}
          {isExtend && (
            <section className="space-y-3">
              <SectionTitle icon="schedule" title="Gia hạn thời gian nhận" />
              <Field label="Giờ kết thúc nhận mới">
                <input
                  type="datetime-local"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  className="ipt"
                />
              </Field>
              <Field label="Hạn sử dụng mới">
                <input
                  type="datetime-local"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  className="ipt"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {[+1, +2, +4, +24].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setNewEndTime(toLocalInputValue(addHours(listing.pickupEndTime, h)));
                      setNewExpiry(toLocalInputValue(addHours(listing.expiryTime, h)));
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    +{h < 24 ? `${h} giờ` : '1 ngày'}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Tăng số lượng */}
          {isQty && (
            <section className="space-y-3">
              <SectionTitle icon="add_circle" title="Bổ sung phần ăn" />
              <Field label={`Thêm (đơn vị: ${unit})`}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAddQty((v) => Math.max(1, v - 1))}
                    className="w-10 h-10 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined">remove</span>
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={addQty}
                    onChange={(e) => setAddQty(Math.max(1, Number(e.target.value) || 1))}
                    className="ipt flex-1 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setAddQty((v) => v + 1)}
                    className="w-10 h-10 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined">add</span>
                  </button>
                </div>
              </Field>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 20, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAddQty(n)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                      addQty === n
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:border-emerald-300'
                    }`}
                  >
                    +{n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-500">
                Tổng sau khi thêm: <span className="font-bold text-neutral-700">{total + addQty}</span> {unit}
              </p>
              {tab !== 'both' && (
                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extendQtyHours}
                    onChange={(e) => setExtendQtyHours(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  Đồng thời gia hạn thêm 2 giờ
                </label>
              )}
            </section>
          )}
        </div>

        {/* Scrollable body end */}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-neutral-100 bg-neutral-50 flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-neutral-600 bg-white border border-neutral-200 hover:bg-neutral-100 rounded-lg"
          >
            Huỷ
          </button>
          <button
            onClick={tab === 'extend_time' ? submitExtendTime : tab === 'add_quantity' ? submitAddQuantity : submitAll}
            disabled={!canSubmit}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">check</span>
            {submitting
              ? 'Đang cập nhật…'
              : tab === 'extend_time'
                ? 'Xác nhận gia hạn'
                : tab === 'add_quantity'
                  ? 'Xác nhận thêm'
                  : 'Gia hạn & thêm'}
          </button>
        </div>

        <style jsx>{`
          .ipt {
            width: 100%;
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            outline: none;
            transition: box-shadow 0.15s;
          }
          .ipt:focus {
            border-color: #059669;
            box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
          }
        `}</style>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${
        active ? 'text-emerald-700 border-b-2 border-emerald-600 bg-white' : 'text-neutral-500 hover:text-neutral-800'
      }`}
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
      {label}
    </button>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 text-emerald-700">
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      <h4 className="font-bold text-sm">{title}</h4>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

function Stat({ icon, label, value, unit, small }: { icon: string; label: string; value: string; unit?: string; small?: boolean }) {
  return (
    <div className="bg-neutral-50 rounded-xl p-2.5 border border-neutral-200">
      <div className="flex items-center justify-center gap-1 text-neutral-500 text-[10px] uppercase tracking-wide font-semibold">
        <span className="material-symbols-outlined text-[12px]">{icon}</span>
        {label}
      </div>
      <div className={`mt-1 font-bold text-neutral-900 ${small ? 'text-xs' : 'text-base'}`}>
        {value}
        {unit && !small && <span className="text-xs font-normal text-neutral-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}
