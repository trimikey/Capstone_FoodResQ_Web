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
  type: 'provider' | 'volunteer';
  profileId: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  detail: string;
  createdAt: string;
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
  role: string;
  status: string;
  trustScore: number;
  createdAt: string;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get('/admin/stats')).data.data as AdminStats,
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
