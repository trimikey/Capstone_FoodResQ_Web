import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafetyCheckResult, SafetyCheckType } from '@foodresq/types';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { CapturedImage } from '../services/faceCapture';
import type { AssignmentRole } from './useCampaigns';

/** Ca làm việc trong chiến dịch (GET /campaigns/:id/shifts). */
export interface CampaignShift {
  id: string;
  campaignId: string;
  label: string;
  role: AssignmentRole | null;
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  slotsNeeded: number;
  slotsFilled: number;
  assignments: {
    id: string;
    role: AssignmentRole;
    status: string;
    volunteer: { user: { fullName: string; avatarUrl: string | null } };
  }[];
}

/** Món trong thực đơn chiến dịch — có thể nối công thức hoặc là món tự do. */
export interface CampaignMenuItem {
  id: string;
  campaignId: string;
  recipeId: string | null;
  customName: string | null;
  plannedServings: number | null;
  sortOrder: number;
  recipe: { id: string; name: string; servings: number; difficulty: string; imageUrls: unknown } | null;
}

/** Nhật ký an toàn thực phẩm của chiến dịch. */
export interface SafetyLog {
  id: string;
  campaignId: string;
  checkType: SafetyCheckType;
  measuredValue: string | null;
  result: SafetyCheckResult;
  photoUrl: string | null;
  note: string | null;
  checkedAt: string;
  checkedBy: { user: { fullName: string } };
}

/** Một đợt phân phát suất ăn trong chiến dịch. */
export interface MealDistribution {
  id: string;
  campaignId: string;
  roundLabel: string | null;
  servingsServed: number;
  peopleServed: number;
  leftoverServings: number;
  photoUrl: string | null;
  note: string | null;
  distributedAt: string;
  servedByName: string;
  feedbackCount: number;
}

/** Tổng hợp các đợt phân phát của chiến dịch. */
export interface DistributionSummary {
  rounds: number;
  totalServings: number;
  totalPeople: number;
  totalLeftover: number;
}

/** Body tạo ca (charity). startTime/endTime dạng 'HH:mm'. */
export interface CreateShiftInput {
  campaignId: string;
  label: string;
  role?: AssignmentRole;
  startTime: string;
  endTime: string;
  slotsNeeded: number;
}

/** Body thêm món (charity): 1 món = recipeId HOẶC customName. */
export interface AddMenuItemInput {
  campaignId: string;
  recipeId?: string;
  customName?: string;
  plannedServings?: number;
  sortOrder?: number;
}

export interface CreateSafetyLogInput {
  campaignId: string;
  checkType: SafetyCheckType;
  measuredValue?: string;
  result?: SafetyCheckResult;
  note?: string;
  photo?: CapturedImage;
}

export interface CreateDistributionInput {
  campaignId: string;
  roundLabel?: string;
  servingsServed: number;
  peopleServed: number;
  leftoverServings?: number;
  lng?: number;
  lat?: number;
  note?: string;
  photo?: CapturedImage;
}

/** Danh sách ca của chiến dịch. GET /campaigns/:id/shifts */
export function useShifts(campaignId?: string) {
  return useQuery({
    queryKey: ['kitchen', 'shifts', campaignId],
    enabled: !!campaignId,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CampaignShift[]>>(endpoints.kitchen.shifts(campaignId!));
      return res.data.data;
    },
  });
}

/** Charity tạo ca làm việc. POST /campaigns/:id/shifts */
export function useCreateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, ...body }: CreateShiftInput) => {
      const res = await apiClient.post<ApiResponse<CampaignShift>>(endpoints.kitchen.shifts(campaignId), body);
      return res.data.data;
    },
    onSuccess: (_d, { campaignId }) => qc.invalidateQueries({ queryKey: ['kitchen', 'shifts', campaignId] }),
  });
}

/** Volunteer đăng ký vào 1 ca. POST /campaigns/:id/shifts/:shiftId/apply */
export function useApplyShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, shiftId, role }: { campaignId: string; shiftId: string; role?: AssignmentRole }) => {
      const res = await apiClient.post<ApiResponse<unknown>>(
        endpoints.kitchen.applyShift(campaignId, shiftId),
        role ? { role } : {}
      );
      return res.data.data;
    },
    onSuccess: (_d, { campaignId }) => {
      qc.invalidateQueries({ queryKey: ['kitchen', 'shifts', campaignId] });
      qc.invalidateQueries({ queryKey: ['campaign-tasks'] });
    },
  });
}

/** Thực đơn (món nối công thức) của chiến dịch. GET /campaigns/:id/menu-items */
export function useMenuItems(campaignId?: string) {
  return useQuery({
    queryKey: ['kitchen', 'menu', campaignId],
    enabled: !!campaignId,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CampaignMenuItem[]>>(endpoints.kitchen.menuItems(campaignId!));
      return res.data.data;
    },
  });
}

/** Charity thêm món vào thực đơn. POST /campaigns/:id/menu-items */
export function useAddMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, ...body }: AddMenuItemInput) => {
      const res = await apiClient.post<ApiResponse<CampaignMenuItem>>(endpoints.kitchen.menuItems(campaignId), body);
      return res.data.data;
    },
    onSuccess: (_d, { campaignId }) => qc.invalidateQueries({ queryKey: ['kitchen', 'menu', campaignId] }),
  });
}

/** Charity xoá món khỏi thực đơn. DELETE /campaigns/menu-items/:itemId */
export function useRemoveMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string; campaignId: string }) => {
      const res = await apiClient.delete<ApiResponse<unknown>>(endpoints.kitchen.removeMenuItem(itemId));
      return res.data.data;
    },
    onSuccess: (_d, { campaignId }) => qc.invalidateQueries({ queryKey: ['kitchen', 'menu', campaignId] }),
  });
}

/** Nhật ký an toàn thực phẩm. GET /campaigns/:id/safety-logs */
export function useSafetyLogs(campaignId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['kitchen', 'safety', campaignId],
    enabled: enabled && !!campaignId,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<SafetyLog[]>>(
        `/campaigns/${campaignId!}/safety-logs`
      );
      return res.data.data;
    },
  });
}

/** Chef ghi nhật ký an toàn thực phẩm. POST /campaigns/:id/safety-logs */
export function useCreateSafetyLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, photo, ...body }: CreateSafetyLogInput) => {
      const form = new FormData();
      form.append('checkType', body.checkType);
      if (body.measuredValue) form.append('measuredValue', body.measuredValue);
      if (body.result) form.append('result', body.result);
      if (body.note) form.append('note', body.note);
      if (photo) form.append('photo', photo as unknown as Blob);
      const res = await apiClient.post<ApiResponse<SafetyLog>>(
        `/campaigns/${campaignId}/safety-logs`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
    onSuccess: (_d, { campaignId }) => {
      qc.invalidateQueries({ queryKey: ['kitchen', 'safety', campaignId] });
    },
  });
}

/** Danh sách đợt phân phát. GET /campaigns/:id/distributions */
export function useDistributions(campaignId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['kitchen', 'dist', campaignId],
    enabled: enabled && !!campaignId,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<MealDistribution[]>>(
        `/campaigns/${campaignId!}/distributions`
      );
      return res.data.data;
    },
  });
}

/** Tổng hợp phân phát. GET /campaigns/:id/distributions/summary */
export function useDistributionSummary(campaignId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['kitchen', 'dist-summary', campaignId],
    enabled: enabled && !!campaignId,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<DistributionSummary>>(
        `/campaigns/${campaignId!}/distributions/summary`
      );
      return res.data.data;
    },
  });
}

/** Waiter ghi một đợt phân phát suất ăn. POST /campaigns/:id/distributions */
export function useCreateDistribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, photo, ...body }: CreateDistributionInput) => {
      const form = new FormData();
      if (body.roundLabel) form.append('roundLabel', body.roundLabel);
      form.append('servingsServed', String(body.servingsServed));
      form.append('peopleServed', String(body.peopleServed));
      if (body.leftoverServings != null) form.append('leftoverServings', String(body.leftoverServings));
      if (body.lng != null) form.append('lng', String(body.lng));
      if (body.lat != null) form.append('lat', String(body.lat));
      if (body.note) form.append('note', body.note);
      if (photo) form.append('photo', photo as unknown as Blob);
      const res = await apiClient.post<ApiResponse<MealDistribution>>(
        `/campaigns/${campaignId}/distributions`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
    onSuccess: (_d, { campaignId }) => {
      qc.invalidateQueries({ queryKey: ['kitchen', 'dist', campaignId] });
      qc.invalidateQueries({ queryKey: ['kitchen', 'dist-summary', campaignId] });
    },
  });
}

/** Gửi phản hồi người thụ hưởng cho một đợt phân phát. */
export function useAddDistributionFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      campaignId: _campaignId,
      distId,
      satisfaction,
      comment,
    }: {
      campaignId: string;
      distId: string;
      satisfaction: number;
      comment?: string;
    }) => {
      const res = await apiClient.post<ApiResponse<unknown>>(
        `/campaigns/distributions/${distId}/feedback`,
        { satisfaction, ...(comment ? { comment } : {}) }
      );
      return res.data.data;
    },
    onSuccess: (_d, { campaignId }) => {
      qc.invalidateQueries({ queryKey: ['kitchen', 'dist', campaignId] });
    },
  });
}
