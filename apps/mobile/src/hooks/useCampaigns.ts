import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { CapturedImage } from '@/services/faceCapture';

export type AssignmentRole = 'chef' | 'waiter' | 'shipper';

/** Trạng thái chiến dịch: draft (chờ duyệt) → open (đang tuyển) → in_progress → completed/cancelled. */
export type CampaignStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | (string & {});

/** Một suất tình nguyện viên đã được gán vào chiến dịch. */
export interface CampaignAssignment {
  id: string;
  role: AssignmentRole;
  status: string;
  volunteer: { user: { fullName: string; avatarUrl?: string | null } };
}

/** Một lượt quyên góp nguyên liệu (pledged → received khi charity xác nhận). */
export interface CampaignDonation {
  id: string;
  itemName: string;
  quantity: string | null;
  note?: string | null;
  status: 'pledged' | 'received' | (string & {});
  createdAt?: string;
  provider: { businessName: string };
}

/** Mục thực đơn / lịch trình của chiến dịch (lưu JSON ở backend). */
export interface MenuItem { name: string; type?: string }
export interface ScheduleItem { time: string; label: string }

/** Chiến dịch bếp ăn — khớp shape GET /campaigns và GET /campaigns/:id. */
export interface Campaign {
  id: string;
  title: string;
  description: string | null;
  kitchenAddress: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  chefSlotsNeeded: number;
  waiterSlotsNeeded: number;
  shipperSlotsNeeded: number;
  chefSlotsFilled: number;
  waiterSlotsFilled: number;
  shipperSlotsFilled: number;
  status: CampaignStatus;
  expectedServings?: number | null;
  actualServings?: number | null;
  imageUrls?: string[];
  charityReceiver?: { organizationName: string | null; user?: { fullName: string } };
  // Chỉ có ở chi tiết (GET /campaigns/:id)
  menuItems?: MenuItem[];
  scheduleItems?: ScheduleItem[];
  supplyItems?: string[];
  assignments?: CampaignAssignment[];
  donations?: CampaignDonation[];
}

/** Body POST /campaigns/:id/donations — quyên góp nguyên liệu. */
export interface PledgeDonationInput {
  campaignId: string;
  itemName: string;
  quantity?: string;
  note?: string;
}

/** Body POST /campaigns — charity-org tạo chiến dịch bếp ăn (status tự về 'draft', chờ admin duyệt). */
export interface CreateCampaignInput {
  title: string;
  description?: string;
  kitchenAddress: string;
  lat: number;
  lng: number;
  scheduledDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  chefSlotsNeeded?: number;
  waiterSlotsNeeded?: number;
  shipperSlotsNeeded?: number;
  expectedServings?: number;
  menuItems?: MenuItem[];
  scheduleItems?: ScheduleItem[];
  supplyItems?: string[];
}

/**
 * Danh sách chiến dịch đang mở/đang diễn ra (open + in_progress). GET /campaigns
 * Mọi role đăng nhập đều xem được; provider dùng để chọn chiến dịch quyên góp.
 */
export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns', 'open'],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Campaign[]>>(endpoints.campaigns.list);
      return res.data.data;
    },
  });
}

/** Chi tiết 1 chiến dịch (kèm menu, lịch trình, vật phẩm, TNV, quyên góp). GET /campaigns/:id */
export function useCampaignDetail(id?: string) {
  return useQuery({
    queryKey: ['campaign', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Campaign>>(endpoints.campaigns.detail(id!));
      return res.data.data;
    },
  });
}

/** Provider quyên góp nguyên liệu cho chiến dịch. POST /campaigns/:id/donations */
export function usePledgeDonation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, itemName, quantity, note }: PledgeDonationInput) => {
      const res = await apiClient.post<ApiResponse<CampaignDonation>>(
        endpoints.campaigns.donate(campaignId),
        { itemName, ...(quantity ? { quantity } : {}), ...(note ? { note } : {}) }
      );
      return res.data.data;
    },
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/**
 * Chiến dịch bếp ăn của tôi (charity-org). GET /campaigns/my
 * Gồm cả draft (chờ admin duyệt) + open + in_progress + completed.
 */
export function useMyCampaigns(enabled: boolean = true) {
  return useQuery({
    queryKey: ['campaigns', 'mine'],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Campaign[]>>(endpoints.campaigns.my);
      return res.data.data;
    },
  });
}

/** Charity-org tạo chiến dịch mới (gửi yêu cầu, chờ admin duyệt). POST /campaigns */
export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCampaignInput) => {
      const res = await apiClient.post<ApiResponse<Campaign>>(endpoints.campaigns.create, input);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'mine'] });
    },
  });
}

/** Charity bắt đầu chiến dịch (open → in_progress). PATCH /campaigns/:id/start */
export function useStartCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.patch<ApiResponse<Campaign>>(endpoints.campaigns.start(id));
      return res.data.data;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/** Charity kết thúc chiến dịch + nhập số suất thực tế (in_progress → completed). PATCH /campaigns/:id/complete */
export function useCompleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, actualServings }: { id: string; actualServings: number }) => {
      const res = await apiClient.patch<ApiResponse<Campaign>>(endpoints.campaigns.complete(id), {
        actualServings,
      });
      return res.data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/** Charity xác nhận đã nhận 1 lượt quyên góp (pledged → received). PATCH /campaigns/donations/:id/confirm */
export function useConfirmDonation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ donationId }: { donationId: string; campaignId: string }) => {
      const res = await apiClient.patch<ApiResponse<{ id: string; status: string }>>(
        endpoints.campaigns.confirmDonation(donationId)
      );
      return res.data.data;
    },
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
  });
}

/** Một công việc TNV đã đăng ký (kèm chiến dịch). GET /campaigns/my-tasks */
export interface CampaignTask {
  id: string;
  role: AssignmentRole;
  status: string;
  checkInTime?: string | null;
  campaign: {
    id: string;
    title: string;
    kitchenAddress: string;
    scheduledDate: string;
    startTime: string;
    endTime: string;
    status: CampaignStatus;
  };
}

/** Volunteer đăng ký 1 vai trò trong chiến dịch. POST /campaigns/:id/apply */
export function useApplyCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, role }: { campaignId: string; role: AssignmentRole }) => {
      const res = await apiClient.post<ApiResponse<{ message: string }>>(
        endpoints.campaigns.apply(campaignId),
        { role }
      );
      return res.data.data;
    },
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-tasks'] });
    },
  });
}

/** Việc bếp ăn TNV đã đăng ký. GET /campaigns/my-tasks */
export function useMyTasks(enabled: boolean = true) {
  return useQuery({
    queryKey: ['campaign-tasks'],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CampaignTask[]>>(endpoints.campaigns.myTasks);
      return res.data.data;
    },
  });
}

/**
 * TNV chuyển bước công việc của mình (kèm ảnh minh chứng tuỳ bước).
 * POST /campaigns/assignments/:id/advance (multipart, field "photo").
 */
export function useAdvanceTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ assignmentId, photo }: { assignmentId: string; photo?: CapturedImage }) => {
      const form = new FormData();
      if (photo) form.append('photo', photo as unknown as Blob);
      const res = await apiClient.post<ApiResponse<{ id: string; status: string; pointsAwarded?: number }>>(
        endpoints.campaigns.advanceTask(assignmentId),
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-tasks'] });
    },
  });
}
