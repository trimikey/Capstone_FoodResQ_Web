import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
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
