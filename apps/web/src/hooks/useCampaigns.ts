import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AssignmentRole } from '@foodresq/types';

export interface Campaign {
  id: string;
  title: string;
  description: string | null;
  kitchenAddress: string;
  scheduledDate: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  chefSlotsNeeded: number;
  waiterSlotsNeeded: number;
  shipperSlotsNeeded: number;
  chefSlotsFilled: number;
  waiterSlotsFilled: number;
  shipperSlotsFilled: number;
  status: string;
  actualServings?: number | null;
  distributionSummary?: { servingsServed: number; peopleServed: number; leftoverServings: number };
  peopleServed?: number;
  charityReceiver?: { organizationName: string | null; user: { fullName: string } };
  assignments?: {
    id: string;
    role: 'chef' | 'waiter' | 'shipper';
    status: string;
    volunteer: { user: { fullName: string; avatarUrl: string | null } };
  }[];
  donations?: {
    id: string;
    itemName: string;
    quantity: string | null;
    note?: string | null;
    status: string;
    provider: { businessName: string };
  }[];
  supplyProgress?: SupplyProgressItem[];
}

export interface SupplyProgressItem {
  name: string;
  unit: string;
  targetQuantity: number;
  pledgedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  receivedRemainingQuantity: number;
  progressPercent: number;
  isTargetMet: boolean;
}

export interface CreateCampaignInput {
  title: string;
  description?: string;
  kitchenAddress: string;
  lng: number;
  lat: number;
  scheduledDate: string;
  /** Ngày kết thúc (>= scheduledDate). Bỏ trống = 1 ngày duy nhất. */
  endDate?: string;
  startTime: string;
  endTime: string;
  chefSlotsNeeded?: number;
  waiterSlotsNeeded?: number;
  shipperSlotsNeeded?: number;
  expectedServings?: number;
  imageUrls?: string[];
  menuItems?: { name: string; type: string; plannedServings?: number }[];
  scheduleItems?: { time: string; label: string }[];
  /** Vật phẩm cần thiết — object đầy đủ {name, quantity?, unit?}. */
  supplyItems?: { name: string; quantity?: number; unit?: string }[];
  /** Ca trực cho tình nguyện viên — insert vào bảng campaign_shifts lúc tạo. */
  shifts?: {
    label: string;
    role?: 'chef' | 'waiter' | 'shipper';
    startTime: string;
    endTime: string;
    slotsNeeded: number;
  }[];
}

export interface CampaignChangeRequest {
  id: string;
  campaignId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string | null;
  scheduledDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  kitchenAddress: string | null;
  lng: number | null;
  lat: number | null;
  chefSlotsNeeded: number | null;
  waiterSlotsNeeded: number | null;
  shipperSlotsNeeded: number | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface SubmitCampaignChangeInput {
  scheduledDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  kitchenAddress?: string;
  lng?: number;
  lat?: number;
  chefSlotsNeeded?: number;
  waiterSlotsNeeded?: number;
  shipperSlotsNeeded?: number;
  reason?: string;
}

export interface MyTask {
  id: string;
  role: 'chef' | 'waiter' | 'shipper';
  status: string;
  shiftId?: string | null;
  shift?: {
    id: string;
    label: string;
    role: 'chef' | 'waiter' | 'shipper' | null;
    startTime: string;
    endTime: string;
  } | null;
  notes?: string | null;
  checkInTime?: string | null;
  ingredientProofAt?: string | null;
  cookedProofAt?: string | null;
  campaign: {
    id: string;
    title: string;
    kitchenAddress: string;
    scheduledDate: string;
    endDate?: string | null;
    startTime: string;
    endTime: string;
    status: string;
  };
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns', 'open'],
    queryFn: async () => (await api.get('/campaigns')).data.data as Campaign[],
    staleTime: 30_000,
  });
}

export interface PublicCampaign {
  id: string;
  title: string;
  description: string | null;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  kitchenAddress: string;
  imageUrls: string[];
  status: string;
  organizationName: string | null;
}

// Công khai — chiến dịch sắp diễn ra cho trang chủ (không cần đăng nhập)
export function usePublicCampaigns() {
  return useQuery({
    queryKey: ['campaigns', 'public'],
    queryFn: async () => (await api.get('/campaigns/public')).data.data as PublicCampaign[],
    staleTime: 60_000,
  });
}

export interface CampaignParticipant {
  id: string;
  role: 'chef' | 'waiter' | 'shipper';
  status: string;
  shiftId?: string | null;
  fullName: string;
  avatarUrl: string | null;
  rank: string;
}

/** Thông tin TNV chi tiết cho trang quản lý của charity (từ /manage-detail). */
export interface VolunteerDetail {
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  trustScore: number;
  userStatus: string;
  rank: string;
  dedicationPoints: number;
  avgRating: number | null;
  isAvailable: boolean;
  vehicleType: string | null;
  vehiclePlate: string | null;
  specializations: string[];
  pastCampaignsCount: number;
}

/** Participant từ manage-detail: có thêm trường volunteer chi tiết + checkInTime + notes. */
export interface CampaignManageParticipant {
  id: string;
  role: 'chef' | 'waiter' | 'shipper';
  status: string;
  shiftId: string | null;
  fullName: string;
  avatarUrl: string | null;
  rank: string;
  checkInTime: string | null;
  notes: string | null;
  createdAt: string;
  volunteer: VolunteerDetail;
}

export interface CampaignProofPhoto { url: string; kind: 'ingredient' | 'cooked' | 'distribution' | string; by: string; }

export interface CampaignDistribution {
  id: string;
  roundLabel: string | null;
  servingsServed: number;
  peopleServed: number;
  leftoverServings: number;
  photoUrl: string | null;
  note: string | null;
  distributedAt: string;
  servedBy: string;
  feedback: { satisfaction: number; comment: string | null; createdAt: string }[];
}

export interface CampaignExperience {
  id: string;
  content: string;
  imageUrls: string[];
  rating: number | null;
  createdAt: string;
  fullName: string;
  avatarUrl: string | null;
  rank: string;
}

export interface PublicCampaignDetail extends PublicCampaign {
  chefSlotsNeeded: number;
  waiterSlotsNeeded: number;
  shipperSlotsNeeded: number;
  chefSlotsFilled: number;
  waiterSlotsFilled: number;
  shipperSlotsFilled: number;
  expectedServings: number | null;
  actualServings: number | null;
  menuItems: { name: string; type: string; plannedServings?: number }[];
  scheduleItems: { time: string; label: string }[];
  /** Vật phẩm: campaign cũ lưu string, campaign mới lưu object {name, quantity, unit}. */
  supplyItems: string[] | { name: string; quantity?: number | null; unit?: string | null }[];
  supplyProgress?: SupplyProgressItem[];
  participants: CampaignParticipant[];
  donations: { id: string; itemName: string; quantity: string | null; status: string; provider: { businessName: string } }[];
  proofGallery: CampaignProofPhoto[];
  distributions: CampaignDistribution[];
  distributionSummary: { servingsServed: number; peopleServed: number; leftoverServings: number };
  avgSatisfaction: number | null;
  feedbackCount: number;
  experiences: CampaignExperience[];
  shifts: Array<{
    id: string;
    label: string;
    role: 'chef' | 'waiter' | 'shipper' | null;
    startTime: string;
    endTime: string;
    slotsNeeded: number;
    slotsFilled: number;
  }>;
}

// Công khai — chi tiết một chiến dịch (cho trang /campaigns/[id], không cần đăng nhập)
export function usePublicCampaignDetail(id: string) {
  return useQuery({
    queryKey: ['campaigns', 'public', id],
    queryFn: async () => {
      const res = await api.get(`/campaigns/public/${id}`);
      return res.data.data as PublicCampaignDetail;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export interface CompletedCampaign {
  id: string;
  title: string;
  description: string | null;
  scheduledDate: string;
  kitchenAddress: string;
  imageUrls: string[];
  actualServings: number | null;
  peopleServed: number;
  volunteers: number;
  experienceCount: number;
  organizationName: string | null;
}

// Chiến dịch đã hoàn thành (success stories)
export function useCompletedCampaigns(enabled = true) {
  return useQuery({
    queryKey: ['campaigns', 'completed'],
    queryFn: async () => (await api.get('/campaigns/completed')).data.data as CompletedCampaign[],
    enabled,
    staleTime: 60_000,
  });
}

// TNV upload ảnh cảm nhận → URL
export function useUploadExperienceImage() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/campaigns/experiences/upload-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data as { url: string };
    },
  });
}

// TNV chia sẻ cảm nhận về chiến dịch đã hoàn tất
export function useAddExperience() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; content: string; rating?: number; imageUrls?: string[] }) =>
      (await api.post(`/campaigns/${p.id}/experiences`, { content: p.content, rating: p.rating, imageUrls: p.imageUrls })).data.data,
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'public', p.id] });
    },
  });
}

// Chiến dịch do tổ chức (charity) tạo — gồm cả draft đang chờ duyệt
export function useMyCampaigns(enabled = true) {
  return useQuery({
    queryKey: ['campaigns', 'mine'],
    queryFn: async () => (await api.get('/campaigns/my')).data.data as Campaign[],
    enabled,
    staleTime: 30_000,
  });
}

export function useMyTasks(enabled = true) {
  return useQuery({
    queryKey: ['campaigns', 'my-tasks'],
    queryFn: async () => (await api.get('/campaigns/my-tasks')).data.data as MyTask[],
    enabled,
    staleTime: 30_000,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCampaignInput) => (await api.post('/campaigns', input)).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

// Charity: upload ảnh chiến dịch → trả URL
export function useUploadCampaignImage() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/campaigns/upload-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as { url: string };
    },
  });
}

export function useApplyCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; role: AssignmentRole }) =>
      (await api.post(`/campaigns/${p.id}/apply`, { role: p.role })).data.data,
    onSuccess: (_data, p) => {
      // Refetch campaigns list + manage-detail để trang registrations/overview cập nhật ngay.
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.id] });
    },
  });
}

// Tổ chức: bắt đầu chiến dịch (open → in_progress) — CHỈ khi scheduledDate = hôm nay.
export function useStartCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.patch(`/campaigns/${id}/start`)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// Tổ chức: huỷ chiến dịch đang tuyển (open → cancelled) — dùng khi quá hạn
export function useCancelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.patch(`/campaigns/${id}/cancel`)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// Tổ chức: kết thúc chiến dịch + nhập số suất thực tế.
// Nếu campaign chưa tới ngày kết thúc (endDate || scheduledDate) thì cần truyền
// earlyEndConfirmation + earlyEndReason (đã được validate ở modal).
export interface CompleteCampaignInput {
  id: string;
  actualServings: number;
  earlyEndConfirmation?: 'EARLY_END';
  earlyEndReason?: string;
}
export function useCompleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: CompleteCampaignInput) =>
      (await api.patch(`/campaigns/${p.id}/complete`, {
        actualServings: p.actualServings,
        earlyEndConfirmation: p.earlyEndConfirmation,
        earlyEndReason: p.earlyEndReason,
      })).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// Provider: quyên góp nguyên liệu cho chiến dịch
export function usePledgeDonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; itemName: string; quantity: number; unit?: string; note?: string }) =>
      (await api.post(`/campaigns/${p.campaignId}/donations`, { itemName: p.itemName, quantity: p.quantity, unit: p.unit, note: p.note })).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// Charity: xác nhận đã nhận nguyên liệu
export function useConfirmDonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (donationId: string) => (await api.patch(`/campaigns/donations/${donationId}/confirm`)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// Charity: lịch sử yêu cầu thay đổi của một chiến dịch
export function useCampaignChangeRequests(campaignId: string, enabled = true) {
  return useQuery({
    queryKey: ['campaigns', 'change-requests', campaignId],
    queryFn: async () =>
      (await api.get(`/campaigns/${campaignId}/change-requests`)).data.data as CampaignChangeRequest[],
    enabled,
    staleTime: 15_000,
  });
}

// Charity: gửi yêu cầu thay đổi chiến dịch (chờ admin duyệt)
export function useSubmitCampaignChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; input: SubmitCampaignChangeInput }) =>
      (await api.post(`/campaigns/${p.id}/change-requests`, p.input)).data.data,
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'change-requests', p.id] });
    },
  });
}

// Charity: huỷ yêu cầu thay đổi đang chờ duyệt
export function useCancelCampaignChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changeRequestId: string) =>
      (await api.patch(`/campaigns/change-requests/${changeRequestId}/cancel`)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// TNV: chuyển bước công việc (kèm ảnh minh chứng tuỳ chọn)
export function useAdvanceTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { assignmentId: string; photo?: File; lng?: number; lat?: number }) => {
      const fd = new FormData();
      if (p.photo) fd.append('photo', p.photo);
      if (p.lng != null) fd.append('lng', String(p.lng));
      if (p.lat != null) fd.append('lat', String(p.lat));
      const { data } = await api.post(`/campaigns/assignments/${p.assignmentId}/advance`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as { id: string; status: string; pointsAwarded?: number };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-tasks'] });
    },
  });
}

// ─── Provider: nhận & duyệt request từ charity ─────────────────────────────────

export interface ProviderRequestItem {
  id: string;
  campaignId: string;
  receiverId: string;
  providerId: string;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  durationMonths: number | null;
  reviewedAt: string | null;
  reviewedNote: string | null;
  createdAt: string;
  updatedAt: string;
  /// Ngày TNV đến lấy thực phẩm (copy từ campaign lúc accept).
  scheduledDate: string | null;
  /// Giờ bắt đầu lấy hàng do provider chọn (HH:mm). Null = chưa accept hoặc pickup do charity sắp xếp.
  pickupStartTime: string | null;
  /// Giờ kết thúc lấy hàng (HH:mm).
  pickupEndTime: string | null;
  /// True nếu BE đã tạo delivery + đang tìm TNV giao hàng.
  needsTransport: boolean;
  /// Trạng thái của campaign_transports gắn với request này (nếu có).
  transport: { id: string; status: 'pending' | 'assigned' | 'delivered' | 'failed'; deliveryId: string | null } | null;
  receiver: {
    id: string;
    organizationName: string | null;
    user: { fullName: string; email: string };
  };
  campaign: { id: string; title: string; scheduledDate: string | null } | null;
}

/** Provider: xem danh sách request nhận được */
export function useProviderRequests() {
  return useQuery({
    queryKey: ['campaigns', 'provider-requests'],
    queryFn: async () => {
      const { data } = await api.get('/campaigns/provider-requests');
      return data.data as ProviderRequestItem[];
    },
    staleTime: 15_000,
  });
}

/** Provider: duyệt (accept) hoặc từ chối (reject) request */
export function useReviewProviderRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      requestId: string;
      action: 'accept' | 'reject';
      note?: string;
      /** Giờ TNV đến lấy (HH:mm). Chỉ dùng khi action='accept'. */
      pickupTime?: string;
      /** Có cần hệ thống tìm TNV giao hàng không? Mặc định true. */
      needsTransport?: boolean;
    }) => {
      const { data } = await api.patch(
        `/campaigns/provider-requests/${p.requestId}/review`,
        {
          action: p.action,
          note: p.note,
          pickupTime: p.pickupTime,
          needsTransport: p.needsTransport,
        },
      );
      return data.data as ProviderRequestItem & { transportId?: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'provider-requests'] });
    },
  });
}

/** Charity: xem danh sách request đã gửi đến provider */
export interface CampaignTransportItem {
  id: string;
  status: 'pending' | 'assigned' | 'heading_to_provider' | 'picked_up' | 'in_transit' | 'delivered' | 'received' | 'failed';
  deliveryId: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  receivedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  receiptNote: string | null;
  receiptPhotoUrl: string | null;
}

export interface SentRequestItem {
  id: string;
  campaignId: string;
  receiverId: string;
  providerId: string;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  durationMonths: number | null;
  reviewedAt: string | null;
  reviewedNote: string | null;
  pickupStartTime: string | null;
  pickupEndTime: string | null;
  needsTransport: boolean;
  createdAt: string;
  transport: CampaignTransportItem | null;
  provider: {
    id: string;
    businessName: string | null;
    user: { fullName: string; email: string };
  };
  campaign: { id: string; title: string; scheduledDate: string | null } | null;
}

export function useSentRequests() {
  return useQuery({
    queryKey: ['campaigns', 'my-sent-requests'],
    queryFn: async () => {
      const { data } = await api.get('/campaigns/my-sent-requests');
      return data.data as SentRequestItem[];
    },
    staleTime: 15_000,
  });
}

export function useConfirmCampaignTransportReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; transportId: string }) =>
      (await api.post(`/campaigns/${p.campaignId}/transports/${p.transportId}/receive`)).data.data,
    onSuccess: (_data, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-sent-requests'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
    },
  });
}

// ─── Manage endpoints (cho trang /campaigns/[id]/manage/*) ──────────────────

/** Tổ chức: duyệt / từ chối 1 đăng ký TNV (status=pending → assigned/rejected). */
export function useReviewAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      campaignId: string;
      assignmentId: string;
      action: 'approved' | 'rejected';
      note?: string;
      shiftId?: string;
    }) => {
      const { data } = await api.patch(
        `/campaigns/${p.campaignId}/assignments/${p.assignmentId}/review`,
        { action: p.action, note: p.note, shiftId: p.shiftId },
      );
      return data.data;
    },
    onSuccess: (_d, p) => {
      // Refetch ngay lập tức cả manage-detail và public-detail để RegistrationRow
      // đọc được serverStatus mới (assigned/rejected) thay vì giữ optimistic local.
      void qc.invalidateQueries({
        queryKey: ['campaigns', 'manage-detail', p.campaignId],
        refetchType: 'all',
      });
      void qc.invalidateQueries({
        queryKey: ['campaigns', 'public', p.campaignId],
        refetchType: 'all',
      });
    },
  });
}

// Tổ chức: chi tiết chiến dịch cho trang quản lý (bao gồm cả pending assignments)
export function useCampaignManageDetail(id: string) {
  return useQuery({
    queryKey: ['campaigns', 'manage-detail', id],
    queryFn: async () => (await api.get(`/campaigns/${id}/manage-detail`)).data.data as CampaignManageDetail,
    enabled: !!id,
    staleTime: 15_000,
  });
}

export interface CampaignManageDetail extends Omit<PublicCampaignDetail, 'participants'> {
  participants: CampaignManageParticipant[];
  menuItemRefs?: Array<{ id: string; customName: string; plannedServings: number | null; recipeId: string | null; sortOrder: number }>;
}

export interface CreateDistributionInput {
  servingsServed: number;
  peopleServed: number;
  leftoverServings?: number;
  roundLabel?: string;
  note?: string;
}

/** Tổ chức: ghi nhận 1 đợt phát suất ăn. */
export function useCreateDistribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; input: CreateDistributionInput }) => {
      const { data } = await api.post(`/campaigns/${p.campaignId}/manage/distributions`, p.input);
      return data.data;
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'public', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
    },
  });
}

export interface ShiftInput {
  label: string;
  role?: 'chef' | 'waiter' | 'shipper';
  startTime: string;
  endTime: string;
  slotsNeeded: number;
}
export interface ShiftUpdateInput {
  label?: string;
  role?: 'chef' | 'waiter' | 'shipper' | null;
  startTime?: string;
  endTime?: string;
  slotsNeeded?: number;
}
export interface CampaignShift {
  id: string;
  label: string;
  role: 'chef' | 'waiter' | 'shipper' | null;
  startTime: string;
  endTime: string;
  slotsNeeded: number;
  slotsFilled: number;
}

/** Tổ chức: thêm ca trực. */
export function useAddShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; input: ShiftInput }) => {
      const { data } = await api.post(`/campaigns/${p.campaignId}/manage/shifts`, p.input);
      return data.data as CampaignShift;
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'public', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
    },
  });
}

/** Tổ chức: sửa ca trực. */
export function useUpdateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; shiftId: string; input: ShiftUpdateInput }) => {
      const { data } = await api.put(
        `/campaigns/${p.campaignId}/shifts/${p.shiftId}`,
        p.input,
      );
      return data.data as CampaignShift;
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'public', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
    },
  });
}

/** Tổ chức: xoá ca trực. */
export function useDeleteShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; shiftId: string }) => {
      const { data } = await api.delete(`/campaigns/${p.campaignId}/shifts/${p.shiftId}`);
      return data.data as { id: string; deleted: true };
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'public', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
    },
  });
}

/** Tổ chức: thêm món vào thực đơn. */
export function useAppendMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; input: { name: string; type: string; plannedServings?: number } }) => {
      const { data } = await api.post(`/campaigns/${p.campaignId}/manage/menu-items`, p.input);
      return data.data as { menuItems: Array<{ name: string; type: string; plannedServings?: number | null }> };
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'public', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
    },
  });
}

/** Tổ chức: thêm vật phẩm cần chuẩn bị. */
export function useAppendSupplyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; input: { name: string; quantity?: number; unit?: string } }) => {
      const { data } = await api.post(`/campaigns/${p.campaignId}/supply-items`, p.input);
      return data.data as { supplyItems: Array<{ name: string; quantity?: number | null; unit?: string | null }> };
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'public', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
    },
  });
}
