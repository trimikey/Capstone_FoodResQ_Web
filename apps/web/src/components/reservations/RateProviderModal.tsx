'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRateReservation } from '@/hooks/useReservation';
import { Modal } from '@/components/shared/Modal';

interface RateProviderModalProps {
  reservationId: string;
  /** Tên cửa hàng để người dùng biết đang đánh giá ai */
  providerName: string;
  listingTitle: string;
  /** Tên TNV đã giao — null nếu đơn tự đến lấy */
  shipperName?: string | null;
  /** Còn cần chấm cửa hàng không (đã chấm rồi thì ẩn phần đó) */
  needProvider: boolean;
  /** Còn cần chấm người giao không */
  needShipper: boolean;
  /** Bỏ qua — không gửi đánh giá. Parent chịu trách nhiệm không hỏi lại. */
  onSkip: () => void;
  /** Gửi đánh giá thành công */
  onDone: () => void;
}

const SCORE_LABEL: Record<number, string> = {
  1: 'Rất không hài lòng',
  2: 'Không hài lòng',
  3: 'Bình thường',
  4: 'Hài lòng',
  5: 'Rất hài lòng',
};

/** Một hàng 5 sao có xem trước khi rê chuột. */
function StarRow({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHovered(n)}
            disabled={disabled}
            aria-label={`${n} sao`}
            className="p-0.5 disabled:opacity-50 transition-transform hover:scale-110"
          >
            <span
              className={`material-symbols-outlined text-[30px] ${n <= shown ? 'text-amber-400' : 'text-neutral-300'}`}
              style={n <= shown ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              star
            </span>
          </button>
        ))}
      </div>
      <p className="text-[11px] font-bold text-neutral-500 h-4">{SCORE_LABEL[shown]}</p>
    </div>
  );
}

/**
 * Đánh giá sau khi nhận hàng. Đơn có giao hàng thì chấm hai bên: cửa hàng (chất lượng
 * thực phẩm) và tình nguyện viên (chất lượng giao) — hai vai trò khác nhau, gộp một
 * điểm sẽ không công bằng cho bên còn lại.
 */
export default function RateProviderModal({
  reservationId,
  providerName,
  listingTitle,
  shipperName,
  needProvider,
  needShipper,
  onSkip,
  onDone,
}: RateProviderModalProps) {
  const [providerScore, setProviderScore] = useState(5);
  const [shipperScore, setShipperScore] = useState(5);
  const [comment, setComment] = useState('');
  const rate = useRateReservation();

  const submit = async () => {
    try {
      const note = comment.trim() || undefined;
      // Tuần tự để nếu lượt sau lỗi thì lượt trước vẫn được ghi nhận
      if (needProvider) {
        await rate.mutateAsync({ id: reservationId, score: providerScore, comment: note, target: 'provider' });
      }
      if (needShipper) {
        await rate.mutateAsync({ id: reservationId, score: shipperScore, comment: note, target: 'shipper' });
      }
      toast.success('Cảm ơn bạn đã đánh giá!');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Gửi đánh giá thất bại. Vui lòng thử lại.';
      toast.error(msg);
    }
  };

  return (
    // Modal chung: portal ra <body>, đã xử lý cuộn + căn giữa khi nội dung dài.
    <Modal
      onClose={onSkip}
      closeOnBackdrop={!rate.isPending}
      className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl"
    >
          <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined">reviews</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base text-neutral-900">Đánh giá đơn hàng</h3>
            <p className="text-xs text-neutral-500 mt-0.5 truncate">{listingTitle}</p>
          </div>
          <button
            onClick={onSkip}
            disabled={rate.isPending}
            aria-label="Bỏ qua"
            className="text-neutral-400 hover:text-neutral-700 disabled:opacity-50 shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {needProvider && (
            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[18px] text-neutral-400">storefront</span>
                <p className="text-sm font-bold text-neutral-800 truncate">{providerName}</p>
              </div>
              <p className="text-[11px] text-neutral-500 mb-2">Chất lượng thực phẩm, đóng gói, thái độ phục vụ</p>
              <StarRow value={providerScore} onChange={setProviderScore} disabled={rate.isPending} />
            </div>
          )}

          {needShipper && shipperName && (
            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[18px] text-neutral-400">delivery_dining</span>
                <p className="text-sm font-bold text-neutral-800 truncate">{shipperName}</p>
              </div>
              <p className="text-[11px] text-neutral-500 mb-2">Tốc độ giao, giữ gìn thực phẩm, thái độ</p>
              <StarRow value={shipperScore} onChange={setShipperScore} disabled={rate.isPending} />
            </div>
          )}
        </div>

        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={rate.isPending}
          maxLength={500}
          placeholder="Chia sẻ thêm về trải nghiệm của bạn… (không bắt buộc)"
          className="w-full mt-3 px-4 py-3 bg-white border-2 border-neutral-200 rounded-xl focus:border-emerald-600 transition-colors text-sm outline-none placeholder:text-neutral-400 resize-none disabled:opacity-50"
        />

        <div className="flex gap-3 mt-4">
          <button
            onClick={onSkip}
            disabled={rate.isPending}
            className="flex-1 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl text-sm font-bold hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Bỏ qua
          </button>
          <button
            onClick={() => void submit()}
            disabled={rate.isPending}
            className="flex-1 py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {rate.isPending ? (
              <>
                <span className="animate-spin border-2 border-white/40 border-t-white rounded-full w-4 h-4" />
                Đang gửi…
              </>
            ) : (
              'Gửi đánh giá'
            )}
          </button>
          </div>
    </Modal>
  );
}
