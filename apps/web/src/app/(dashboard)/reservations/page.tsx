'use client';

import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { useMyReservations, useCancelReservation } from '@/hooks/useReservation';
import PickupVerificationModal from '@/components/reservations/PickupVerificationModal';

interface Reservation {
  id: string;
  status: 'confirmed' | 'picked_up' | 'completed' | 'cancelled' | 'no_show' | 'expired';
  quantity: number;
  qrToken: string | null;
  qrExpiresAt: string | null;
  receiverNotes: string | null;
  pickupProofUrl: string | null;
  pickupVerificationType: 'face' | 'id_card' | null;
  cancellationReason: string | null;
  createdAt: string;
  listingId: string;
  listing: {
    title: string;
    pickupAddress: string;
    quantityUnit: string;
    imageUrls: string[];
    category: string;
    provider: { businessName: string };
  };
}

const CATEGORY_FALLBACK: Record<string, string> = {
  bakery: '/banh-mi-ngot-thap-cam.png',
  prepared_meal: '/com-ga-hoi-an.png',
  raw_ingredients: '/food_salad.png',
};
const fallbackImg = (c: string) => CATEGORY_FALLBACK[c] ?? '/banh-mi-lua-mach-tuoi.png';

const STATUS_META: Record<
  Reservation['status'],
  { label: string; badge: string; accent: string; icon: string; group: 'active' | 'history' }
> = {
  confirmed: { label: 'Đã xác nhận', badge: 'badge-sky', accent: 'bg-sky-400', icon: 'task_alt', group: 'active' },
  picked_up: { label: 'Chờ xác minh', badge: 'badge-honey', accent: 'bg-honey-400', icon: 'hourglass_top', group: 'active' },
  completed: { label: 'Hoàn tất', badge: 'badge-emerald', accent: 'bg-emerald-500', icon: 'verified', group: 'history' },
  cancelled: { label: 'Đã huỷ', badge: 'badge-neutral', accent: 'bg-neutral-300', icon: 'cancel', group: 'history' },
  no_show: { label: 'Không đến', badge: 'badge-rose', accent: 'bg-rose-400', icon: 'person_off', group: 'history' },
  expired: { label: 'Hết hạn', badge: 'badge-neutral', accent: 'bg-neutral-300', icon: 'schedule', group: 'history' },
};

export default function ReservationsPage() {
  const { data, isLoading, isError } = useMyReservations();
  const cancelMutation = useCancelReservation();

  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [verifying, setVerifying] = useState<Reservation | null>(null);

  const reservations = (data?.items ?? []) as Reservation[];
  const filtered = useMemo(
    () => reservations.filter((r) => STATUS_META[r.status]?.group === tab),
    [reservations, tab],
  );
  const activeCount = reservations.filter((r) => STATUS_META[r.status]?.group === 'active').length;
  const historyCount = reservations.filter((r) => STATUS_META[r.status]?.group === 'history').length;

  async function handleCancel(id: string) {
    try {
      await cancelMutation.mutateAsync({ id, reason: cancelReason.trim() || undefined });
      toast.success('Đã huỷ đặt chỗ');
      setConfirmCancel(null);
      setCancelReason('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Huỷ thất bại. Vui lòng thử lại.';
      toast.error(msg);
    }
  }

  return (
    <div className="min-h-screen bg-mesh-brand pb-24">
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-10 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-gradient flex items-center justify-center elevation-brand shrink-0">
            <span className="material-symbols-outlined text-white text-[28px]">receipt_long</span>
          </div>
          <div>
            <h1 className="font-headline-lg font-extrabold text-3xl text-neutral-900">Đơn nhận của tôi</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Theo dõi đặt chỗ, mã QR nhận hàng và lịch sử.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-neutral-150 rounded-2xl p-1 w-fit elevation-1">
          <button
            onClick={() => setTab('active')}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              tab === 'active' ? 'bg-emerald-700 text-white elevation-2' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Đang xử lý ({activeCount})
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              tab === 'history' ? 'bg-emerald-700 text-white elevation-2' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Lịch sử ({historyCount})
          </button>
        </div>

        {/* States */}
        {isLoading && (
          <div className="space-y-3">
            {[0, 1].map((i) => <div key={i} className="h-40 skeleton" />)}
          </div>
        )}
        {isError && (
          <div className="text-center py-12 bg-white rounded-3xl border border-rose-100 elevation-1">
            <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 flex items-center justify-center">
              <span className="material-symbols-outlined text-rose-500 text-[36px]">wifi_off</span>
            </div>
            <p className="font-bold text-neutral-700 mt-3">Không tải được dữ liệu từ máy chủ</p>
          </div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-neutral-200 elevation-1">
            <div className="w-20 h-20 mx-auto rounded-full bg-brand-gradient-soft flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-600 text-[44px]">{tab === 'active' ? 'bookmark_border' : 'history'}</span>
            </div>
            <h3 className="font-extrabold text-lg text-neutral-800 mt-4">
              {tab === 'active' ? 'Chưa có đơn đang xử lý' : 'Chưa có lịch sử'}
            </h3>
            <p className="text-sm text-neutral-500 mt-1">Tìm thực phẩm và đặt chỗ để bắt đầu.</p>
            <a href="/listings" className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-sm transition-colors">
              <span className="material-symbols-outlined text-[18px]">search</span> Tìm thực phẩm
            </a>
          </div>
        )}

        {/* List */}
        <div className="space-y-4">
          {!isLoading && !isError && filtered.map((r) => {
            const meta = STATUS_META[r.status];
            const qrValid = r.qrToken && r.qrExpiresAt && new Date(r.qrExpiresAt) > new Date();
            return (
              <div key={r.id} className="card-interactive bg-white rounded-2xl border border-neutral-150 elevation-1 overflow-hidden flex">
                {/* dải màu trạng thái */}
                <div className={`w-1.5 shrink-0 ${meta.accent}`} />
                <div className="flex-1 min-w-0">
                <div className="p-5 flex gap-4">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-neutral-100 shrink-0 ring-1 ring-neutral-150">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.listing.imageUrls?.[0] || fallbackImg(r.listing.category)} alt={r.listing.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-neutral-900 truncate">{r.listing.title}</h3>
                        <p className="text-xs text-neutral-500 mt-0.5">{r.listing.provider.businessName}</p>
                      </div>
                      <span className={`badge ${meta.badge} shrink-0`}>
                        <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>{meta.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                        {r.quantity} {r.listing.quantityUnit}
                      </span>
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="material-symbols-outlined text-[14px]">place</span>
                        <span className="truncate max-w-[180px]">{r.listing.pickupAddress}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                        {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* confirmed: QR + cancel */}
                {r.status === 'confirmed' && (
                  <div className="border-t border-neutral-100 p-5 flex flex-col gap-3">
                    {qrValid ? (
                      <>
                        <button
                          onClick={() => setExpandedQR(expandedQR === r.id ? null : r.id)}
                          className="flex items-center gap-2 text-emerald-700 font-bold text-sm"
                        >
                          <span className="material-symbols-outlined">qr_code_2</span>
                          {expandedQR === r.id ? 'Ẩn mã QR' : 'Xem mã QR đưa nhà cung cấp quét'}
                        </button>
                        {expandedQR === r.id && (
                          <div className="flex flex-col items-center gap-2 py-2">
                            <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm">
                              <QRCodeSVG value={r.qrToken!} size={180} level="H" includeMargin />
                            </div>
                            <p className="text-xs text-neutral-500">
                              Hết hạn: {new Date(r.qrExpiresAt!).toLocaleString('vi-VN')}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-rose-600 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">warning</span> Mã QR đã hết hạn
                      </p>
                    )}

                    {confirmCancel === r.id ? (
                      <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-3">
                        <p className="text-sm font-bold text-neutral-800">Vì sao bạn huỷ đơn này?</p>
                        {/* Lý do nhanh */}
                        <div className="flex flex-wrap gap-1.5">
                          {['Bận việc đột xuất', 'Đổi ý / không cần nữa', 'Đặt nhầm', 'Quá xa'].map((reason) => (
                            <button
                              key={reason}
                              type="button"
                              onClick={() => setCancelReason(reason)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                                cancelReason === reason
                                  ? 'bg-rose-600 text-white border-rose-600'
                                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-rose-300'
                              }`}
                            >
                              {reason}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Lý do khác (không bắt buộc)..."
                          rows={2}
                          maxLength={500}
                          className="input-base text-sm"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => { setConfirmCancel(null); setCancelReason(''); }} className="flex-1 py-2 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-600 hover:bg-white transition-colors">Không huỷ</button>
                          <button onClick={() => handleCancel(r.id)} disabled={cancelMutation.isPending} className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-colors">
                            {cancelMutation.isPending ? 'Đang huỷ...' : 'Xác nhận huỷ'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setConfirmCancel(r.id); setCancelReason(''); }} className="self-start text-rose-500 text-xs font-semibold hover:underline">
                        Huỷ đặt chỗ
                      </button>
                    )}
                  </div>
                )}

                {/* picked_up: chờ nhà cung cấp đối chiếu & xác nhận bàn giao */}
                {r.status === 'picked_up' && (
                  <div className="border-t border-neutral-100 p-5 flex flex-col gap-2">
                    <div className="flex items-center gap-2.5 bg-honey-50 border border-honey-200 rounded-xl p-3">
                      <span className="material-symbols-outlined text-honey-600 animate-pulse">hourglass_top</span>
                      <p className="text-xs text-honey-700 font-medium">
                        Nhà cung cấp đã quét mã. Đưa giấy tờ/khuôn mặt để họ đối chiếu &amp; xác nhận bàn giao.
                      </p>
                    </div>
                    <button
                      onClick={() => setVerifying(r)}
                      className="self-start text-xs font-semibold text-neutral-400 hover:text-emerald-700 transition-colors"
                    >
                      Hoặc tự xác minh bằng ảnh →
                    </button>
                  </div>
                )}

                {/* cancelled/no_show: lý do huỷ */}
                {(r.status === 'cancelled' || r.status === 'no_show') && r.cancellationReason && (
                  <div className="border-t border-neutral-100 p-5 flex items-start gap-2 text-xs">
                    <span className="material-symbols-outlined text-[16px] text-neutral-400 mt-0.5">sticky_note_2</span>
                    <p className="text-neutral-500">
                      <span className="font-bold text-neutral-600">Lý do huỷ:</span> {r.cancellationReason}
                    </p>
                  </div>
                )}

                {/* completed: verified badge */}
                {r.status === 'completed' && r.pickupProofUrl && (
                  <div className="border-t border-neutral-100 p-5 flex items-center gap-1.5 text-emerald-700 text-xs font-semibold">
                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                    Đã xác minh bằng {r.pickupVerificationType === 'id_card' ? 'CCCD' : 'khuôn mặt'}
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {verifying && (
        <PickupVerificationModal
          reservationId={verifying.id}
          listingTitle={verifying.listing.title}
          onClose={() => setVerifying(null)}
        />
      )}
    </div>
  );
}
