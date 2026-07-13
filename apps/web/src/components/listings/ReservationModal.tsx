'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { useListing } from '@/hooks/useListings';
import { useCreateReservation } from '@/hooks/useReservation';
import { createReservationSchema, type CreateReservationInput } from '@/schemas/reservation.schema';

interface Props {
  listingId: string;
  onClose: () => void;
}

interface ReservationResult {
  reservationId: string;
  qrToken: string;
  qrExpiresAt: string;
}

export default function ReservationModal({ listingId, onClose }: Props) {
  const { data: listing, isLoading } = useListing(listingId);
  const createReservation = useCreateReservation();
  const [result, setResult] = useState<ReservationResult | null>(null);

  const form = useForm<CreateReservationInput>({
    resolver: zodResolver(createReservationSchema),
    defaultValues: { listingId, quantity: 1, requestDelivery: false },
  });

  async function onSubmit(data: CreateReservationInput) {
    try {
      const res = await createReservation.mutateAsync(data);
      setResult({ qrToken: res.qrToken, qrExpiresAt: res.qrExpiresAt, reservationId: res.reservationId });
      toast.success(
        data.requestDelivery
          ? 'Đã tạo đơn giao hàng! Hệ thống đang tìm tình nguyện viên gần điểm lấy.'
          : 'Đặt chỗ tự đến lấy thành công! Đơn này sẽ không gửi lời mời cho shipper.'
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Đặt chỗ thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl flex flex-col gap-lg p-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            {result ? 'Đặt chỗ thành công' : 'Xác nhận đặt chỗ'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* After success: show QR */}
        {result && (
          <div className="flex flex-col items-center gap-lg">
            <div className="p-lg bg-white rounded-2xl border border-outline-variant/20 shadow-sm">
              <QRCodeSVG value={result.qrToken} size={200} level="H" includeMargin />
            </div>
            <div className="text-center space-y-xs">
              <p className="font-label-lg text-label-lg text-on-surface">Trình mã QR cho nhà cung cấp</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                Hiệu lực đến: {new Date(result.qrExpiresAt).toLocaleString('vi-VN')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 bg-primary-container text-on-primary-container rounded-xl font-label-lg text-label-lg"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Form */}
        {!result && (
          <>
            {isLoading ? (
              <div className="flex items-center justify-center py-xl">
                <span className="animate-spin border-4 border-primary border-t-transparent rounded-full w-8 h-8" />
              </div>
            ) : listing ? (
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-md">
                {/* Listing summary */}
                <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                  <p className="font-label-lg text-label-lg text-on-surface">{listing.title}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
                    {listing.provider.businessName}
                  </p>
                  <p className="font-label-sm text-label-sm text-primary mt-xs">
                    Còn {listing.quantityRemaining} {listing.quantityUnit} • Tối đa {listing.maxPerReservation} mỗi lần
                  </p>
                </div>

                {/* Quantity */}
                <div className="space-y-xs">
                  <label className="font-label-lg text-label-lg text-on-surface-variant">Số lượng</label>
                  <input
                    type="number"
                    min={1}
                    max={Math.min(listing.maxPerReservation, listing.quantityRemaining)}
                    className="w-full px-md py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary font-body-md transition-colors"
                    {...form.register('quantity', { valueAsNumber: true })}
                  />
                  {form.formState.errors.quantity && (
                    <p className="font-label-sm text-label-sm text-error">
                      {form.formState.errors.quantity.message}
                    </p>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-xs">
                  <label className="font-label-lg text-label-lg text-on-surface-variant">
                    Ghi chú{' '}
                    <span className="font-label-sm text-on-surface-variant/60">(tùy chọn)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Dị ứng thực phẩm, yêu cầu đặc biệt..."
                    className="w-full px-md py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary font-body-md resize-none transition-colors"
                    {...form.register('receiverNotes')}
                  />
                </div>

                {/* Delivery toggle */}
                <label className="flex items-start gap-md cursor-pointer p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                  <input
                    type="checkbox"
                    className="w-5 h-5 mt-0.5 rounded border-2 border-outline-variant text-primary cursor-pointer"
                    {...form.register('requestDelivery')}
                  />
                  <div>
                    <p className="font-label-lg text-label-lg text-on-surface">Yêu cầu giao hàng</p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
                      Tình nguyện viên sẽ giao thực phẩm đến bạn (miễn phí)
                    </p>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={createReservation.isPending}
                  className="w-full py-4 bg-primary-container text-on-primary-container rounded-xl font-label-lg text-label-lg disabled:opacity-50 flex items-center justify-center gap-md transition-all hover:shadow-sm"
                >
                  {createReservation.isPending ? (
                    <>
                      <span className="animate-spin border-2 border-primary border-t-transparent rounded-full w-5 h-5" />
                      Đang đặt chỗ...
                    </>
                  ) : (
                    'Xác nhận đặt chỗ'
                  )}
                </button>
              </form>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
