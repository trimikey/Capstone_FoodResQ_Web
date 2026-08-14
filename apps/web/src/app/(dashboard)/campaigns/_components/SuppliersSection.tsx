'use client';

import { useState } from 'react';
import { mediaUrl } from '@/lib/utils';
import { useProviders, useProviderListings, type ProviderSummary, type ProviderListing } from '@/hooks/useProviders';
import {
  useConfirmCampaignTransportReceipt,
  useSentRequests,
  type SentRequestItem,
  type Campaign,
} from '@/hooks/useCampaigns';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import IngressRequestPanel from './IngressRequestPanel';

interface ProposalForm {
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  note: string;
  durationMonths: number;
}

const EMPTY_FORM: ProposalForm = {
  businessName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  address: '',
  note: '',
  durationMonths: 1,
};

interface Props {
  /** Danh sách chiến dịch của charity (để chọn gán thực phẩm) */
  campaigns?: Campaign[];
}

const REQUEST_STATUS_CLS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  expired: 'bg-neutral-100 text-neutral-500 border-neutral-200',
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ duyệt',
  accepted: 'Đã đồng ý',
  rejected: 'Từ chối',
  expired: 'Hết hạn',
};

const CATEGORY_ICONS: Record<string, string> = {
  prepared_meals: 'restaurant',
  bakery: 'bakery_dining',
  produce: 'eco',
  dairy: 'water_drop',
  beverages: 'local_cafe',
  packaged: 'inventory_2',
  other: 'fastfood',
};

const CATEGORY_LABELS: Record<string, string> = {
  prepared_meals: 'Suất ăn',
  bakery: 'Bánh',
  produce: 'Rau củ',
  dairy: 'Sữa',
  beverages: 'Nước',
  packaged: 'Đóng gói',
  other: 'Khác',
};

export default function SuppliersSection({ campaigns = [] }: Props) {
  const { data: suppliers, isLoading } = useProviders();
  const { data: sentRequests } = useSentRequests();
  const confirmReceipt = useConfirmCampaignTransportReceipt();
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ProposalForm>(EMPTY_FORM);
  const [messageByProvider, setMessageByProvider] = useState<Record<string, string>>({});
  const [selectedCampaignByProvider, setSelectedCampaignByProvider] = useState<Record<string, string>>({});
  const [selectedListingsByProvider, setSelectedListingsByProvider] = useState<Record<string, string[]>>({});
  /** Provider nào đang expand */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /** Chỉ hiện providers đang có tin active */
  const activeSuppliers = suppliers?.filter((s) => (s.activeListingsCount ?? 0) > 0) ?? [];

  /** Chiến dịch đang hoạt động để gán */
  const openCampaigns = campaigns.filter((c) => c.status === 'open' || c.status === 'in_progress');

  /** Map providerId → SentRequestItem (lấy cái mới nhất theo thời gian) */
  const requestByProvider = (sentRequests ?? []).reduce<
    Record<string, SentRequestItem>
  >((acc, r) => {
    const existing = acc[r.providerId];
    if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) {
      acc[r.providerId] = r;
    }
    return acc;
  }, {});

  async function handleSendRequest(providerId: string, businessName: string) {
    const campaignId = selectedCampaignByProvider[providerId];
    const listingIds = selectedListingsByProvider[providerId] ?? [];
    
    if (!campaignId) {
      toast.error('Vui lòng chọn chiến dịch để gán thực phẩm.');
      return;
    }
    
    setRequestingId(providerId);
    try {
      await api.post('/campaigns/requests', {
        providerId,
        campaignId,
        listingIds: listingIds.length > 0 ? listingIds : undefined,
        message: messageByProvider[providerId] ?? '',
      });
      toast.success(`Đã gửi yêu cầu đến ${businessName}`);
      setMessageByProvider((prev) => ({ ...prev, [providerId]: '' }));
      setSelectedCampaignByProvider((prev) => ({ ...prev, [providerId]: '' }));
      setSelectedListingsByProvider((prev) => ({ ...prev, [providerId]: [] }));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Gửi yêu cầu thất bại';
      toast.error(msg);
    } finally {
      setRequestingId(null);
    }
  }

  async function handleSubmitProposal() {
    if (!form.businessName.trim() || form.businessName.trim().length < 3) {
      toast.error('Vui lòng nhập tên nhà cung cấp (tối thiểu 3 ký tự).');
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post<{ message: string }>('/campaigns/provider-proposals', {
        businessName: form.businessName.trim(),
        contactName: form.contactName.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        address: form.address.trim() || undefined,
        note: form.note.trim() || undefined,
        durationMonths: form.durationMonths,
      });
      toast.success(r.data?.message ?? 'Đã ghi nhận đề xuất NCC.');
      setForm(EMPTY_FORM);
      setShowProposalForm(false);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Gửi đề xuất thất bại';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activeSuppliers.length) {
    return (
      <div className="space-y-4">
        <div className="text-center py-10 px-6 text-gray-600 bg-amber-50 rounded-2xl border border-amber-200">
          <span className="material-symbols-outlined text-5xl text-amber-500">storefront</span>
          <p className="mt-3 font-bold text-base">Chưa có nhà cung cấp nào đang đăng tin</p>
          <p className="mt-1 text-sm">
            Hiện tại chưa có nhà cung cấp nào có tin đăng thực phẩm khả dụng. Bạn có thể đề xuất thêm NCC — admin sẽ duyệt trong vòng 24h.
          </p>
          <button
            type="button"
            onClick={() => setShowProposalForm(true)}
            className="mt-4 inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Đề xuất thêm NCC
          </button>
        </div>

        {showProposalForm && (
          <ProposalForm
            form={form}
            setForm={setForm}
            submitting={submitting}
            onSubmit={handleSubmitProposal}
            onCancel={() => {
              setShowProposalForm(false);
              setForm(EMPTY_FORM);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Đơn yêu cầu nguyên liệu — luồng chính: khai nhu cầu trước, hệ thống gợi ý NCC */}
      <div className="mb-4">
        <IngressRequestPanel campaigns={campaigns} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-800">Danh sách nhà cung cấp</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Những NCC đang có tin đăng thực phẩm khả dụng — bấm để xem chi tiết món ăn.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{activeSuppliers.length} NCC</span>
          <button
            type="button"
            onClick={() => setShowProposalForm((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            Đề xuất thêm
          </button>
        </div>
      </div>

      {showProposalForm && (
        <ProposalForm
          form={form}
          setForm={setForm}
          submitting={submitting}
          onSubmit={handleSubmitProposal}
          onCancel={() => {
            setShowProposalForm(false);
            setForm(EMPTY_FORM);
          }}
        />
      )}

      {activeSuppliers.map((s) => {
        const profileId = s.providerProfile?.id ?? s.id;
        const isExpanded = expandedId === profileId;

        return (
          <SupplierCard
            key={profileId}
            supplier={s}
            profileId={profileId}
            req={requestByProvider[profileId]}
            isExpanded={isExpanded}
            onToggle={() => setExpandedId(isExpanded ? null : profileId)}
            message={messageByProvider[profileId] ?? ''}
            onMessageChange={(v) => setMessageByProvider((prev) => ({ ...prev, [profileId]: v }))}
            requestingId={requestingId}
            onSendRequest={() =>
              handleSendRequest(profileId, s.providerProfile?.businessName ?? s.fullName)
            }
            selectedCampaign={selectedCampaignByProvider[profileId] ?? ''}
            onCampaignChange={(v) => {
              setSelectedCampaignByProvider((prev) => ({ ...prev, [profileId]: v }));
              setSelectedListingsByProvider((prev) => ({ ...prev, [profileId]: [] }));
            }}
            selectedListings={selectedListingsByProvider[profileId] ?? []}
            onListingsChange={(ids) => setSelectedListingsByProvider((prev) => ({ ...prev, [profileId]: ids }))}
            openCampaigns={openCampaigns}
            confirmingTransportId={confirmReceipt.isPending ? confirmReceipt.variables?.transportId ?? null : null}
            onConfirmReceipt={async (request) => {
              if (!request.campaign || !request.transport) return;
              try {
                await confirmReceipt.mutateAsync({
                  campaignId: request.campaign.id,
                  transportId: request.transport.id,
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
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SupplierCard — collapsible card với danh sách món ăn bên trong
// ─────────────────────────────────────────────────────────────────────────────
function SupplierCard({
  supplier: s,
  profileId,
  req,
  isExpanded,
  onToggle,
  message,
  onMessageChange,
  requestingId,
  onSendRequest,
  selectedCampaign,
  onCampaignChange,
  selectedListings,
  onListingsChange,
  openCampaigns,
  confirmingTransportId,
  onConfirmReceipt,
}: {
  supplier: ProviderSummary;
  profileId: string;
  req?: SentRequestItem;
  isExpanded: boolean;
  onToggle: () => void;
  message: string;
  onMessageChange: (v: string) => void;
  requestingId: string | null;
  onSendRequest: () => void;
  selectedCampaign: string;
  onCampaignChange: (v: string) => void;
  selectedListings: string[];
  onListingsChange: (ids: string[]) => void;
  openCampaigns: { id: string; title: string }[];
  confirmingTransportId: string | null;
  onConfirmReceipt: (request: SentRequestItem) => void;
}) {
  const { data: listings, isLoading: loadingListings } = useProviderListings(
    isExpanded ? profileId : null,
  );

  const handleListingToggle = (listingId: string) => {
    if (selectedListings.includes(listingId)) {
      onListingsChange(selectedListings.filter((id) => id !== listingId));
    } else {
      onListingsChange([...selectedListings, listingId]);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* ─── Header ─── */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {s.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(s.avatarUrl)} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-amber-600 text-xl">storefront</span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 truncate">
              {s.providerProfile?.businessName ?? s.fullName}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {s.providerProfile?.businessType && (
                <span className="text-xs text-gray-400">{s.providerProfile.businessType}</span>
              )}
              {s.providerProfile?.address && (
                <>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400 truncate max-w-[150px] inline-block">
                    {s.providerProfile.address}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Badges + toggle */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-full transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">local_offer</span>
              {s.activeListingsCount} tin
              <span className={`material-symbols-outlined text-[14px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {req && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  REQUEST_STATUS_CLS[req.status] ?? REQUEST_STATUS_CLS['pending']
                }`}
              >
                {REQUEST_STATUS_LABEL[req.status] ?? req.status}
              </span>
            )}
          </div>
        </div>

        {/* ─── Request area (hide when accepted) ─── */}
        {req?.status === 'accepted' ? (
          <div className="space-y-2">
            <div className="bg-emerald-50 rounded-lg px-3 py-2 text-sm text-emerald-700 border border-emerald-200 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">check_circle</span>
              Đã đồng ý hợp tác — chờ NCC đăng thực phẩm.
            </div>
            {req.needsTransport && req.transport && (
              <CampaignTransportStatus
                request={req}
                busy={confirmingTransportId === req.transport.id}
                onConfirmReceipt={onConfirmReceipt}
              />
            )}
          </div>
        ) : req?.status === 'pending' ? (
          <div className="bg-amber-50 rounded-lg px-3 py-2 text-sm text-amber-700 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500">schedule</span>
            Yêu cầu đang chờ NCC duyệt.
            {req.message && <span className="font-normal text-amber-600"> — &quot;{req.message}&quot;</span>}
          </div>
        ) : req?.status === 'rejected' ? (
          <div className="bg-rose-50 rounded-lg px-3 py-2 text-sm text-rose-700">
            <span className="font-semibold">Đã từ chối.</span>
            {req.reviewedNote && <> Lý do: {req.reviewedNote}</>}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Chọn chiến dịch */}
            {openCampaigns.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Chiến dịch:</span>
                <select
                  value={selectedCampaign}
                  onChange={(e) => onCampaignChange(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <option value="">-- Chọn chiến dịch --</option>
                  {openCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder="Lời nhắn (tuỳ chọn, vd: cần 20 phần cơm/lần…)"
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <button
                type="button"
                onClick={onSendRequest}
                disabled={requestingId === profileId || !selectedCampaign}
                className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {requestingId === profileId ? 'hourglass_top' : 'send'}
                </span>
                Yêu cầu
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Expanded: chi tiết món ăn ─── */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50">
          {selectedCampaign && (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
              <p className="text-xs text-amber-700">
                <span className="material-symbols-outlined text-xs align-text-bottom mr-1">info</span>
                Bấm vào thực phẩm để chọn/gỡ — sẽ được gán vào chiến dịch đã chọn.
                {selectedListings.length > 0 && (
                  <span className="ml-1 font-semibold">({selectedListings.length} món đã chọn)</span>
                )}
              </p>
            </div>
          )}
          {loadingListings ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : listings && listings.length > 0 ? (
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {listings.map((item) => (
                <ListingRow 
                  key={item.id} 
                  item={item} 
                  isSelected={selectedListings.includes(item.id)}
                  onToggle={() => handleListingToggle(item.id)}
                />
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-gray-400">
              Không có tin đăng nào khả dụng.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CampaignTransportStatus({
  request,
  busy,
  onConfirmReceipt,
}: {
  request: SentRequestItem;
  busy: boolean;
  onConfirmReceipt: (request: SentRequestItem) => void;
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
          onClick={() => onConfirmReceipt(request)}
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

// ─────────────────────────────────────────────────────────────────────────────
// ListingRow — một dòng món ăn trong expanded panel
// ─────────────────────────────────────────────────────────────────────────────
function ListingRow({
  item, 
  isSelected, 
  onToggle 
}: { 
  item: ProviderListing; 
  isSelected?: boolean;
  onToggle?: () => void;
}) {
  const now = new Date();
  const start = new Date(item.pickupStartTime);
  const end = new Date(item.pickupEndTime);

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('vi-VN', { day: '2-digit', month: 'short' });

  const isExpired = now > end;
  const isSoon = !isExpired && now > start;

  const catIcon = CATEGORY_ICONS[item.category] ?? 'fastfood';
  const catLabel = CATEGORY_LABELS[item.category] ?? item.category;

  return (
    <div 
      className={`bg-white rounded-lg p-3 border flex items-start gap-3 cursor-pointer transition-all ${
        isSelected ? 'border-amber-400 bg-amber-50' : 'border-gray-100 hover:border-amber-200'
      }`}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-colors ${
        isSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
      }`}>
        {isSelected && (
          <span className="material-symbols-outlined text-white text-sm">check</span>
        )}
      </div>

      {/* Icon loại */}
      <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-amber-500 text-[18px]">{catIcon}</span>
      </div>

      {/* Thông tin */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-800 leading-tight">{item.title}</p>
        {item.description && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>
        )}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
          <span className="text-xs text-gray-500">
            <span className="material-symbols-outlined text-[11px] align-text-bottom">inventory_2</span>
            {' '}{item.quantityRemaining} {item.quantityUnit}
          </span>
          <span className="text-xs text-gray-500">
            <span className="material-symbols-outlined text-[11px] align-text-bottom">schedule</span>
            {' '}{fmtDate(start)} · {fmtTime(start)}–{fmtTime(end)}
          </span>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
            isExpired ? 'bg-rose-100 text-rose-600' :
            isSoon ? 'bg-amber-100 text-amber-600' :
            'bg-emerald-50 text-emerald-600'
          }`}>
            {isExpired ? 'Hết hạn' : isSoon ? 'Đang mở' : 'Sắp mở'}
          </span>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
            {catLabel}
          </span>
        </div>
        {item.weightPerUnitKg != null && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            ~{item.weightPerUnitKg} kg/phần
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProposalForm — giữ nguyên
// ─────────────────────────────────────────────────────────────────────────────
function ProposalForm({
  form,
  setForm,
  submitting,
  onSubmit,
  onCancel,
}: {
  form: ProposalForm;
  setForm: React.Dispatch<React.SetStateAction<ProposalForm>>;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  function patch<K extends keyof ProposalForm>(k: K, v: ProposalForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-200 p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-amber-600">storefront</span>
        <h4 className="font-bold text-gray-800">Đề xuất thêm nhà cung cấp mới</h4>
      </div>

      <p className="text-xs text-gray-500">
        Điền thông tin NCC bạn muốn hợp tác — admin sẽ duyệt trong 24h và NCC được thêm vào
        hệ thống với thời hạn bạn chọn bên dưới (mặc định 1 tháng, có thể gia hạn khi hết hạn).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField label="Tên nhà cung cấp *" required>
          <input value={form.businessName} onChange={(e) => patch('businessName', e.target.value)}
            placeholder="Vd: Bếp ăn Mặt Trời" className="input" />
        </FormField>
        <FormField label="Người liên hệ">
          <input value={form.contactName} onChange={(e) => patch('contactName', e.target.value)}
            placeholder="Họ và tên" className="input" />
        </FormField>
        <FormField label="Số điện thoại">
          <input value={form.contactPhone} onChange={(e) => patch('contactPhone', e.target.value)}
            placeholder="0901xxxxxx" className="input" />
        </FormField>
        <FormField label="Email">
          <input type="email" value={form.contactEmail} onChange={(e) => patch('contactEmail', e.target.value)}
            placeholder="contact@example.com" className="input" />
        </FormField>
        <FormField label="Địa chỉ" full>
          <input value={form.address} onChange={(e) => patch('address', e.target.value)}
            placeholder="Địa chỉ bếp/cửa hàng" className="input" />
        </FormField>
        <FormField label="Lời nhắn cho admin" full>
          <textarea value={form.note} onChange={(e) => patch('note', e.target.value)}
            placeholder="Lý do đề xuất, quy mô ước tính…" rows={2} className="input resize-none" />
        </FormField>
        <FormField label="Thời hạn hợp tác đề xuất" full>
          <div className="flex items-center gap-3">
            <input type="number" min={1} max={24} value={form.durationMonths}
              onChange={(e) => patch('durationMonths', Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
              className="input w-24" />
            <span className="text-sm text-gray-600">tháng</span>
            <div className="flex gap-1">
              {[1, 3, 6, 12].map((m) => (
                <button key={m} type="button" onClick={() => patch('durationMonths', m)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    form.durationMonths === m
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
                  }`}>
                  {m} tháng
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Khi hết hạn, bạn có thể gửi yêu cầu gia hạn thêm tại đây.
          </p>
        </FormField>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
          Huỷ
        </button>
        <button type="button" onClick={onSubmit} disabled={submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-50">
          <span className="material-symbols-outlined text-[16px]">send</span>
          {submitting ? 'Đang gửi…' : 'Gửi đề xuất'}
        </button>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          outline: none;
          transition: box-shadow 0.15s;
        }
        .input:focus {
          border-color: #f59e0b;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
        }
      `}</style>
    </div>
  );
}

function FormField({
  label, required, full, children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-xs font-semibold text-gray-700">
        {label}{required && <span className="text-rose-500 ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}
