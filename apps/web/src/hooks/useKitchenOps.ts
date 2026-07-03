import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AssignmentRole, SafetyCheckResult, SafetyCheckType } from '@foodresq/types';

// ── Ca làm việc ────────────────────────────────────────────────────────────────

export interface CampaignShift {
  id: string;
  campaignId: string;
  label: string;
  role: AssignmentRole | null;
  startTime: string;
  endTime: string;
  slotsNeeded: number;
  slotsFilled: number;
  assignments: {
    id: string;
    role: AssignmentRole;
    status: string;
    volunteer: { user: { fullName: string; avatarUrl: string | null } };
  }[];
}

export function useShifts(campaignId: string) {
  return useQuery({
    queryKey: ['kitchen', 'shifts', campaignId],
    queryFn: async () => (await api.get(`/campaigns/${campaignId}/shifts`)).data.data as CampaignShift[],
    enabled: !!campaignId,
    staleTime: 15_000,
  });
}

export function useCreateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      campaignId: string;
      label: string;
      role?: AssignmentRole;
      startTime: string;
      endTime: string;
      slotsNeeded: number;
    }) => (await api.post(`/campaigns/${p.campaignId}/shifts`, p)).data.data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: ['kitchen', 'shifts', p.campaignId] }),
  });
}

export function useApplyShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; shiftId: string; role?: AssignmentRole }) =>
      (await api.post(`/campaigns/${p.campaignId}/shifts/${p.shiftId}/apply`, { role: p.role })).data.data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: ['kitchen', 'shifts', p.campaignId] }),
  });
}

// ── Thực đơn (công thức) ──────────────────────────────────────────────────────

export interface CampaignMenuItem {
  id: string;
  campaignId: string;
  recipeId: string | null;
  customName: string | null;
  plannedServings: number | null;
  sortOrder: number;
  recipe: { id: string; name: string; servings: number; difficulty: string; imageUrls: unknown } | null;
}

export function useMenuItems(campaignId: string) {
  return useQuery({
    queryKey: ['kitchen', 'menu', campaignId],
    queryFn: async () => (await api.get(`/campaigns/${campaignId}/menu-items`)).data.data as CampaignMenuItem[],
    enabled: !!campaignId,
    staleTime: 15_000,
  });
}

export function useAddMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      campaignId: string;
      recipeId?: string;
      customName?: string;
      plannedServings?: number;
      sortOrder?: number;
    }) => (await api.post(`/campaigns/${p.campaignId}/menu-items`, p)).data.data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: ['kitchen', 'menu', p.campaignId] }),
  });
}

export function useRemoveMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; itemId: string }) =>
      (await api.delete(`/campaigns/menu-items/${p.itemId}`)).data.data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: ['kitchen', 'menu', p.campaignId] }),
  });
}

// ── Nhật ký an toàn thực phẩm ──────────────────────────────────────────────────

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

export function useSafetyLogs(campaignId: string) {
  return useQuery({
    queryKey: ['kitchen', 'safety', campaignId],
    queryFn: async () => (await api.get(`/campaigns/${campaignId}/safety-logs`)).data.data as SafetyLog[],
    enabled: !!campaignId,
    staleTime: 15_000,
  });
}

export function useCreateSafetyLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      campaignId: string;
      checkType: SafetyCheckType;
      measuredValue?: string;
      result?: SafetyCheckResult;
      note?: string;
      photo?: File;
    }) => {
      const fd = new FormData();
      fd.append('checkType', p.checkType);
      if (p.measuredValue) fd.append('measuredValue', p.measuredValue);
      if (p.result) fd.append('result', p.result);
      if (p.note) fd.append('note', p.note);
      if (p.photo) fd.append('photo', p.photo);
      const { data } = await api.post(`/campaigns/${p.campaignId}/safety-logs`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as SafetyLog;
    },
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: ['kitchen', 'safety', p.campaignId] }),
  });
}

// ── Phân phát suất ăn ──────────────────────────────────────────────────────────

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

export interface DistributionSummary {
  rounds: number;
  totalServings: number;
  totalPeople: number;
  totalLeftover: number;
}

export function useDistributions(campaignId: string) {
  return useQuery({
    queryKey: ['kitchen', 'dist', campaignId],
    queryFn: async () => (await api.get(`/campaigns/${campaignId}/distributions`)).data.data as MealDistribution[],
    enabled: !!campaignId,
    staleTime: 15_000,
  });
}

export function useDistributionSummary(campaignId: string) {
  return useQuery({
    queryKey: ['kitchen', 'dist-summary', campaignId],
    queryFn: async () =>
      (await api.get(`/campaigns/${campaignId}/distributions/summary`)).data.data as DistributionSummary,
    enabled: !!campaignId,
    staleTime: 15_000,
  });
}

export function useCreateDistribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      campaignId: string;
      roundLabel?: string;
      servingsServed: number;
      peopleServed: number;
      leftoverServings?: number;
      lng?: number;
      lat?: number;
      note?: string;
      photo?: File;
    }) => {
      const fd = new FormData();
      if (p.roundLabel) fd.append('roundLabel', p.roundLabel);
      fd.append('servingsServed', String(p.servingsServed));
      fd.append('peopleServed', String(p.peopleServed));
      if (p.leftoverServings != null) fd.append('leftoverServings', String(p.leftoverServings));
      if (p.lng != null) fd.append('lng', String(p.lng));
      if (p.lat != null) fd.append('lat', String(p.lat));
      if (p.note) fd.append('note', p.note);
      if (p.photo) fd.append('photo', p.photo);
      const { data } = await api.post(`/campaigns/${p.campaignId}/distributions`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as MealDistribution;
    },
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ['kitchen', 'dist', p.campaignId] });
      void qc.invalidateQueries({ queryKey: ['kitchen', 'dist-summary', p.campaignId] });
    },
  });
}

export function useAddFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; distId: string; satisfaction: number; comment?: string }) =>
      (await api.post(`/campaigns/distributions/${p.distId}/feedback`, {
        satisfaction: p.satisfaction,
        comment: p.comment,
      })).data.data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: ['kitchen', 'dist', p.campaignId] }),
  });
}
