'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVolunteerMe, useDeliveryHistory, type DeliveryHistoryItem } from '@/hooks/useDeliveries';
import { useCreateReport } from '@/hooks/useReports';
import { mediaUrl } from '@/lib/utils';
import { ReportReason, ReportTargetType } from '@foodresq/types';
import { toast } from 'sonner';
import Pagination from '@/components/shared/Pagination';
import {
  useMyDistributionHistory,
  useMyPickupHistory,
  type DistributionHistoryItem,
  type PickupHistoryItem,
} from '@/hooks/useCampaigns';
import { formatVnDate } from '@/lib/vn-date';

const PER_PAGE = 8;

const REPORT_REASONS = [
  { value: ReportReason.OTHER, label: 'Sự cố khác' },
  { value: ReportReason.HARASSMENT, label: 'Ứng xử không phù hợp' },
  { value: ReportReason.FRAUD, label: 'Thông tin không đúng' },
  { value: ReportReason.NO_SHOW_PROVIDER, label: 'Không gặp được bên liên quan' },
  { value: ReportReason.UNSAFE_FOOD, label: 'Thực phẩm không an toàn' },
] as const;

function historyTitle(h: DeliveryHistoryItem) {
  return h.reservation?.listing.title ?? h.campaignTransport?.campaignTitle ?? 'Chuyến giao chiến dịch';
}

function historyRecipient(h: DeliveryHistoryItem) {
  return h.reservation?.receiver?.user.fullName ?? h.campaignTransport?.campaignTitle ?? 'Bếp chiến dịch';
}

const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('vi-VN') : null;

/** Một mốc trên dòng thời gian; mốc chưa có dữ liệu vẫn hiện nhưng làm mờ. */
function TimelineStep({ icon, label, at }: { icon: string; label: string; at: string | null }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          at ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-300'
        }`}
      >
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
      </span>
      <div className="min-w-0">
        <p className={`text-xs font-bold ${at ? 'text-neutral-800' : 'text-neutral-400'}`}>{label}</p>
        <p className="text-xs text-neutral-500">{at ?? 'Không có dữ liệu'}</p>
      </div>
    </li>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="material-symbols-outlined text-[16px] text-neutral-400 mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase text-neutral-400">{label}</p>
        <p className="text-sm text-neutral-800 break-words">{value}</p>
      </div>
    </div>
  );
}

function ProofImage({ url, caption }: { url: string; caption: string }) {
  return (
    <a
      href={mediaUrl(url)}
      target="_blank"
      rel="noreferrer"
      className="group block w-28 shrink-0"
      title="Mở ảnh gốc"
    >
      <div className="w-28 h-28 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 group-hover:border-emerald-400 transition-colors">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(url)} alt={caption} className="w-full h-full object-cover" />
      </div>
      <p className="text-[11px] text-neutral-500 mt-1 text-center">{caption}</p>
    </a>
  );
}

function HistoryDetail({ h }: { h: DeliveryHistoryItem }) {
  const isCampaign = h.source === 'campaign_transport';
  // Đơn lẻ không ghi `pickedUpAt`; mốc lấy hàng thực tế nằm ở `qcPhotoAt` (bước QC).
  const pickedUpAt = fmtDateTime(h.pickedUpAt ?? h.qcPhotoAt);
  const proofs = [
    h.qcPhotoUrl ? { url: h.qcPhotoUrl, caption: 'Ảnh QC lúc lấy' } : null,
    h.deliveryProofUrl ? { url: h.deliveryProofUrl, caption: 'Ảnh lúc bàn giao' } : null,
  ].filter((p): p is { url: string; caption: string } => p !== null);

  return (
    <div className="border-t border-neutral-100 mt-4 pt-4 grid gap-5 md:grid-cols-2">
      <div>
        <p className="text-[11px] font-bold uppercase text-neutral-400 mb-3">Diễn biến chuyến giao</p>
        <ul className="space-y-3">
          <TimelineStep icon="assignment_turned_in" label="Nhận đơn" at={fmtDateTime(h.assignedAt)} />
          <TimelineStep icon="inventory_2" label="Lấy hàng tại điểm lấy" at={pickedUpAt} />
          <TimelineStep
            icon={h.status === 'delivered' ? 'task_alt' : 'cancel'}
            label={h.status === 'delivered' ? 'Bàn giao thành công' : 'Kết thúc — giao thất bại'}
            at={fmtDateTime(h.deliveredAt ?? h.deliveryProofAt)}
          />
        </ul>
      </div>

      <div className="space-y-3">
        <InfoRow icon="storefront" label="Điểm lấy" value={h.pickup.address ?? 'Chưa có địa chỉ'} />
        <InfoRow
          icon={isCampaign ? 'soup_kitchen' : 'home_pin'}
          label={isCampaign ? 'Bếp nhận hàng' : 'Điểm giao'}
          value={h.destination.address ?? 'Chưa có địa chỉ'}
        />
        {h.reservation && (
          <InfoRow icon="shopping_basket" label="Số lượng" value={`${h.reservation.quantity} phần`} />
        )}
        {isCampaign && h.campaignTransport && (
          <>
            <InfoRow icon="store" label="Nhà cung cấp" value={h.campaignTransport.providerName} />
            {h.campaignTransport.pickupStartTime && (
              <InfoRow
                icon="schedule"
                label="Khung giờ hẹn lấy"
                value={`${h.campaignTransport.pickupStartTime}${
                  h.campaignTransport.pickupEndTime ? ` – ${h.campaignTransport.pickupEndTime}` : ''
                }`}
              />
            )}
          </>
        )}
        <InfoRow
          icon="straighten"
          label="Quãng đường"
          value={h.distanceKm != null ? `${h.distanceKm} km` : 'Không ghi nhận'}
        />
      </div>

      {proofs.length > 0 && (
        <div className="md:col-span-2">
          <p className="text-[11px] font-bold uppercase text-neutral-400 mb-2">Ảnh minh chứng</p>
          <div className="flex gap-3 flex-wrap">
            {proofs.map((p) => (
              <ProofImage key={p.url} url={p.url} caption={p.caption} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryRow({
  h,
  onReport,
}: {
  h: DeliveryHistoryItem;
  onReport: (delivery: DeliveryHistoryItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const delivered = h.status === 'delivered';
  const image = h.deliveryProofUrl ?? h.reservation?.listing.imageUrls?.[0] ?? null;
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-100 shrink-0 mx-auto sm:mx-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image ? mediaUrl(image) : '/food_bread.png'}
            alt={historyTitle(h)}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <h3 className="font-bold text-neutral-900 truncate text-base">{historyTitle(h)}</h3>
          <p className="text-sm text-neutral-500 truncate flex items-center justify-center sm:justify-start gap-1 mt-1">
            <span className="material-symbols-outlined text-[16px]">person</span>
            {h.source === 'campaign_transport' ? 'Giao đến bếp' : 'Giao cho'} {historyRecipient(h)}
            {h.distanceKm != null && <span className="text-neutral-400 font-medium">· {h.distanceKm} km</span>}
          </p>
          {h.source === 'campaign_transport' && (
            <p className="text-xs text-emerald-700 mt-1 truncate">
              {h.destination.address ?? 'Chưa có địa chỉ bếp nhận hàng'}
            </p>
          )}
          <p className="text-xs text-neutral-400 mt-1 flex items-center justify-center sm:justify-start gap-1">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            {h.deliveredAt ? new Date(h.deliveredAt).toLocaleString('vi-VN') : new Date(h.createdAt).toLocaleDateString('vi-VN')}
          </p>
          {!delivered && h.failedReason && <p className="text-xs text-rose-600 mt-1 font-medium">Lý do: {h.failedReason}</p>}
        </div>
        <div className="flex flex-col items-center sm:items-end gap-2 shrink-0">
          <span className={`px-4 py-2 rounded-full text-xs font-bold ${delivered ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>
            {delivered ? 'Đã giao thành công' : 'Giao thất bại'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 text-xs font-bold text-neutral-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors"
            >
              <span className={`material-symbols-outlined text-[15px] transition-transform ${open ? 'rotate-180' : ''}`}>
                expand_more
              </span>
              {open ? 'Thu gọn' : 'Chi tiết'}
            </button>
            <button
              type="button"
              onClick={() => onReport(h)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 text-xs font-bold text-neutral-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">flag</span>
              Báo cáo
            </button>
          </div>
        </div>
      </div>
      {open && <HistoryDetail h={h} />}
    </div>
  );
}

/** `useSearchParams` cần Suspense boundary, nếu không Next sẽ chặn lúc prerender. */
export default function DeliveryHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-50/50 flex items-center justify-center py-20">
          <span className="animate-spin border-4 border-emerald-600 border-t-transparent rounded-full w-10 h-10" />
        </div>
      }
    >
      <DeliveryHistoryContent />
    </Suspense>
  );
}

function DeliveryHistoryContent() {
  const { data: me, isLoading: meLoading } = useVolunteerMe();
  const [page, setPage] = useState(1);
  const [reporting, setReporting] = useState<DeliveryHistoryItem | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>(ReportReason.OTHER);
  const [reportDescription, setReportDescription] = useState('');
  // `?tab=pickups` để chỗ khác (vd sau khi chốt đơn nguyên liệu) mở thẳng đúng tab.
  const tabParam = useSearchParams().get('tab');
  const [tab, setTab] = useState<'orders' | 'pickups' | 'rounds'>(
    tabParam === 'pickups' || tabParam === 'rounds' ? tabParam : 'orders',
  );
  const { data, isLoading: historyLoading } = useDeliveryHistory({ page, limit: PER_PAGE, enabled: !!me?.isShipper });
  // Đợt phát KHÔNG phải đơn `deliveries` nên phải lấy từ nguồn riêng, gộp vào cùng màn
  // lịch sử để shipper xem hết việc đã làm ở một chỗ.
  const { data: rounds, isLoading: roundsLoading } = useMyDistributionHistory({
    page,
    limit: PER_PAGE,
    enabled: !!me?.isShipper && tab === 'rounds',
  });
  // Đơn lấy nguyên liệu cũng không phải bản ghi `deliveries` — nguồn riêng, cùng màn.
  const { data: pickups, isLoading: pickupsLoading } = useMyPickupHistory({
    page,
    limit: PER_PAGE,
    enabled: !!me?.isShipper && tab === 'pickups',
  });
  const reportMutation = useCreateReport();

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;
  const curPage = data?.meta.page ?? page;

  const closeReport = () => {
    setReporting(null);
    setReportReason(ReportReason.OTHER);
    setReportDescription('');
  };

  const submitReport = async () => {
    if (!reporting) return;
    try {
      await reportMutation.mutateAsync({
        targetType: ReportTargetType.DELIVERY,
        targetId: reporting.id,
        reason: reportReason,
        description: reportDescription.trim() || undefined,
      });
      toast.success('Đã gửi báo cáo sự cố.');
      closeReport();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Không gửi được báo cáo';
      toast.error(msg);
    }
  };

  if (meLoading || (historyLoading && !data)) {
    return (
      <div className="min-h-screen bg-neutral-50/50 flex items-center justify-center py-20">
        <span className="animate-spin border-4 border-emerald-600 border-t-transparent rounded-full w-10 h-10" />
      </div>
    );
  }

  if (me && !me.isShipper) {
    return (
      <div className="min-h-screen bg-neutral-50/50 pb-24">
        <div className="max-w-4xl mx-auto px-6 md:px-12 py-10">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 flex flex-col items-center text-center gap-4 shadow-sm">
            <span className="material-symbols-outlined text-amber-500 text-6xl">info</span>
            <h2 className="text-xl font-bold text-amber-900">Không có quyền truy cập</h2>
            <p className="text-amber-800">Tài khoản của bạn không có chuyên môn Shipper nên không có lịch sử giao hàng.</p>
            <Link href="/campaigns" className="mt-4 px-6 py-3 bg-amber-600 text-white font-bold rounded-xl shadow-sm hover:bg-amber-700 transition-colors inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">soup_kitchen</span>
              Chuyển đến Bếp ăn cộng đồng
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      {reporting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[10vh] px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-5 pt-5 pb-4 bg-brand-gradient relative shrink-0 rounded-t-2xl">
              <button
                type="button"
                onClick={closeReport}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
                aria-label="Đóng"
              >
                <span className="material-symbols-outlined text-white text-[18px]">close</span>
              </button>
              <div className="flex items-center gap-3 pr-8">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-[18px]">report</span>
                </div>
                <div className="min-w-0">
                  <h2 className="font-extrabold text-white text-base">Báo cáo sự cố giao hàng</h2>
                  <p className="text-xs text-emerald-50 mt-0.5 truncate">Đơn: {historyTitle(reporting)}</p>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0">
              <div className="px-5 py-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-bold text-neutral-500 uppercase">Lý do</span>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as ReportReason)}
                    className="mt-1 w-full bg-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                  >
                    {REPORT_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-neutral-500 uppercase">Mô tả sự cố</span>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    rows={4}
                    maxLength={500}
                    placeholder="Mô tả ngắn gọn sự cố trong quá trình giao hàng..."
                    className="mt-1 w-full bg-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 resize-none"
                  />
                </label>
              </div>
            </div>
            <div className="shrink-0 px-5 py-3 border-t border-neutral-100 flex gap-3">
              <button
                type="button"
                onClick={closeReport}
                className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-600 text-sm font-bold hover:bg-neutral-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={reportMutation.isPending}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold disabled:opacity-50"
              >
                {reportMutation.isPending ? 'Đang gửi...' : 'Gửi báo cáo'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-4xl mx-auto px-6 md:px-12 py-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
          <div className="flex items-center gap-3">
            <Link href="/deliveries" className="p-2 -ml-2 rounded-full hover:bg-neutral-200/50 text-neutral-500 transition-colors" title="Quay lại Trung tâm giao hàng">
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <div>
              <h1 className="font-extrabold text-2xl text-neutral-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">history</span>
                Lịch sử giao hàng
              </h1>
              <p className="text-sm text-neutral-500 mt-1">Danh sách các đơn bạn đã thực hiện</p>
            </div>
          </div>
          
          {/* Đếm theo tab đang mở — trước đây luôn hiện tổng đơn giao hàng, đứng ở tab
              khác thì con số không khớp danh sách bên dưới. */}
          {(() => {
            const counts = {
              orders: { n: total, unit: 'đơn giao' },
              pickups: { n: pickups?.meta.total ?? 0, unit: 'đơn nguyên liệu' },
              rounds: { n: rounds?.meta.total ?? 0, unit: 'đợt phát' },
            } as const;
            const c = counts[tab];
            return c.n > 0 ? (
              <div className="px-4 py-2 bg-white border border-neutral-200 rounded-xl shadow-sm text-sm font-semibold text-neutral-700">
                Tổng cộng: <span className="text-emerald-700">{c.n}</span> {c.unit}
              </div>
            ) : null;
          })()}
        </div>

        {/* Chuyển giữa đơn giao và đợt phát */}
        <div className="flex gap-2">
          {([
            { key: 'orders' as const, label: 'Đơn giao hàng', icon: 'local_shipping' },
            { key: 'pickups' as const, label: 'Lấy nguyên liệu', icon: 'inventory' },
            { key: 'rounds' as const, label: 'Đợt phát suất ăn', icon: 'takeout_dining' },
          ]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                tab === t.key
                  ? 'bg-emerald-700 text-white'
                  : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'pickups' ? (
          pickupsLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
              ))}
            </div>
          ) : (pickups?.items.length ?? 0) === 0 ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-12 text-center shadow-sm">
              <span className="material-symbols-outlined text-[44px] text-neutral-300">inventory</span>
              <h3 className="mt-2 font-bold text-neutral-900">Chưa lấy nguyên liệu đơn nào</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Đơn nguyên liệu bạn đã lấy tại nhà cung cấp sẽ được lưu lại ở đây kèm ảnh và số kg.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {pickups!.items.map((p) => <PickupRow key={p.id} p={p} />)}
              </div>
              <Pagination
                page={pickups!.meta.page}
                totalPages={pickups!.meta.totalPages}
                onChange={setPage}
                total={pickups!.meta.total}
                perPage={PER_PAGE}
                unit="đơn"
              />
            </>
          )
        ) : tab === 'rounds' ? (
          roundsLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
              ))}
            </div>
          ) : (rounds?.items.length ?? 0) === 0 ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-12 text-center shadow-sm">
              <span className="material-symbols-outlined text-[44px] text-neutral-300">takeout_dining</span>
              <h3 className="mt-2 font-bold text-neutral-900">Chưa có đợt phát nào</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Các đợt phát bạn đã chốt sẽ được lưu lại ở đây.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {rounds!.items.map((r) => <RoundRow key={r.id} r={r} />)}
              </div>
              <Pagination
                page={rounds!.meta.page}
                totalPages={rounds!.meta.totalPages}
                onChange={setPage}
                total={rounds!.meta.total}
                perPage={PER_PAGE}
                unit="đợt"
              />
            </>
          )
        ) : total === 0 ? (
          <div className="bg-white rounded-3xl border border-neutral-200 p-12 flex flex-col items-center text-center shadow-sm">
            <div className="w-24 h-24 bg-neutral-100 rounded-full flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-neutral-300 text-5xl">receipt_long</span>
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Chưa có lịch sử giao hàng</h3>
            <p className="text-neutral-500 max-w-sm mb-6">Bạn chưa hoàn tất đơn giao nào. Hãy bắt đầu nhận đơn để ghi lại hành trình tình nguyện của mình nhé!</p>
            <Link href="/deliveries" className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-sm hover:bg-emerald-700 transition-colors">
              Tìm đơn giao hàng ngay
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {items.map((h) => (
                <HistoryRow key={h.id} h={h} onReport={setReporting} />
              ))}
            </div>

            <Pagination
              page={curPage}
              totalPages={totalPages}
              onChange={setPage}
              total={total}
              perPage={PER_PAGE}
              unit="đơn"
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Một đơn nguyên liệu đã lấy trong lịch sử của shipper — mặc định thu gọn. */
function PickupRow({ p }: { p: PickupHistoryItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <a
            href={mediaUrl(p.photoUrl)}
            target="_blank"
            rel="noreferrer"
            title="Mở ảnh gốc"
            className="shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(p.photoUrl)}
              alt="Nguyên liệu đã lấy"
              className="h-16 w-16 rounded-xl border border-neutral-200 object-cover"
            />
          </a>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-neutral-900">{p.providerName}</h3>
            <p className="mt-0.5 truncate text-sm text-neutral-500">{p.campaignTitle}</p>
            {p.ingredientName && (
              <p className="mt-0.5 truncate text-xs text-emerald-700">{p.ingredientName}</p>
            )}
            <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              {new Date(p.confirmedAt).toLocaleString('vi-VN')}
              {p.scheduledDate && ` · hẹn ${formatVnDate(String(p.scheduledDate))}`}
              {p.pickupStartTime &&
                ` ${p.pickupStartTime}${p.pickupEndTime ? `–${p.pickupEndTime}` : ''}`}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-extrabold text-emerald-700">
            {p.receivedKg}
            <span className="text-sm font-bold text-neutral-400">
              {p.requestedKg != null ? `/${p.requestedKg} kg` : ' kg'}
            </span>
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-3 py-1 text-[11px] font-bold ${
              p.shortfallKg > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {p.shortfallKg > 0 ? `Thiếu ${p.shortfallKg} kg` : 'Lấy đủ'}
          </span>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <span
                className={`material-symbols-outlined text-[15px] transition-transform ${open ? 'rotate-180' : ''}`}
              >
                expand_more
              </span>
              {open ? 'Thu gọn' : 'Chi tiết'}
            </button>
          </div>
        </div>
      </div>

      {open && <PickupDetail p={p} />}
    </div>
  );
}

/**
 * Chi tiết một đơn nguyên liệu đã lấy — đủ để đối chiếu lại sau này mà không phải
 * mở chiến dịch: đặt bao nhiêu / nhận bao nhiêu, hẹn mấy giờ so với lúc chốt thật,
 * yêu cầu bảo quản của bếp, và ảnh bằng chứng ở kích thước xem được.
 */
function PickupDetail({ p }: { p: PickupHistoryItem }) {
  const pickupWindow = p.pickupStartTime
    ? `${p.pickupStartTime}${p.pickupEndTime ? ` – ${p.pickupEndTime}` : ''}`
    : null;
  const badges = [
    p.requireColdChain ? { icon: 'ac_unit', label: 'Chuỗi lạnh < 5°C', cls: 'bg-sky-100 text-sky-700' } : null,
    p.requireAtvstpCert ? { icon: 'verified', label: 'Yêu cầu ATVSTP', cls: 'bg-teal-100 text-teal-700' } : null,
    p.requireQcPhoto ? { icon: 'photo_camera', label: 'Bắt buộc ảnh QC', cls: 'bg-violet-100 text-violet-700' } : null,
    p.needsTransport
      ? { icon: 'local_shipping', label: 'Đơn có shipper vận chuyển', cls: 'bg-blue-100 text-blue-700' }
      : { icon: 'directions_walk', label: 'Bếp tự cử người đi lấy', cls: 'bg-neutral-100 text-neutral-600' },
  ].filter((b): b is { icon: string; label: string; cls: string } => b !== null);

  return (
    <div className="mt-4 grid gap-5 border-t border-neutral-100 pt-4 md:grid-cols-2">
      {/* Số liệu cân đối */}
      <div className="md:col-span-2">
        <p className="mb-2 text-[11px] font-bold uppercase text-neutral-400">Đối chiếu số lượng</p>
        <div className="grid grid-cols-3 gap-2">
          <KgTile label="Bếp đặt" value={p.requestedKg != null ? `${p.requestedKg} kg` : '—'} />
          <KgTile label="Thực nhận" value={`${p.receivedKg} kg`} tone="emerald" />
          <KgTile
            label={p.shortfallKg > 0 ? 'Thiếu' : 'Chênh lệch'}
            value={p.shortfallKg > 0 ? `${p.shortfallKg} kg` : '0 kg'}
            tone={p.shortfallKg > 0 ? 'amber' : undefined}
          />
        </div>
        {badges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b.label}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${b.cls}`}
              >
                <span className="material-symbols-outlined text-[12px]">{b.icon}</span>
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Dòng thời gian */}
      <div>
        <p className="mb-3 text-[11px] font-bold uppercase text-neutral-400">Diễn biến</p>
        <ul className="space-y-3">
          <TimelineStep
            icon="event"
            label="Ngày hẹn lấy hàng"
            at={p.scheduledDate ? formatVnDate(String(p.scheduledDate)) : null}
          />
          <TimelineStep icon="schedule" label="Khung giờ bếp hẹn" at={pickupWindow} />
          <TimelineStep
            icon="inventory"
            label="Bạn chốt đã lấy"
            at={new Date(p.confirmedAt).toLocaleString('vi-VN')}
          />
        </ul>
      </div>

      {/* Thông tin đơn */}
      <div className="space-y-3">
        <InfoRow icon="campaign" label="Chiến dịch" value={`${p.campaignTitle} · ${p.campaignTimeRange}`} />
        <InfoRow
          icon="restaurant"
          label="Nguyên liệu"
          value={
            p.ingredientName
              ? p.ingredientName + (p.expectedServings != null ? ` · dự kiến ${p.expectedServings} suất` : '')
              : 'Đơn không khai chi tiết nguyên liệu'
          }
        />
        <InfoRow icon="call" label="Liên hệ NCC" value={p.providerPhone ?? 'Chưa có số điện thoại'} />
        <InfoRow
          icon="straighten"
          label="Quãng đường"
          value={p.distanceKm != null ? `${p.distanceKm} km (NCC → bếp)` : 'Không ghi nhận'}
        />
      </div>

      {/* Địa chỉ */}
      <div className="space-y-3 md:col-span-2">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-neutral-400">
            storefront
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase text-neutral-400">Lấy tại</p>
            <p className="break-words text-sm text-neutral-800">
              {p.providerAddress || 'Chưa có địa chỉ'}
              {p.lng != null && p.lat != null && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 inline-flex items-center gap-0.5 text-xs font-bold text-emerald-700 hover:underline"
                >
                  <span className="material-symbols-outlined text-[13px]">directions</span>
                  Chỉ đường
                </a>
              )}
            </p>
          </div>
        </div>
        <InfoRow icon="soup_kitchen" label="Chở về bếp" value={p.kitchenAddress} />
      </div>

      {p.message && (
        <div className="md:col-span-2">
          <p className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            <b>Lời nhắn của bếp:</b> {p.message}
          </p>
        </div>
      )}

      {p.note && (
        <div className="md:col-span-2">
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <b>Ghi chú của bạn:</b> {p.note}
          </p>
        </div>
      )}

      <div className="md:col-span-2">
        <p className="mb-2 text-[11px] font-bold uppercase text-neutral-400">Ảnh minh chứng</p>
        <ProofImage url={p.photoUrl} caption="Nguyên liệu đã lấy" />
      </div>
    </div>
  );
}

function KgTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'emerald' | 'amber';
}) {
  const cls =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-neutral-200 bg-neutral-50 text-neutral-700';
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-base font-extrabold">{value}</p>
    </div>
  );
}

/** Một đợt phát đã chốt trong lịch sử của shipper. */
function RoundRow({ r }: { r: DistributionHistoryItem }) {
  const shortfall = r.plannedServings - r.actualServings;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-neutral-900">
            {r.roundLabel || 'Đợt phát'}
          </h3>
          <p className="mt-0.5 truncate text-sm text-neutral-500">{r.campaignTitle}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            {new Date(r.completedAt).toLocaleString('vi-VN')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-extrabold text-emerald-700">
            {r.actualServings}
            <span className="text-sm font-bold text-neutral-400">/{r.plannedServings} suất</span>
          </p>
          <p className="text-xs text-neutral-500">{r.actualPeopleServed} người nhận</p>
        </div>
      </div>

      {r.points.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
          {r.points.map((pt, i) => (
            <li key={`${r.id}-${i}`} className="flex items-start gap-1.5 text-xs text-neutral-600">
              <span className="material-symbols-outlined text-[13px] text-emerald-600">place</span>
              <span className="min-w-0">
                <span className="font-semibold">{pt.label}</span> — {pt.address}
              </span>
            </li>
          ))}
        </ul>
      )}

      {shortfall > 0 && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
          <span className="material-symbols-outlined text-[13px]">inventory_2</span>
          Còn dư {shortfall} suất
        </p>
      )}
      {r.completionNote && (
        <p className="mt-2 text-xs italic text-neutral-500">Ghi chú: {r.completionNote}</p>
      )}
    </div>
  );
}
