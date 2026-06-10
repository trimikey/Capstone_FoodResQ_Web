'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { useMyReservations, useCancelReservation } from '@/hooks/useReservation';

const STATUS_CONFIG: Record<string, { label: string; colorClass: string; icon: string }> = {
  confirmed: { label: 'Đã xác nhận', colorClass: 'text-primary bg-primary/10', icon: 'check_circle' },
  picked_up: { label: 'Đã lấy', colorClass: 'text-secondary bg-secondary/10', icon: 'shopping_bag' },
  completed: { label: 'Hoàn thành', colorClass: 'text-on-tertiary-container bg-tertiary-container', icon: 'task_alt' },
  cancelled: { label: 'Đã hủy', colorClass: 'text-error bg-error/10', icon: 'cancel' },
  no_show: { label: 'Không đến', colorClass: 'text-error bg-error/10', icon: 'person_off' },
};

interface Reservation {
  id: string;
  status: string;
  quantity: number;
  qrToken: string | null;
  qrExpiresAt: string | null;
  receiverNotes: string | null;
  createdAt: string;
  listing: {
    title: string;
    pickupAddress: string;
    quantityUnit: string;
    provider: { businessName: string };
  };
}

export default function ReservationsPage() {
  const { data, isLoading, isError } = useMyReservations();
  const cancelMutation = useCancelReservation();
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const reservations = (data?.items ?? []) as Reservation[];

  async function handleCancel(id: string) {
    try {
      await cancelMutation.mutateAsync({ id });
      toast.success('Đã hủy đặt chỗ');
      setConfirmCancel(null);
    } catch {
      toast.error('Hủy thất bại. Vui lòng thử lại.');
    }
  }

  return (
    <div className="p-container-margin md:p-lg flex flex-col gap-lg">
      {/* Header */}
      <div>
        <h2 className="font-headline-md text-headline-md text-on-surface">Đặt chỗ của tôi</h2>
        <p className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
          Lịch sử đặt chỗ và mã QR nhận thực phẩm
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-xl">
          <span className="animate-spin border-4 border-primary border-t-transparent rounded-full w-10 h-10" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="text-center py-xl">
          <span className="material-symbols-outlined text-error" style={{ fontSize: '48px' }}>
            wifi_off
          </span>
          <p className="font-body-md text-on-surface-variant mt-md">Không tải được dữ liệu</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && reservations.length === 0 && (
        <div className="flex flex-col items-center py-xl text-center">
          <span className="material-symbols-outlined text-outline-variant" style={{ fontSize: '64px' }}>
            bookmark
          </span>
          <h3 className="font-headline-md text-headline-md text-on-surface mt-md">Chưa có đặt chỗ nào</h3>
          <p className="font-body-md text-on-surface-variant mt-sm max-w-xs">
            Tìm thực phẩm từ màn hình tìm kiếm và đặt chỗ ngay hôm nay.
          </p>
        </div>
      )}

      {/* List */}
      <div className="flex flex-col gap-md">
        {reservations.map((r) => {
          const status = STATUS_CONFIG[r.status] ?? {
            label: r.status,
            colorClass: 'text-on-surface-variant bg-surface-container',
            icon: 'info',
          };
          const qrStillValid = r.qrToken && r.qrExpiresAt && new Date(r.qrExpiresAt) > new Date();

          return (
            <div
              key={r.id}
              className="bg-surface-container-low rounded-2xl border border-outline-variant/20 overflow-hidden"
            >
              {/* Card body */}
              <div className="p-md flex flex-col gap-md">
                {/* Header row */}
                <div className="flex items-start justify-between gap-md">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-label-lg text-label-lg text-on-surface truncate">
                      {r.listing.title}
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
                      {r.listing.provider.businessName}
                    </p>
                  </div>
                  <span
                    className={`flex items-center gap-xs px-sm py-xs rounded-full font-label-sm text-label-sm whitespace-nowrap shrink-0 ${status.colorClass}`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>
                      {status.icon}
                    </span>
                    {status.label}
                  </span>
                </div>

                {/* Detail chips */}
                <div className="flex flex-wrap gap-md text-on-surface-variant">
                  <span className="flex items-center gap-xs font-label-sm text-label-sm">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>inventory_2</span>
                    {r.quantity} {r.listing.quantityUnit ?? 'phần'}
                  </span>
                  <span className="flex items-center gap-xs font-label-sm text-label-sm">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>place</span>
                    <span className="truncate max-w-[180px]">{r.listing.pickupAddress}</span>
                  </span>
                  <span className="flex items-center gap-xs font-label-sm text-label-sm">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>calendar_today</span>
                    {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                {r.receiverNotes && (
                  <p className="font-label-sm text-label-sm text-on-surface-variant italic">
                    "{r.receiverNotes}"
                  </p>
                )}
              </div>

              {/* QR section (confirmed only) */}
              {r.status === 'confirmed' && (
                <div className="border-t border-outline-variant/20 p-md flex flex-col gap-md">
                  {qrStillValid ? (
                    <>
                      <button
                        onClick={() => setExpandedQR(expandedQR === r.id ? null : r.id)}
                        className="flex items-center gap-sm text-primary font-label-lg text-label-lg"
                      >
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                          qr_code_2
                        </span>
                        {expandedQR === r.id ? 'Ẩn mã QR' : 'Xem mã QR để nhận hàng'}
                        <span className="material-symbols-outlined text-[18px] ml-auto">
                          {expandedQR === r.id ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>

                      {expandedQR === r.id && (
                        <div className="flex flex-col items-center gap-md py-md">
                          <div className="p-lg bg-white rounded-2xl border border-outline-variant/20 shadow-sm">
                            <QRCodeSVG value={r.qrToken!} size={180} level="H" includeMargin />
                          </div>
                          <p className="font-label-sm text-label-sm text-on-surface-variant text-center">
                            Hiệu lực đến:{' '}
                            <span className="text-on-surface font-semibold">
                              {new Date(r.qrExpiresAt!).toLocaleString('vi-VN')}
                            </span>
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-xs text-error">
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>warning</span>
                      <span className="font-label-sm text-label-sm">Mã QR đã hết hạn</span>
                    </div>
                  )}

                  {/* Cancel */}
                  {confirmCancel === r.id ? (
                    <div className="flex items-center gap-md p-md bg-error/5 rounded-xl border border-error/20">
                      <p className="flex-1 font-label-sm text-label-sm text-on-surface">
                        Xác nhận hủy đặt chỗ này?
                      </p>
                      <button
                        onClick={() => handleCancel(r.id)}
                        disabled={cancelMutation.isPending}
                        className="px-md py-1.5 bg-error text-white rounded-lg font-label-sm text-label-sm disabled:opacity-50"
                      >
                        {cancelMutation.isPending ? '...' : 'Hủy'}
                      </button>
                      <button
                        onClick={() => setConfirmCancel(null)}
                        className="px-md py-1.5 border border-outline-variant/30 rounded-lg font-label-sm text-label-sm text-on-surface-variant"
                      >
                        Không
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmCancel(r.id)}
                      className="self-start text-error font-label-sm text-label-sm hover:underline"
                    >
                      Hủy đặt chỗ
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
