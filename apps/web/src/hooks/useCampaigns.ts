import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AssignmentRole } from '@foodresq/types';

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
  status: string;
  actualServings?: number | null;
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
}

export interface CreateCampaignInput {
  title: string;
  description?: string;
  kitchenAddress: string;
  lng: number;
  lat: number;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  chefSlotsNeeded?: number;
  waiterSlotsNeeded?: number;
  shipperSlotsNeeded?: number;
  expectedServings?: number;
}

export interface MyTask {
  id: string;
  role: 'chef' | 'waiter' | 'shipper';
  status: string;
  campaign: {
    id: string;
    title: string;
    kitchenAddress: string;
    scheduledDate: string;
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

export function useApplyCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; role: AssignmentRole }) =>
      (await api.post(`/campaigns/${p.id}/apply`, { role: p.role })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

// Tổ chức: bắt đầu chiến dịch (open → in_progress)
export function useStartCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.patch(`/campaigns/${id}/start`)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// Tổ chức: kết thúc chiến dịch + nhập số suất thực tế
export function useCompleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; actualServings: number }) =>
      (await api.patch(`/campaigns/${p.id}/complete`, { actualServings: p.actualServings })).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// Provider: quyên góp nguyên liệu cho chiến dịch
export function usePledgeDonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; itemName: string; quantity?: string; note?: string }) =>
      (await api.post(`/campaigns/${p.campaignId}/donations`, { itemName: p.itemName, quantity: p.quantity, note: p.note })).data.data,
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

// TNV: chuyển bước công việc (kèm ảnh minh chứng tuỳ chọn)
export function useAdvanceTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { assignmentId: string; photo?: File }) => {
      const fd = new FormData();
      if (p.photo) fd.append('photo', p.photo);
      const { data } = await api.post(`/campaigns/assignments/${p.assignmentId}/advance`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as { id: string; status: string; pointsAwarded?: number };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}
