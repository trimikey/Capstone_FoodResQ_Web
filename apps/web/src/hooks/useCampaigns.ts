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
  recruitmentStatus?: 'scheduled' | 'open' | 'staffed' | 'expired_understaffed' | 'closed_ready';
  operationStartAt?: string;
  operationEndAt?: string;
  recruitmentStartAt?: string;
  recruitmentEndAt?: string;
  recruitmentBufferHours?: number;
  actualServings?: number | null;
  distributionSummary?: { servingsServed: number; peopleServed: number; leftoverServings: number };
  peopleServed?: number;
  /** Nguyên liệu/vật phẩm khai lúc tạo chiến dịch — BE trả nguyên JSONB (bản cũ có thể là string[]). */
  supplyItems?: Array<string | { name?: string; quantity?: number | null; unit?: string | null }>;
  charityReceiver?: { organizationName: string | null; user: { fullName: string } };
  assignments?: {
    id: string;
    role: 'chef' | 'waiter' | 'shipper';
    status: string;
    confirmationStatus?: 'pending' | 'confirmed' | 'declined';
    confirmedAt?: string | null;
    /** Ngày trực + ca — dùng để lọc TNV đủ điều kiện đi nhận quyên góp. */
    workDate?: string | null;
    shiftId?: string | null;
    shift?: { label: string; startTime: string; endTime: string; endDayOffset?: number } | null;
    volunteer: { user: { fullName: string; avatarUrl: string | null } };
  }[];
  donations?: CampaignDonationItem[];
  supplyProgress?: SupplyProgressItem[];
}

/** 1 khoản NCC hứa góp cho chiến dịch, kèm lịch đi nhận nếu tổ chức đã phân công. */
export interface CampaignDonationItem {
  id: string;
  itemName: string;
  quantity: string | null;
  note?: string | null;
  status: string;
  createdAt?: string;
  receivedAt?: string | null;
  provider: { businessName: string; address?: string | null; contactPhone?: string | null };
  pickupDate?: string | null;
  pickupStartTime?: string | null;
  pickupEndTime?: string | null;
  /** DS assignment id shipper được cử đi nhận — tra tên qua campaign.assignments. */
  pickupAssigneeIds?: string[];
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
  recruitmentStartAt: string;
  recruitmentEndAt: string;
  /** Máy chủ tự tính từ giờ đóng tuyển đến giờ bắt đầu ca đầu tiên. */
  recruitmentBufferHours?: number;
  expectedServings?: number;
  imageUrls?: string[];
  menuItems: { name: string; type: string; plannedServings?: number }[];
  scheduleItems?: { time: string; label: string }[];
  /** Vật phẩm cần thiết — object đầy đủ {name, quantity?, unit?}. */
  supplyItems?: { name: string; quantity?: number; unit?: string }[];
  /** Ca trực cho tình nguyện viên — insert vào bảng campaign_shifts lúc tạo. */
  shifts: {
    label: string;
    role: 'chef' | 'waiter' | 'shipper';
    period: 'midnight' | 'morning' | 'afternoon' | 'evening';
    slotsNeeded: number;
  }[];
}

export interface MyTask {
  id: string;
  role: 'chef' | 'waiter' | 'shipper';
  status: string;
  confirmationStatus?: 'pending' | 'confirmed' | 'declined';
  confirmedAt?: string | null;
  shiftId?: string | null;
  /** Ngày trực của ca — cần khi chiến dịch kéo dài nhiều ngày. */
  workDate?: string | null;
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
  /** Shipper: delivery ID từ campaign_transports → deliveries (null nếu chưa có delivery) */
  deliveryId?: string | null;
  /**
   * Shipper: các đợt phát suất ăn tổ chức đã phân công cho chính mình.
   * Khác `deliveryId` (chở hàng từ NCC về bếp) — đây là đi phát tận điểm cho người dân.
   */
  distributions?: Array<{
    id: string;
    roundLabel: string | null;
    servingsServed: number;
    peopleServed: number;
    note: string | null;
    distributedAt: string;
    /** null = mới lên kế hoạch, chưa đi phát. Có giá trị = đã xác nhận phát xong. */
    completedAt: string | null;
    points: DistributionPoint[];
  }>;
  /** Khoản quyên góp NCC mà TNV này được tổ chức phân công đi nhận (trong ca trực). */
  donationPickups?: Array<{
    id: string;
    itemName: string;
    quantity: string | null;
    status: string;
    pickupDate: string | null;
    pickupStartTime: string | null;
    pickupEndTime: string | null;
    provider: { businessName: string; address: string | null; contactPhone: string | null };
  }>;
  /** Đơn nguyên liệu NCC mà tổ chức cử shipper này đi nhận (trong ca trực). */
  requestPickups?: Array<{
    id: string;
    ingredientName: string | null;
    quantityKg: number | null;
    pickupDate: string | null;
    pickupStartTime: string | null;
    pickupEndTime: string | null;
    provider: { businessName: string; address: string | null; contactPhone: string | null };
  }>;
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns', 'open'],
    queryFn: async () => (await api.get('/campaigns')).data.data as Campaign[],
    staleTime: 30_000,
    // Người dùng đang mở trang Khám phá vẫn nhìn thấy campaign ngay sau khi admin duyệt.
    refetchInterval: 30_000,
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
  /** Ngày trực — chỉ có ở payload quản lý; danh sách công khai bỏ trống. */
  workDate?: string | null;
  fullName: string;
  avatarUrl: string | null;
  rank: string;
}

/** Thông tin TNV chi tiết cho trang quản lý của charity (từ /manage-detail). */
export interface VolunteerDetail {
  fullName: string;
  avatarUrl: string | null;
  /** Ảnh mặt chụp khi đăng ký eKYC — dùng làm avatar mặc định khi avatarUrl chưa được đặt. */
  faceImageUrl: string | null;
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
  /** id của bản ghi phân công (dùng cho duyệt/từ chối) */
  id: string;
  /** id hồ sơ tình nguyện viên — dùng khi API cần volunteerId, vd người phụ trách đợt phát */
  volunteerId: string;
  role: 'chef' | 'waiter' | 'shipper';
  status: string;
  confirmationStatus?: 'pending' | 'confirmed' | 'declined';
  confirmedAt?: string | null;
  shiftId: string | null;
  /** Ca trực kèm giờ — dùng đối chiếu khung giờ lấy hàng khi phân công shipper. */
  shift?: { id: string; label: string; role: 'chef' | 'waiter' | 'shipper' | null; startTime: string; endTime: string; endDayOffset?: number } | null;
  /** Ngày TNV đăng ký trực (YYYY-MM-DD) — ca chỉ có giờ nên ngày nằm ở đây. */
  workDate: string | null;
  fullName: string;
  avatarUrl: string | null;
  rank: string;
  checkInTime: string | null;
  checkInLateMinutes: number | null;
  notes: string | null;
  createdAt: string;
  volunteer: VolunteerDetail;
}

export interface CampaignProofPhoto { url: string; kind: 'ingredient' | 'cooked' | 'distribution' | string; by: string; }

/** Một điểm phát của đợt — địa chỉ để shipper điều hướng tới. */
export interface DistributionPoint {
  label: string;
  address: string;
  lng?: number;
  lat?: number;
}

export interface CampaignDistribution {
  id: string;
  roundLabel: string | null;
  servingsServed: number;
  peopleServed: number;
  leftoverServings: number;
  photoUrl: string | null;
  note: string | null;
  distributedAt: string;
  /** null = mới lên kế hoạch (chưa tính vào thống kê). Có giá trị = đã phát xong. */
  completedAt: string | null;
  /** TNV đứng tên chính (người đầu tiên trong `assignees`). */
  servedBy: string;
  /** Tất cả shipper được phân công đi phát đợt này (rỗng với đợt tạo trước đây). */
  assignees: { volunteerId: string; fullName: string }[];
  points: DistributionPoint[];
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
  recruitmentStatus: 'scheduled' | 'open' | 'staffed' | 'expired_understaffed' | 'closed_ready';
  recruitmentStartAt: string;
  recruitmentEndAt: string;
  /** Ngày kết thúc của chiến dịch nhiều ngày; null = chỉ diễn ra trong ngày bắt đầu. */
  endDate?: string | null;
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
    /** Ca đã qua buổi cuối cùng của chiến dịch — không còn buổi nào để có mặt. */
    expired?: boolean;
    /** Ca lặp lại mỗi ngày chiến dịch diễn ra; chỗ trống tính riêng từng ngày. */
    days?: Array<{
      date: string;
      slotsNeeded: number;
      slotsFilled: number;
      expired: boolean;
    }>;
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

export interface CampaignStats {
  mealsServed: number;
  peopleServed: number;
  completedCampaigns: number;
  completionRate: number;
  totalCampaigns: number;
  activeCampaigns: number;
}

/** Thống kê toàn hệ thống — suất ăn, người phục vụ, chiến dịch, tỉ lệ. */
export function useCampaignStats() {
  return useQuery({
    queryKey: ['campaigns', 'stats'],
    queryFn: async () => (await api.get('/campaigns/stats')).data.data as CampaignStats,
    staleTime: 60_000,
  });
}

/** Thống kê workspace của charity hiện tại. */
export function useMyCampaignStats(enabled = true) {
  return useQuery({
    queryKey: ['campaigns', 'my-stats'],
    queryFn: async () => (await api.get('/campaigns/my-stats')).data.data as CampaignStats,
    enabled,
    staleTime: 60_000,
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
      return (data.data ?? data) as { url: string };
    },
  });
}

export function useApplyCampaign() {
  const qc = useQueryClient();
  return useMutation({
    // shiftId là BẮT BUỘC với chiến dịch có chia ca — backend từ chối đăng ký chung
    // chung khi campaign_shifts không rỗng. Bỏ trống chỉ dùng cho chiến dịch không ca.
    mutationFn: async (p: {
      id: string;
      role: AssignmentRole;
      shiftId?: string;
      /** Ngày trực YYYY-MM-DD — bắt buộc khi chiến dịch diễn ra nhiều ngày. */
      workDate?: string;
    }) =>
      (
        await api.post(`/campaigns/${p.id}/apply`, {
          role: p.role,
          ...(p.shiftId ? { shiftId: p.shiftId } : {}),
          ...(p.workDate ? { workDate: p.workDate } : {}),
        })
      ).data.data,
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
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'staffing-readiness', id] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', id] });
    },
  });
}

export interface StaffingReadiness {
  recruitmentStatus: 'scheduled' | 'open' | 'staffed' | 'expired_understaffed' | 'closed_ready';
  recruitmentStartAt: string;
  recruitmentEndAt: string;
  recruitmentBufferHours: number;
  operationStartAt: string;
  operationEndAt: string;
  requiredShiftSlots: number;
  assignedShiftSlots: number;
  confirmedShiftSlots: number;
  assignedUniqueVolunteers: number;
  confirmedUniqueVolunteers: number;
  uniqueVolunteers: number;
  minimumFillPercent: number;
  eligibleToStart: boolean;
  canStartNow: boolean;
  ready: boolean;
  matrix: Array<{
    workDate: string;
    shiftId: string;
    label: string;
    period: 'midnight' | 'morning' | 'afternoon' | 'evening' | null;
    role: 'chef' | 'waiter' | 'shipper' | null;
    minRequired: number;
    minimumRequired: number;
    fillPercent: number;
    assigned: number;
    confirmed: number;
    missing: number;
    ready: boolean;
    eligibleToStart: boolean;
    needsReview: boolean;
  }>;
}

export function useStaffingReadiness(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', 'staffing-readiness', campaignId],
    queryFn: async () =>
      (await api.get(`/campaigns/${campaignId}/staffing-readiness`)).data.data as StaffingReadiness,
    enabled: !!campaignId,
    refetchInterval: 15_000,
  });
}

export function useExtendRecruitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; recruitmentEndAt: string }) =>
      (await api.patch(`/campaigns/${p.campaignId}/recruitment/extend`, {
        recruitmentEndAt: p.recruitmentEndAt,
      })).data.data,
    onSuccess: (_data, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'staffing-readiness', p.campaignId] });
    },
  });
}

export function useConfirmCampaignAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { assignmentId: string; decision: 'confirmed' | 'declined' }) =>
      (await api.patch(`/campaigns/assignments/${p.assignmentId}/confirmation`, {
        decision: p.decision,
      })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
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
    mutationFn: async (p: string | { donationId: string; note?: string }) => {
      const donationId = typeof p === 'string' ? p : p.donationId;
      const body = typeof p === 'string' ? {} : { note: p.note };
      return (await api.patch(`/campaigns/donations/${donationId}/confirm`, body)).data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// Charity: phân công (nhiều) shipper đi nhận quyên góp — BE validate từng người
// có ca trực phủ trọn khung giờ lấy hàng
export function useAssignDonationPickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      donationId: string;
      assignmentIds: string[];
      pickupDate: string;
      pickupStartTime: string;
      pickupEndTime: string;
    }) =>
      (
        await api.patch(`/campaigns/donations/${p.donationId}/assign-pickup`, {
          assignmentIds: p.assignmentIds,
          pickupDate: p.pickupDate,
          pickupStartTime: p.pickupStartTime,
          pickupEndTime: p.pickupEndTime,
        })
      ).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// Charity: phân công shipper chiến dịch đi nhận đơn nguyên liệu NCC — BE dùng
// đúng lịch hẹn trên đơn và validate ca trực từng shipper; dừng vòng tìm hệ thống.
export function useAssignRequestPickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { requestId: string; assignmentIds: string[] }) =>
      (
        await api.patch(`/campaigns/requests/${p.requestId}/assign-pickup`, {
          assignmentIds: p.assignmentIds,
        })
      ).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-sent-requests'] });
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
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
  /** Chi tiết nhu cầu nguyên liệu bếp khai khi gửi đơn (null với đơn gửi trước đây). */
  demandDetails: DemandDetails | null;
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
  transport: {
    id: string;
    status: 'pending' | 'assigned' | 'heading_to_provider' | 'picked_up' | 'in_transit' | 'delivered' | 'received' | 'failed';
    deliveryId: string | null;
    /** Bếp đã xác nhận nhận hàng lúc nào + biên nhận (gồm số kg thực nhận). */
    receivedAt?: string | null;
    receiptNote?: string | null;
    failureReason?: string | null;
  } | null;
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
  /** 'cancelled' = tổ chức đã tự phân công shipper chiến dịch, dừng vòng tìm hệ thống. */
  status: 'pending' | 'assigned' | 'heading_to_provider' | 'picked_up' | 'in_transit' | 'delivered' | 'received' | 'failed' | 'cancelled';
  deliveryId: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  receivedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  receiptNote: string | null;
  receiptPhotoUrl: string | null;
  /** Shipper đang nhận chuyến (null khi chưa ai nhận). */
  delivery?: { shipper: { user: { fullName: string; phone: string | null } } | null } | null;
}

/**
 * Chi tiết đơn xin nguyên liệu bếp gửi NCC — lưu ở cột JSONB
 * `campaign_provider_requests.demand_details`. Mọi field optional trừ cam kết
 * phi thương mại (BE chặn nếu không tick).
 */
export interface DemandDetails {
  foodCategory?: string;
  ingredientName?: string;
  quantityKg?: number;
  expectedServings?: number;
  /** Ngày bếp cần nhận nguyên liệu (YYYY-MM-DD). */
  neededDate?: string;
  neededFrom?: string;
  neededTo?: string;
  radiusKm?: number;
  requireAtvstpCert?: boolean;
  requireColdChain?: boolean;
  requireQcPhoto?: boolean;
  nonCommercialWaiver: boolean;
  /** BE đóng dấu lúc nhận yêu cầu, FE không gửi lên. */
  waiverAcceptedAt?: string;
}

export interface SupplierMatch {
  providerId: string;
  businessName: string;
  businessType: string;
  address: string | null;
  avgRating: number | null;
  isVerified: boolean;
  distanceKm: number;
  listingCount: number;
  totalRemaining: number;
  /** CẬN DƯỚI: tin chưa khai `weightPerUnitKg` được tính là 0 kg. */
  estimatedKg: number;
  lng: number;
  lat: number;
}

export interface SupplierMatchResult {
  radiusKm: number;
  kitchen: { lng: number; lat: number } | null;
  /** 'NO_KITCHEN_LOCATION' = chiến dịch chưa ghim toạ độ bếp nên không đo được. */
  reason: 'NO_KITCHEN_LOCATION' | null;
  matches: SupplierMatch[];
}

/** Gợi ý NCC gần bếp nhất (PostGIS). Chỉ chạy khi đã chọn chiến dịch. */
export function useSupplierMatches(
  campaignId: string | null,
  opts: { radiusKm?: number; category?: string } = {},
) {
  return useQuery({
    queryKey: ['campaigns', 'supplier-matches', campaignId, opts.radiusKm, opts.category ?? ''],
    enabled: !!campaignId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await api.get(`/campaigns/${campaignId}/supplier-matches`, {
        params: {
          ...(opts.radiusKm != null ? { radiusKm: opts.radiusKm } : {}),
          ...(opts.category ? { category: opts.category } : {}),
        },
      });
      return data.data as SupplierMatchResult;
    },
  });
}

export interface SendSupplyRequestInput {
  providerId: string;
  campaignId: string;
  listingIds?: string[];
  message?: string;
  demandDetails?: DemandDetails;
}

/** Bếp gửi đơn yêu cầu nguyên liệu tới một NCC. */
export function useSendSupplyRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendSupplyRequestInput) =>
      (await api.post('/campaigns/requests', input)).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-sent-requests'] });
    },
  });
}

export interface SentRequestItem {
  id: string;
  campaignId: string;
  receiverId: string;
  providerId: string;
  message: string | null;
  demandDetails: DemandDetails | null;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  durationMonths: number | null;
  reviewedAt: string | null;
  reviewedNote: string | null;
  /** Ngày hẹn lấy hàng (chốt khi NCC chấp nhận đơn). */
  scheduledDate: string | null;
  pickupStartTime: string | null;
  pickupEndTime: string | null;
  needsTransport: boolean;
  /** DS assignment id shipper chiến dịch được tổ chức cử đi nhận đơn này. */
  pickupAssigneeIds?: string[];
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
    mutationFn: async (p: { campaignId: string; transportId: string; note?: string; receiptPhotoUrl?: string }) =>
      (
        await api.post(`/campaigns/${p.campaignId}/transports/${p.transportId}/receive`, {
          ...(p.note ? { note: p.note } : {}),
          ...(p.receiptPhotoUrl ? { receiptPhotoUrl: p.receiptPhotoUrl } : {}),
        })
      ).data.data,
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
    onSuccess: async (_d, p) => {
      // Refetch ngay lập tức cả manage-detail và public-detail để RegistrationRow
      // đọc được serverStatus mới (assigned/rejected) thay vì giữ optimistic local.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId], refetchType: 'all' }),
        qc.invalidateQueries({ queryKey: ['campaigns', 'public', p.campaignId], refetchType: 'all' }),
        qc.invalidateQueries({ queryKey: ['campaigns', 'open'], refetchType: 'all' }),
        qc.invalidateQueries({ queryKey: ['campaigns', 'mine'], refetchType: 'all' }),
        qc.invalidateQueries({ queryKey: ['campaigns', 'my-tasks'], refetchType: 'all' }),
        qc.refetchQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId], type: 'active' }),
        qc.refetchQueries({ queryKey: ['campaigns', 'public', p.campaignId], type: 'active' }),
        qc.refetchQueries({ queryKey: ['campaigns', 'open'], type: 'active' }),
        qc.refetchQueries({ queryKey: ['campaigns', 'mine'], type: 'active' }),
        qc.refetchQueries({ queryKey: ['campaigns', 'my-tasks'], type: 'active' }),
      ]);
    },
  });
}

// Tổ chức: chi tiết chiến dịch cho trang quản lý (bao gồm cả pending assignments)
export function useCampaignManageDetail(id: string) {
  return useQuery({
    queryKey: ['campaigns', 'manage-detail', id],
    queryFn: async () => (await api.get(`/campaigns/${id}/manage-detail`)).data.data as CampaignManageDetail,
    enabled: !!id,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

export interface CampaignManageDetail extends Omit<PublicCampaignDetail, 'participants'> {
  participants: CampaignManageParticipant[];
  menuItemRefs?: Array<{ id: string; customName: string; plannedServings: number | null; recipeId: string | null; sortOrder: number }>;
  /** Dish steps — tổ chức dùng để duyệt "Sẵn sàng phát xuất" từ chef */
  dishSteps?: DishProcessItem[];
  /**
   * Nhân sự đã tuyển so với ngưỡng tối thiểu (`CAMPAIGN_MIN_FILL_PERCENT` do admin
   * chỉnh). Chưa đạt `minPercent` thì BE chặn bắt đầu chiến dịch.
   */
  staffing?: { filled: number; needed: number; percent: number; minPercent: number };
  /** Toạ độ bếp — mốc mở bản đồ ghim điểm phát. */
  kitchenLng?: number | null;
  kitchenLat?: number | null;
}

export interface CreateDistributionInput {
  /** TNV phụ trách — phải là người ĐÃ ĐƯỢC DUYỆT của chính chiến dịch này */
  servedByVolunteerId?: string;
  /**
   * Các shipper được phân công đi phát đợt này (BE yêu cầu từng người phải là TNV
   * đã duyệt của chiến dịch VÀ có vai trò shipper). Tất cả đều nhận thông báo.
   */
  assigneeVolunteerIds?: string[];
  /** Điểm phát kèm địa chỉ để shipper điều hướng. */
  points?: DistributionPoint[];
  servingsServed: number;
  peopleServed: number;
  leftoverServings?: number;
  roundLabel?: string;
  note?: string;
}

/**
 * Shipper được phân công (hoặc tổ chức) xác nhận đã phát xong một đợt.
 * Chỉ sau bước này số suất mới vào thống kê "đã phát" của chiến dịch.
 */
export function useCompleteDistribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      distributionId: string;
      campaignId?: string;
      /** Số suất THỰC PHÁT — bỏ trống thì BE lấy đúng số đã lên kế hoạch. */
      actualServings?: number;
      actualPeopleServed?: number;
      note?: string;
      /** Ảnh bằng chứng phân phát (multipart field `photo`). */
      proofPhoto?: File;
    }) => {
      const form = new FormData();
      if (p.actualServings != null) form.append('actualServings', String(p.actualServings));
      if (p.actualPeopleServed != null) form.append('actualPeopleServed', String(p.actualPeopleServed));
      if (p.note) form.append('note', p.note);
      if (p.proofPhoto) form.append('photo', p.proofPhoto);
      return (await api.post(`/campaigns/distributions/${p.distributionId}/complete`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })).data.data;
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-tasks'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-distributions'] });
      if (p.campaignId) {
        void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
        void qc.invalidateQueries({ queryKey: ['campaigns', 'public', p.campaignId] });
      }
    },
  });
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
  period?: 'midnight' | 'morning' | 'afternoon' | 'evening' | null;
  endDayOffset?: number;
  needsReview?: boolean;
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

/** Tổ chức: gán bữa cho một món đang ở nhóm "Chưa phân bữa". */
export function useSetMenuItemMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; index: number; type: string }) => {
      const { data } = await api.patch(
        `/campaigns/${p.campaignId}/manage/menu-items/${p.index}/meal`,
        { type: p.type },
      );
      return data.data as { menuItems: Array<{ name: string; type: string }> };
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

// ─── Dish steps (quy trình 4 khâu cố định) ─────────────────────────────────

export interface DishStep {
  id: string;
  stepOrder: 1 | 2 | 3 | 4;
  stepName: string;
  scheduledTime: string;
  status: 'locked' | 'available' | 'in_progress' | 'done';
  effectiveStatus: 'locked' | 'available' | 'in_progress' | 'done';
  completedAt: string | null;
  completedByVolunteerId: string | null;
  proofUrl: string | null;
  note: string | null;
  /// Cờ QC fail — true khi step bị bếp trưởng / TNV đánh dấu ngắt khẩn cấp.
  /// Step vẫn tồn tại trong flow (không xoá); UI hiển thị banner đỏ.
  qcFailedAt?: string | null;
  qcFailureReason?: string | null;
  /// Duyệt ảnh khâu QC (stepOrder=3) bởi tổ chức — 'pending' sau khi chef chụp,
  /// 'approved' mới mở khâu 4, 'rejected' kèm reviewNote để chef chụp lại.
  reviewStatus?: 'pending' | 'approved' | 'rejected' | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  qcFailedByVolunteer?: {
    user: { fullName: string; avatarUrl: string | null };
  } | null;
  completedByVolunteer?: { user: { fullName: string; avatarUrl: string | null } } | null;
}

export interface DishProcessItem {
  id: string;
  name: string;
  recipe?: {
    id: string;
    name: string;
    description: string | null;
    instructions: string | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    difficulty: string | null;
    imageUrls: unknown;
    ingredients: Array<{ name: string; quantity: string | null }>;
  } | null;
  plannedServings: number | null;
  steps: DishStep[];
}

export interface CookingTeamMember {
  volunteerId: string;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  shift: { label: string; startTime: string; endTime: string } | null;
  isMe: boolean;
}

export interface SafetyLog {
  id: string;
  checkType: 'temperature' | 'hygiene' | 'storage' | 'cross_contamination' | 'handwashing';
  measuredValue: string | null;
  result: 'pass' | 'warning' | 'fail';
  photoUrl: string | null;
  note: string | null;
  checkedAt: string;
  checkedBy: { user: { fullName: string } };
}

/**
 * Một ĐƠN NGUYÊN LIỆU đã được NCC nhận — mọi thứ shipper cần để đi lấy hàng:
 * lấy ở đâu, mấy giờ, bao xa, bao nhiêu kg, và biên nhận nếu đã lấy xong.
 */
export interface PickupOrder {
  id: string;
  campaignId: string;
  campaignTitle: string;
  kitchenAddress: string;
  providerName: string;
  providerAddress: string | null;
  providerPhone: string | null;
  lng: number | null;
  lat: number | null;
  /** Khoảng cách NCC → bếp (km, đường chim bay). */
  distanceKm: number | null;
  scheduledDate: string | null;
  pickupStartTime: string | null;
  pickupEndTime: string | null;
  needsTransport: boolean;
  message: string | null;
  ingredientName: string | null;
  foodCategory: string | null;
  /** Số kg bếp ĐẶT — null khi đơn cũ chưa khai chi tiết. */
  quantityKg: number | null;
  expectedServings: number | null;
  requireColdChain: boolean;
  requireQcPhoto: boolean;
  requireAtvstpCert: boolean;
  delivery: { id: string; status: string | null; isMine: boolean } | null;
  /** Biên nhận đã lấy hàng — null khi chưa ai xác nhận. */
  pickup: {
    id: string;
    requestedKg: number | null;
    receivedKg: number | null;
    photoUrl: string | null;
    note: string | null;
    confirmedAt: string;
    byName: string | null;
    isMine: boolean;
  } | null;
}

export interface MyTaskDetail {
  assignment: {
    id: string;
    role: 'chef' | 'waiter' | 'shipper';
    status: string;
    checkInTime: string | null;
    /** Số phút điểm danh trễ (0 = đúng giờ, null = chưa điểm danh). */
    checkInLateMinutes?: number | null;
    /** Ngày trực đã đăng ký (YYYY-MM-DD). Chỉ điểm danh được đúng ngày này. */
    workDate?: string | null;
    ingredientProofUrl: string | null;
    cookedProofUrl: string | null;
    distributionProofUrl: string | null;
    pointsAwarded: number | null;
    shift: {
      id: string;
      label: string;
      role: 'chef' | 'waiter' | 'shipper' | null;
      startTime: string;
      endTime: string;
    } | null;
  };
  campaign: {
    id: string;
    title: string;
    description: string | null;
    kitchenAddress: string;
    scheduledDate: string;
    endDate: string | null;
    startTime: string;
    endTime: string;
    status: string;
    /** Nguyên liệu bếp khai lúc tạo chiến dịch — bảng đối chiếu khi shipper lấy hàng. */
    supplyItems?: CampaignSupplyRequested[];
    /** Danh sách món ăn của chiến dịch — shipper dùng để QC trước khi xác nhận đã lấy hàng. */
    menuItems?: CampaignMenuItem[];
    charityReceiver: { organizationName: string | null; user: { fullName: string; phone: string | null } };
  };
  /** Shipper: các đơn nguyên liệu của chiến dịch cần đi lấy tại NCC. */
  pickupOrders?: PickupOrder[];
  /** Shipper: thông tin delivery (null nếu chưa có) — khi có field này → bỏ dishes/cookingTeam/safetyLogs */
  delivery?: {
    id: string;
    status: string;
    pickupStartTime: string | null;
    pickupEndTime: string | null;
  } | null;
  /** Shipper: các đợt phát tổ chức giao cho chính mình. */
  distributions?: Array<{
    id: string;
    roundLabel: string | null;
    /** Số suất tổ chức LÊN KẾ HOẠCH cho đợt này. */
    servingsServed: number;
    peopleServed: number;
    /** Số suất shipper BÁO CÁO đã phát thực tế (null khi chưa chốt). */
    actualServings: number | null;
    actualPeopleServed: number | null;
    note: string | null;
    distributedAt: string;
    completedAt: string | null;
    points: DistributionPoint[];
  }>;
  /** Chef/Waiter: danh sách món — bỏ khi là shipper */
  dishes?: DishProcessItem[];
  cookingTeam?: CookingTeamMember[];
  safetyLogs?: SafetyLog[];
}

/** TNV: chi tiết 1 nhiệm vụ — gồm ca, chiến dịch, món + 4 khâu. */
export function useMyTaskDetail(assignmentId: string, enabled = true) {
  return useQuery({
    queryKey: ['campaigns', 'my-task-detail', assignmentId],
    queryFn: async () => {
      const { data } = await api.get(`/campaigns/my-tasks/${assignmentId}`);
      return data.data as MyTaskDetail;
    },
    enabled: enabled && !!assignmentId,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

/** Đơn nguyên liệu trong Trung tâm giao hàng — gom từ mọi chiến dịch shipper đang nhận ca. */
export interface TaskDetail {
  id: string;
  role: 'chef' | 'waiter' | 'shipper';
  status: string;
  shift: MyTaskDetail['assignment']['shift'];
  taskList: string[];
  chainStatus: Array<{
    role: 'chef' | 'waiter' | 'shipper';
    label: string;
    total: number;
    completed: number;
    inProgress: number;
    done: boolean;
  }>;
  blockedBy: { role: 'chef' | 'waiter' | 'shipper'; label: string } | null;
  ingredientProofUrl: string | null;
  cookedProofUrl: string | null;
  distributionProofUrl: string | null;
  pointsAwarded: number | null;
  campaign: MyTaskDetail['campaign'] & {
    scheduleItems: Array<{ time: string; label: string }>;
    menuItems: Array<{ id: string; customName: string | null; plannedServings: number | null }>;
    donationsReceived: Array<{ id: string; itemName: string; quantity: string | null }>;
  };
}

export function useTask(assignmentId: string, enabled = true) {
  return useQuery({
    queryKey: ['campaigns', 'task-detail', assignmentId],
    queryFn: async () => {
      const { data } = await api.get(`/campaigns/my-tasks/${assignmentId}`);
      const detail = data.data as MyTaskDetail & {
        dishes?: Array<{ id?: string; customName?: string | null; plannedServings?: number | null; name?: string | null }>;
      };
      const chainLabels = {
        chef: 'Dau bep',
        waiter: 'Phuc vu',
        shipper: 'Giao hang',
      } as const;

      return {
        id: detail.assignment.id,
        role: detail.assignment.role,
        status: detail.assignment.status,
        shift: detail.assignment.shift,
        taskList: [] as string[],
        chainStatus: (['chef', 'waiter', 'shipper'] as const).map((role) => ({
          role,
          label: chainLabels[role],
          total: role === detail.assignment.role ? 1 : 0,
          completed: role === detail.assignment.role && detail.assignment.status === 'completed' ? 1 : 0,
          inProgress: role === detail.assignment.role && ['checked_in', 'in_progress'].includes(detail.assignment.status) ? 1 : 0,
          done: role === detail.assignment.role && detail.assignment.status === 'completed',
        })),
        blockedBy: null as TaskDetail['blockedBy'],
        ingredientProofUrl: detail.assignment.ingredientProofUrl,
        cookedProofUrl: detail.assignment.cookedProofUrl,
        distributionProofUrl: detail.assignment.distributionProofUrl,
        pointsAwarded: detail.assignment.pointsAwarded,
        campaign: {
          ...detail.campaign,
          scheduleItems: [] as Array<{ time: string; label: string }>,
          menuItems: ((detail.dishes ?? []) as Array<{ id?: string; customName?: string | null; plannedServings?: number | null; name?: string | null }>).map((dish, idx) => ({
            id: dish.id ?? String(idx),
            customName: dish.customName ?? dish.name ?? null,
            plannedServings: dish.plannedServings ?? null,
          })),
          donationsReceived: [] as Array<{ id: string; itemName: string; quantity: string | null }>,
        },
      } satisfies TaskDetail;
    },
    enabled: enabled && !!assignmentId,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export interface MyPickupOrder extends PickupOrder {
  assignmentId: string | null;
  /** Đã điểm danh tại bếp của chiến dịch này chưa — điều kiện để xác nhận lấy hàng. */
  checkedIn: boolean;
}

/** Ràng buộc form tạo chiến dịch — lấy từ system_configs để FE không hardcode. */
export interface CampaignCreateConstraints {
  /** Chiến dịch ≥ 2 ngày phải tạo trước bấy nhiêu ngày. 0 = không ràng buộc. */
  multiDayLeadDays: number;
  /** Ngày bắt đầu sớm nhất cho chiến dịch dài ngày (YYYY-MM-DD, tính sẵn theo giờ VN). */
  multiDayEarliestStartDate: string;
  minFillPercent: number;
  changeLockDays: number;
}

export function useCampaignCreateConstraints(enabled = true) {
  return useQuery({
    queryKey: ['campaigns', 'create-constraints'],
    queryFn: async () => {
      const { data } = await api.get('/campaigns/create-constraints');
      return data.data as CampaignCreateConstraints;
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Shipper: đơn nguyên liệu cần đi lấy, gom từ mọi chiến dịch đang chạy. */
export function useMyPickupOrders(enabled = true) {
  return useQuery({
    queryKey: ['campaigns', 'my-pickup-orders'],
    queryFn: async () => {
      const { data } = await api.get('/campaigns/my-pickup-orders');
      return data.data as MyPickupOrder[];
    },
    enabled,
    staleTime: 15_000,
  });
}

export interface PickupHistoryItem {
  id: string;
  providerRequestId: string;
  campaignId: string;
  campaignTitle: string;
  /** Ngày diễn ra chiến dịch + khung giờ, để đối chiếu với giờ chốt đơn. */
  campaignDate: string | null;
  campaignTimeRange: string;
  kitchenAddress: string;
  providerName: string;
  providerAddress: string | null;
  providerPhone: string | null;
  lng: number | null;
  lat: number | null;
  distanceKm: number | null;
  needsTransport: boolean;
  /** Lời nhắn bếp gửi kèm đơn. */
  message: string | null;
  ingredientName: string | null;
  foodCategory: string | null;
  expectedServings: number | null;
  requireColdChain: boolean;
  requireQcPhoto: boolean;
  requireAtvstpCert: boolean;
  scheduledDate: string | null;
  pickupStartTime: string | null;
  pickupEndTime: string | null;
  requestedKg: number | null;
  receivedKg: number;
  shortfallKg: number;
  photoUrl: string;
  note: string | null;
  confirmedAt: string;
}

/** Shipper: lịch sử các đơn nguyên liệu đã lấy. */
export function useMyPickupHistory(p: { page?: number; limit?: number; enabled?: boolean } = {}) {
  const { page = 1, limit = 20, enabled = true } = p;
  return useQuery({
    queryKey: ['campaigns', 'my-pickup-history', page, limit],
    queryFn: async () => {
      const { data } = await api.get('/campaigns/my-pickup-history', { params: { page, limit } });
      return data.data as {
        items: PickupHistoryItem[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
    },
    enabled,
    staleTime: 30_000,
  });
}

/** Shipper: xác nhận đã lấy nguyên liệu tại NCC — bắt buộc ảnh + số kg thực nhận. */
export function useConfirmIngredientPickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      requestId: string;
      receivedKg: number;
      photo: File;
      note?: string;
    }) => {
      const fd = new FormData();
      fd.append('photo', p.photo);
      fd.append('receivedKg', String(p.receivedKg));
      if (p.note) fd.append('note', p.note);
      const { data } = await api.post(`/campaigns/pickup-orders/${p.requestId}/confirm`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as {
        id: string;
        receivedKg: number;
        requestedKg: number | null;
        shortfallKg: number;
        photoUrl: string;
        confirmedAt: string;
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-task-detail'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-tasks'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-pickup-orders'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-pickup-history'] });
    },
  });
}

/** TNV: tick "xong" 1 khâu — bắt buộc ảnh bằng chứng. */
export function useTickDishStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; stepId: string; proof: File; note?: string }) => {
      const fd = new FormData();
      fd.append('proof', p.proof);
      if (p.note) fd.append('note', p.note);
      const { data } = await api.post(
        `/campaigns/${p.campaignId}/dish-steps/${p.stepId}/complete`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data.data as DishStep;
    },
    onSuccess: (_d, p) => {
      // Refetch my-task-detail để cập nhật trạng thái step kế tiếp.
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-task-detail'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-tasks'] });
    },
  });
}

/** Tổ chức: thiết lập 4 giờ dự kiến cho 1 món. */
export function useSetDishStepTimes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; menuItemId: string; scheduledTimes: string[] }) => {
      const { data } = await api.post(
        `/campaigns/${p.campaignId}/menu-items/${p.menuItemId}/step-times`,
        { scheduledTimes: p.scheduledTimes },
      );
      return data.data as DishStep[];
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'public', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-task-detail'] });
    },
  });
}

/**
 * Tổ chức: duyệt / từ chối ẢNH khâu QC (khâu 3) chef đã tải lên.
 * Duyệt xong khâu 4 "Sẵn sàng phát xuất" mới mở; từ chối → khâu QC về lại
 * available để chef chụp lại (reason bắt buộc khi reject).
 */
export function useReviewQcStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      campaignId: string;
      stepId: string;
      action: 'approve' | 'reject';
      reason?: string;
    }) => {
      const { data } = await api.post(
        `/campaigns/${p.campaignId}/dish-steps/${p.stepId}/review`,
        { action: p.action, reason: p.reason },
      );
      return data.data as { id: string; reviewStatus: string; dishName: string };
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-task-detail'] });
    },
  });
}

// Tổ chức: duyệt bước "Sẵn sàng phát xuất" của một món
export function useApproveDishFinalStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; menuItemId: string }) => {
      const { data } = await api.post(`/campaigns/${p.campaignId}/dishes/${p.menuItemId}/approve`);
      return data.data as { id: string; status: string; menuItemName: string };
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-task-detail'] });
    },
  });
}

// Tổ chức: từ chối bước "Sẵn sàng phát xuất" của một món
export function useRejectDishFinalStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; menuItemId: string; reason: string }) => {
      const { data } = await api.post(`/campaigns/${p.campaignId}/dishes/${p.menuItemId}/reject`, { reason: p.reason });
      return data.data as { id: string; status: string; menuItemName: string };
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-task-detail'] });
    },
  });
}

/** Nguyên liệu charity khai báo lúc đăng ký campaign — lưu ở `Campaign.supplyItems`. */
export interface CampaignSupplyRequested {
  name: string;
  unit: string | null;
  quantity: number | null;
}

/** Một món ăn trong thực đơn chiến dịch — shipper dùng để QC khi đến lấy hàng. */
export interface CampaignMenuItem {
  id: string;
  name?: string | null;
  customName?: string | null;
  /** Loại bữa ăn: breakfast | lunch | dinner */
  type?: string | null;
  plannedServings: number | null;
}

/** Bếp trưởng / TNV: danh sách thực phẩm đang có sẵn cho campaign (đã received). */
export interface CampaignSupplyItem {
  itemName: string;
  entries: number;
  quantities: string[];
}
export interface CampaignSupplyDonation {
  id: string;
  itemName: string;
  quantity: string | null;
  note: string | null;
  receivedAt: string | null;
  provider: {
    id: string;
    businessName: string;
    user: { fullName: string };
  };
}
export interface CampaignSuppliesPayload {
  /** Nguyên liệu đăng ký (charity khai báo lúc tạo campaign). */
  requested: CampaignSupplyRequested[];
  /** Tổng số donation đã nhận. */
  total: number;
  /** Group theo itemName từ donations đã nhận. */
  items: CampaignSupplyItem[];
  /** Chi tiết từng donation. */
  donations: CampaignSupplyDonation[];
}

export function useCampaignSupplies(campaignId: string | null | undefined) {
  return useQuery({
    queryKey: ['campaigns', 'supplies', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data } = await api.get(
        `/campaigns/${campaignId}/supplies`,
      );
      return data.data as CampaignSuppliesPayload;
    },
    staleTime: 30_000,
  });
}

/** Bếp trưởng / TNV: QC fail / ngắt khẩn cấp 1 step. */
export function useFlagStepQualityFail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; stepId: string; reason: string }) => {
      const { data } = await api.post(
        `/campaigns/${p.campaignId}/dish-steps/${p.stepId}/qc-fail`,
        { reason: p.reason },
      );
      return data.data as DishStep;
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', 'my-task-detail'] });
      void qc.invalidateQueries({ queryKey: ['campaigns', 'supplies', p.campaignId] });
    },
  });
}

// ─── Lịch tuần ─────────────────────────────────────────────────────────────

export interface WeeklyScheduleCampaign {
  /** isPersonalView=true → assignment UUID; isPersonalView=false → campaign UUID. */
  id: string;
  /**
   * Campaign UUID. CHỈ có ở lịch cá nhân của TNV — nhánh tổ chức trong
   * `getWeeklySchedule` trả thẳng campaign nên không kèm field này (lúc đó `id`
   * đã là campaign UUID).
   */
  campaignId?: string;
  title: string;
  status: 'approved' | 'in_progress' | 'completed';
  /** Chỉ có khi isPersonalView=true (TNV) */
  role?: 'chef' | 'waiter' | 'shipper';
  /**
   * Trạng thái duyệt của chính ca này (chỉ lịch TNV): 'pending' = đăng ký chờ
   * tổ chức duyệt — chưa phải ca chính thức; còn lại là ca đã được nhận.
   */
  assignmentStatus?: 'pending' | 'assigned' | 'checked_in' | 'in_progress' | 'completed';
  /** Chỉ có khi isPersonalView=true (TNV) — ca được giao */
  shift?: {
    id: string;
    label: string;
    startTime: string;
    endTime: string;
  } | null;
}

export interface WeeklyScheduleDay {
  date: string; // YYYY-MM-DD
  campaigns: WeeklyScheduleCampaign[];
}

export interface WeeklySchedule {
  weekStart: string;
  /** true = lịch cá nhân TNV, false = lịch tổ chức */
  isPersonalView: boolean;
  days: WeeklyScheduleDay[];
}

/** TNV hoặc bất kỳ ai đã đăng nhập: lịch tuần các khâu của mọi campaign. */
export function useWeeklySchedule(weekStart?: string) {
  return useQuery({
    queryKey: ['campaigns', 'weekly-schedule', weekStart ?? 'current'],
    queryFn: async () => {
      const { data } = await api.get('/campaigns/schedule/weekly', {
        params: weekStart ? { weekStart } : {},
      });
      return data.data as WeeklySchedule;
    },
    staleTime: 60_000,
  });
}

// ─── Shipper: lịch sử các đợt phát đã đi ─────────────────────────────────────

export interface DistributionHistoryItem {
  id: string;
  campaignId: string;
  campaignTitle: string;
  kitchenAddress: string;
  roundLabel: string | null;
  plannedServings: number;
  actualServings: number;
  actualPeopleServed: number;
  leftover: number;
  completionNote: string | null;
  completedAt: string;
  points: DistributionPoint[];
}

export function useMyDistributionHistory(opts: { page?: number; limit?: number; enabled?: boolean } = {}) {
  const { page = 1, limit = 20, enabled = true } = opts;
  return useQuery({
    queryKey: ['campaigns', 'my-distributions', page, limit],
    enabled,
    queryFn: async () =>
      (await api.get('/campaigns/my-distributions', { params: { page, limit } })).data.data as {
        items: DistributionHistoryItem[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      },
    staleTime: 30_000,
  });
}
