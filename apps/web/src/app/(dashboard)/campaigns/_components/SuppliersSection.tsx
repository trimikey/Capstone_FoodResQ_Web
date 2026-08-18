'use client';

import { toast } from 'sonner';
import {
  useConfirmCampaignTransportReceipt,
  useSentRequests,
  type SentRequestItem,
  type Campaign,
} from '@/hooks/useCampaigns';
import IngressRequestPanel from './IngressRequestPanel';

interface Props {
  /** Danh sách chiến dịch của charity (để chọn khi tạo đơn yêu cầu) */
  campaigns?: Campaign[];
}

const REQUEST_STATUS_CLS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  expired: 'bg-neutral-100 text-neutral-500 border-neutral-200',
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ NCC duyệt',
  accepted: 'Đã đồng ý',
  rejected: 'Từ chối',
  expired: 'Hết hạn',
};

/**
 * Tab "Nhà cung cấp" — luồng CHÍNH là tạo đơn yêu cầu nguyên liệu: bếp khai nhu
 * cầu (loại thực phẩm, số kg, giờ cần nhận), hệ thống tự gợi ý NCC gần nhất.
 * Bên dưới là danh sách đơn đã gửi + trạng thái vận chuyển để bếp theo dõi
 * và xác nhận nhận hàng.
 *
 * Danh sách duyệt-từng-NCC và form "đề xuất NCC mới" đã bỏ: trùng vai với đơn
 * yêu cầu nguyên liệu và làm loãng luồng chính.
 */
export default function SuppliersSection({ campaigns = [] }: Props) {
  const { data: sentRequests, isLoading } = useSentRequests();
  const confirmReceipt = useConfirmCampaignTransportReceipt();

  const requests = sentRequests ?? [];

  return (
    <div className="space-y-4">
      {/* Luồng chính: khai nhu cầu → hệ thống gợi ý NCC gần nhất */}
      <IngressRequestPanel campaigns={campaigns} />

      {/* Đơn đã gửi + trạng thái vận chuyển */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-gray-800">Đơn yêu cầu đã gửi</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Theo dõi NCC duyệt đơn và hành trình thực phẩm về bếp.
            </p>
          </div>
          <span className="text-sm text-gray-400">{requests.length} đơn</span>
        </div>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 h-20" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-10 px-6 text-gray-500 bg-white rounded-2xl border border-gray-100">
            <span className="material-symbols-outlined text-5xl text-gray-300">receipt_long</span>
            <p className="mt-3 font-bold text-base text-gray-600">Chưa có đơn yêu cầu nào</p>
            <p className="mt-1 text-sm">
              Dùng &ldquo;Tạo đơn yêu cầu nguyên liệu&rdquo; phía trên — hệ thống sẽ gợi ý NCC gần bếp nhất.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <SentRequestCard
                key={r.id}
                request={r}
                busy={confirmReceipt.isPending && confirmReceipt.variables?.transportId === r.transport?.id}
                onConfirmReceipt={async () => {
                  if (!r.campaign || !r.transport) return;
                  try {
                    await confirmReceipt.mutateAsync({
                      campaignId: r.campaign.id,
                      transportId: r.transport.id,
                    });
                    toast.success('Đã xác nhận bếp nhận thực phẩm.');
                  } catch (e: unknown) {
                    const message =
                      (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
                      ?? 'Không thể xác nhận nhận hàng.';
                    toast.error(message);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SentRequestCard — 1 đơn yêu cầu nguyên liệu đã gửi
// ─────────────────────────────────────────────────────────────────────────────
function SentRequestCard({
  request: r,
  busy,
  onConfirmReceipt,
}: {
  request: SentRequestItem;
  busy: boolean;
  onConfirmReceipt: () => void;
}) {
  const demand = r.demandDetails;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-amber-600 text-xl">storefront</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 truncate">
            {r.provider.businessName ?? r.provider.user.fullName}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {r.campaign ? `Chiến dịch: ${r.campaign.title}` : 'Chưa gắn chiến dịch'} ·{' '}
            {new Date(r.createdAt).toLocaleDateString('vi-VN')}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
            REQUEST_STATUS_CLS[r.status] ?? REQUEST_STATUS_CLS['pending']
          }`}
        >
          {REQUEST_STATUS_LABEL[r.status] ?? r.status}
        </span>
      </div>

      {/* Nhu cầu đã khai trong đơn */}
      {demand && (demand.ingredientName || demand.quantityKg != null || r.pickupStartTime) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {demand.ingredientName && (
            <span>
              <span className="material-symbols-outlined text-[13px] align-text-bottom">grocery</span>{' '}
              {demand.ingredientName}
            </span>
          )}
          {demand.quantityKg != null && (
            <span>
              <span className="material-symbols-outlined text-[13px] align-text-bottom">scale</span>{' '}
              {demand.quantityKg} kg
            </span>
          )}
          {(demand.neededDate || r.pickupStartTime) && (
            <span>
              <span className="material-symbols-outlined text-[13px] align-text-bottom">schedule</span>{' '}
              Nhận:{' '}
              {demand.neededDate
                ? `${new Date(`${demand.neededDate}T00:00:00Z`).toLocaleDateString('vi-VN', { timeZone: 'UTC' })} `
                : ''}
              {r.pickupStartTime ?? demand.neededFrom ?? ''}
              {(r.pickupEndTime ?? demand.neededTo) ? ` – ${r.pickupEndTime ?? demand.neededTo}` : ''}
            </span>
          )}
        </div>
      )}

      {r.message && <p className="text-xs text-gray-500 italic">&ldquo;{r.message}&rdquo;</p>}
      {r.status === 'rejected' && r.reviewedNote && (
        <p className="text-xs text-rose-600">Lý do từ chối: {r.reviewedNote}</p>
      )}

      {/* Trạng thái vận chuyển (đơn có nhờ hệ thống tìm shipper) */}
      {r.status === 'accepted' && r.needsTransport && r.transport && (
        <TransportStatus request={r} busy={busy} onConfirmReceipt={onConfirmReceipt} />
      )}
    </div>
  );
}

function TransportStatus({
  request,
  busy,
  onConfirmReceipt,
}: {
  request: SentRequestItem;
  busy: boolean;
  onConfirmReceipt: () => void;
}) {
  const transport = request.transport;
  if (!transport) return null;

  const labels: Record<string, string> = {
    pending: 'Đang tìm shipper',
    assigned: 'Shipper đã nhận chuyến',
    heading_to_provider: 'Shipper đang đến NCC',
    picked_up: 'Đã lấy thực phẩm',
    in_transit: 'Đang giao đến bếp',
    delivered: 'Chờ bếp xác nhận',
    received: 'Bếp đã xác nhận nhận hàng',
    failed: 'Giao hàng thất bại',
  };
  const tone = transport.status === 'failed'
    ? 'bg-rose-50 border-rose-200 text-rose-700'
    : transport.status === 'received'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : transport.status === 'delivered'
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : 'bg-sky-50 border-sky-200 text-sky-700';

  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px]">local_shipping</span>
        <span className="font-semibold">{labels[transport.status] ?? transport.status}</span>
      </div>
      {transport.failureReason && <p className="mt-1 text-xs">Lý do: {transport.failureReason}</p>}
      {transport.receiptNote && <p className="mt-1 text-xs">Ghi chú nhận hàng: {transport.receiptNote}</p>}
      {transport.status === 'delivered' && (
        <button
          type="button"
          onClick={onConfirmReceipt}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">inventory</span>
          {busy ? 'Đang xác nhận…' : 'Xác nhận bếp đã nhận hàng'}
        </button>
      )}
    </div>
  );
}
