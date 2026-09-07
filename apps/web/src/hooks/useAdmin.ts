import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AdminStats {
  users: number;
  providers: number;
  volunteers: number;
  receivers: number;
  listingsActive: number;
  reservations: number;
  pendingReports: number;
  pendingVerifications: number;
}

export interface VerificationItem {
  type: 'provider' | 'volunteer' | 'charity';
  profileId: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  detail: string;
  createdAt: string;
  // Verification extensions (provider GPKD, volunteer/shipper vehicle evidence)
  businessName?: string;
  organizationName?: string | null;
  businessType?: string;
  taxCode?: string | null;
  address?: string | null;
  contactPhone?: string | null;
  evidenceUrls?: string[];
  description?: string | null;
  lng?: number | null;
  lat?: number | null;
  faceImageUrl?: string | null;
  idCardImageUrl?: string | null;
  idCardNumber?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  specializations?: { specialization: string; isVerified: boolean }[];
}

export interface AdminReport {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string | null;
  status: string;
  createdAt: string;
  reporter: { fullName: string; email: string };
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  status: string;
  trustScore: number;
  avatarUrl: string | null;
  /** Ảnh khuôn mặt eKYC đã đăng ký — chỉ receiver/volunteer có, provider/admin là null */
  faceImageUrl: string | null;
  /** Ảnh CCCD đã đăng ký eKYC — hiển thị cho admin khi xem chi tiết */
  idCardImageUrl?: string | null;
  createdAt: string;
  specializations: { specialization: 'chef' | 'waiter' | 'shipper'; isVerified: boolean }[];
  isCharityOrg: boolean;
  /** Provider/volunteer profile ID — needed to call /admin/verifications/{type}/{profileId} */
  profileId?: string;
  businessName?: string | null;
  contactPhone?: string | null;
  providerVerificationStatus?: 'pending' | 'under_review' | 'approved' | 'rejected' | string | null;
  providerIsVerified?: boolean | null;
  providerAvgRating?: number | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get('/admin/stats')).data.data as AdminStats,
    staleTime: 15_000,
  });
}

export interface AdminOverview extends AdminStats {
  kgRescued: number;
  co2SavedKg: number;
  mealsServed: number;
  peopleHelped: number;
  newUsers: number;
  categories: { category: string; kg: number }[];
  trend: { ym: string; kg: number }[];
  donations: { confirmed: number; pickedUp: number; completed: number; cancelled: number };
  reports: { total: number; pending: number };
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => (await api.get('/admin/overview')).data.data as AdminOverview,
    staleTime: 15_000,
  });
}

export function useVerifications() {
  return useQuery({
    queryKey: ['admin', 'verifications'],
    queryFn: async () => (await api.get('/admin/verifications')).data.data as VerificationItem[],
  });
}

export function useReviewVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { type: string; id: string; decision: 'approved' | 'rejected'; note?: string }) =>
      (await api.patch(`/admin/verifications/${p.type}/${p.id}`, { decision: p.decision, note: p.note })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminReports(status?: string) {
  return useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: async () =>
      (await api.get('/admin/reports', { params: status ? { status } : {} })).data.data as AdminReport[],
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; status: 'resolved' | 'dismissed'; resolutionNote?: string }) =>
      (await api.patch(`/admin/reports/${p.id}`, { status: p.status, resolutionNote: p.resolutionNote })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminUsers(role?: string, q?: string) {
  return useQuery({
    queryKey: ['admin', 'users', role, q],
    queryFn: async () =>
      (await api.get('/admin/users', { params: { role, q } })).data.data as AdminUser[],
  });
}

export interface FrequentCanceller {
  id: string;
  fullName: string;
  email: string;
  status: string;
  trustScore: number;
  cancelled: number;
  noShow: number;
  total: number;
  cancelRate: number;
  lastReason: string | null;
}

export function useFrequentCancellers() {
  return useQuery({
    queryKey: ['admin', 'frequent-cancellers'],
    queryFn: async () => (await api.get('/admin/frequent-cancellers')).data.data as FrequentCanceller[],
  });
}

export interface RecentReservation {
  id: string;
  status: string;
  quantity: number;
  createdAt: string;
  title: string;
  category: string;
  quantityUnit: string;
  provider: string;
  receiver: string;
}

export function useRecentReservations(limit = 10) {
  return useQuery({
    queryKey: ['admin', 'recent-reservations', limit],
    queryFn: async () => (await api.get('/admin/recent-reservations', { params: { limit } })).data.data as RecentReservation[],
    staleTime: 15_000,
  });
}

export interface SystemConfigItem {
  key: string;
  label: string;
  description: string;
  group: string;
  unit: string;
  min: number;
  max: number;
  default: number;
  value: number;
  updatedAt: string | null;
  /** `minute-of-day` = giá trị là số phút từ 00:00; giao diện quy đổi sẵn ra giờ. */
  display?: 'minute-of-day';
}

export function useAdminConfigs() {
  return useQuery({
    queryKey: ['admin', 'configs'],
    queryFn: async () => (await api.get('/admin/configs')).data.data as SystemConfigItem[],
  });
}

export function useSetConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { key: string; value: number }) =>
      (await api.patch(`/admin/configs/${p.key}`, { value: p.value })).data.data as SystemConfigItem[],
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'configs'] });
    },
  });
}

export interface AdminCampaign {
  id: string;
  title: string;
  kitchenAddress: string;
  /** Thời điểm tổ chức gửi yêu cầu tạo chiến dịch. */
  createdAt: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: 'pending_approval' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
  expectedServings: number | null;
  charity: string;
  slotsNeeded: number;
  slotsFilled: number;
  volunteers: number;
}

export function useAdminCampaigns(status?: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['admin', 'campaigns', status, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      return (await api.get('/admin/campaigns', { params })).data.data as AdminCampaign[];
    },
  });
}

export interface CampaignAssignment {
  id: string;
  role: 'chef' | 'waiter' | 'shipper';
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  pointsAwarded: number | null;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
}

export interface AdminCampaignDetail {
  id: string;
  title: string;
  description: string | null;
  kitchenAddress: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: AdminCampaign['status'];
  expectedServings: number | null;
  actualServings: number | null;
  imageUrls: string[];
  charity: string;
  charityPhone: string | null;
  slots: Record<'chef' | 'waiter' | 'shipper', { needed: number; filled: number }>;
  assignments: CampaignAssignment[];
}

export function useAdminCampaignDetail(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'campaign', id],
    queryFn: async () => (await api.get(`/admin/campaigns/${id}`)).data.data as AdminCampaignDetail,
    enabled: !!id,
  });
}

export function useSetCampaignStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; status: 'approved' | 'cancelled'; reason?: string }) =>
      (await api.post(
        `/admin/campaigns/${p.id}/${p.status === 'approved' ? 'approve' : 'reject'}`,
        p.status === 'cancelled' && p.reason?.trim() ? { reason: p.reason.trim() } : {},
      )).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'campaigns'] });
    },
  });
}

export interface AdminFoodListing {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  group: string;
  groupLabel: string;
  status: string;
  quantityRemaining: number;
  quantityTotal: number;
  quantityUnit: string;
  weightPerUnitKg: number | null;
  pickupEndTime: string;
  imageUrls: string[];
  businessName: string | null;
  createdAt: string;
}

export interface AdminFoodListingsResult {
  items: AdminFoodListing[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function useAdminFoodListings(params: { page?: number; group?: string; category?: string; status?: string; search?: string }) {
  return useQuery({
    queryKey: ['admin', 'food-listings', params],
    queryFn: async () =>
      (await api.get('/admin/food-listings', { params })).data.data as AdminFoodListingsResult,
    staleTime: 15_000,
  });
}

export function useUpdateListingCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; category: string }) =>
      (await api.patch(`/admin/food-listings/${p.id}/category`, { category: p.category })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'food-listings'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export interface PendingAssignment {
  id: string;
  role: 'chef' | 'waiter' | 'shipper';
  createdAt: string;
  campaign: { id: string; title: string; scheduledDate: string; startTime: string; endTime: string; status: string };
  volunteer: {
    id: string;
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
    dedicationPoints: number;
    rank: string;
    avgRating: string | number | null;
    specializations: string[];
  };
}

export function useAdminPendingAssignments() {
  return useQuery({
    queryKey: ['admin', 'pending-assignments'],
    queryFn: async () =>
      (await api.get('/admin/campaign-assignments/pending')).data.data as PendingAssignment[],
    staleTime: 15_000,
  });
}

export function useReviewAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; decision: 'approve' | 'reject'; note?: string }) =>
      (await api.patch(`/admin/campaign-assignments/${p.id}/review`, { decision: p.decision, note: p.note }))
        .data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'pending-assignments'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'campaigns'] });
    },
  });
}

export interface AdminCharity { id: string; name: string; isCharityOrg: boolean; }
export interface AdminVolunteer { volunteerId: string; fullName: string; specializations: string[]; }

export interface CreateCampaignInput {
  charityReceiverId: string;
  title: string;
  description?: string;
  kitchenAddress: string;
  lng?: number;
  lat?: number;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  chefSlotsNeeded?: number;
  waiterSlotsNeeded?: number;
  shipperSlotsNeeded?: number;
  expectedServings?: number;
}

export function useAdminCharities() {
  return useQuery({
    queryKey: ['admin', 'charities'],
    queryFn: async () => (await api.get('/admin/charities')).data.data as AdminCharity[],
    staleTime: 60_000,
  });
}

export interface VolunteerDetail {
  volunteerId: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  accountStatus: string;
  avatarUrl: string | null;
  isAvailable: boolean;
  dedicationPoints: number;
  rank: string;
  vehicleType: string | null;
  avgRating: number | null;
  verificationStatus: string;
  specializations: { specialization: 'chef' | 'waiter' | 'shipper'; isVerified: boolean }[];
  campaigns: number;
  deliveries: number;
}

export function useVolunteersManage() {
  return useQuery({
    queryKey: ['admin', 'volunteers-manage'],
    queryFn: async () => (await api.get('/admin/volunteers/manage')).data.data as VolunteerDetail[],
  });
}

export function useAdminVolunteers(role?: string) {
  return useQuery({
    queryKey: ['admin', 'volunteers', role ?? 'all'],
    queryFn: async () =>
      (await api.get('/admin/volunteers', { params: role ? { role } : {} })).data.data as AdminVolunteer[],
  });
}

// Bốn hook admin tạo/sửa chiến dịch và gán/gỡ TNV đã được gỡ bỏ: backend không hề
// đăng ký các route đó (POST /admin/campaigns, PATCH /admin/campaigns/:id,
// POST /admin/campaigns/:id/assign, DELETE /admin/assignments/:id) nên mọi lời gọi
// đều 404. Việc duyệt TNV thuộc về tổ chức chủ chiến dịch, còn đổi lịch đi qua luồng
// yêu cầu thay đổi (change request) — vốn tính lại mốc thời gian và ca trực đúng cách.

export function useReviewUserVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      type: 'provider' | 'volunteer' | 'charity';
      profileId: string;
      decision: 'approved' | 'rejected';
      note?: string;
    }) =>
      (await api.patch(`/admin/verifications/${p.type}/${p.profileId}`, { decision: p.decision, note: p.note })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useSetUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; status: 'active' | 'suspended' | 'banned' }) =>
      (await api.patch(`/admin/users/${p.id}/status`, { status: p.status })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: 'receiver' | 'provider' | 'volunteer';
  phone?: string;
  businessName?: string;
  address?: string;
  volunteerRole?: 'chef' | 'waiter' | 'shipper';
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => (await api.post('/admin/users', input)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

// ─── Danh mục thực phẩm: NHÓM → LOẠI (admin tự quản lý) ─────────────────────

export interface FoodCatalogItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface FoodCatalogCategory {
  id: string;
  name: string;
  /** 'ready_to_eat' | 'raw_ingredient' | 'other' */
  group: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
  items: FoodCatalogItem[];
}

export interface FoodCatalogResult {
  categories: FoodCatalogCategory[];
  totalCategories: number;
  totalItems: number;
}

export function useFoodCatalog(search?: string) {
  return useQuery({
    queryKey: ['admin', 'food-catalog', search ?? ''],
    queryFn: async () =>
      (await api.get('/admin/food-catalog', { params: search ? { search } : {} })).data
        .data as FoodCatalogResult,
    staleTime: 15_000,
  });
}

function useCatalogMutation<TVars>(fn: (v: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'food-catalog'] }),
  });
}

export function useCreateFoodCategory() {
  return useCatalogMutation(async (p: { name: string; group?: string; description?: string }) =>
    (await api.post('/admin/food-categories', p)).data.data);
}

export function useUpdateFoodCategory() {
  return useCatalogMutation(async (p: {
    id: string; name?: string; group?: string; description?: string; isActive?: boolean;
  }) => {
    const { id, ...body } = p;
    return (await api.patch(`/admin/food-categories/${id}`, body)).data.data;
  });
}

export function useDeleteFoodCategory() {
  return useCatalogMutation(async (id: string) =>
    (await api.delete(`/admin/food-categories/${id}`)).data.data);
}

export function useCreateFoodCatalogItem() {
  return useCatalogMutation(async (p: { categoryId: string; name: string; description?: string }) =>
    (await api.post('/admin/food-catalog', p)).data.data);
}

export function useUpdateFoodCatalogItem() {
  return useCatalogMutation(async (p: {
    id: string; categoryId?: string; name?: string; description?: string; isActive?: boolean;
  }) => {
    const { id, ...body } = p;
    return (await api.patch(`/admin/food-catalog/${id}`, body)).data.data;
  });
}

export function useDeleteFoodCatalogItem() {
  return useCatalogMutation(async (id: string) =>
    (await api.delete(`/admin/food-catalog/${id}`)).data.data);
}
