import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { BulkRunStatus, type ApiResponse, type BulkRun, type BulkRunStop } from '@foodresq/types';

// Ngưỡng giao sỉ — khớp BULK_MIN_QTY phía BE
export const BULK_MIN_QTY = 10;

export type { BulkRun, BulkRunStop } from '@foodresq/types';
export type BulkStop = BulkRunStop;

const ACTIVE_STATUSES: BulkRun['status'][] = [
  BulkRunStatus.REQUESTED,
  BulkRunStatus.APPROVED,
  BulkRunStatus.PICKED_UP,
];
export const isActiveRun = (r: BulkRun) => ACTIVE_STATUSES.includes(r.status);

// ── Queries ──────────────────────────────────────────────────────────────────
export function useMyBulkRuns(enabled = true) {
  return useQuery({
    queryKey: ['bulk-runs', 'my'],
    queryFn: async () => (await api.get<ApiResponse<BulkRun[]>>('/bulk-runs/my')).data.data,
    enabled,
    refetchInterval: 15_000, // bắt trạng thái duyệt/từ chối của NCC
  });
}

export function useProviderBulkRuns(enabled = true) {
  return useQuery({
    queryKey: ['bulk-runs', 'provider'],
    queryFn: async () => (await api.get<ApiResponse<BulkRun[]>>('/bulk-runs/provider')).data.data,
    enabled,
    refetchInterval: 20_000, // bắt yêu cầu mới từ shipper
  });
}

// ── Mutations (invalidate cả 2 phía + listings vì kho thay đổi) ──────────────
function useBulkMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bulk-runs'] });
      void qc.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

export function useRequestBulkRun() {
  return useBulkMutation(async (p: { listingId: string; quantity: number; note?: string }) =>
    (await api.post('/bulk-runs', p)).data.data,
  );
}

export function useApproveBulkRun() {
  return useBulkMutation(async (runId: string) => (await api.post(`/bulk-runs/${runId}/approve`)).data.data);
}

export function useRejectBulkRun() {
  return useBulkMutation(async (p: { runId: string; reason?: string }) =>
    (await api.post(`/bulk-runs/${p.runId}/reject`, { reason: p.reason })).data.data,
  );
}

export function usePickupBulkRun() {
  return useBulkMutation(async (p: { runId: string; photo?: File }) => {
    const form = new FormData();
    if (p.photo) form.append('photo', p.photo);
    return (
      await api.post(`/bulk-runs/${p.runId}/pickup`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data.data;
  });
}

export function useAddBulkStop() {
  return useBulkMutation(
    async (p: { runId: string; label: string; address?: string; lng: number; lat: number; plannedQty?: number }) =>
      (await api.post(`/bulk-runs/${p.runId}/stops`, {
        label: p.label,
        address: p.address,
        lng: p.lng,
        lat: p.lat,
        plannedQty: p.plannedQty,
      })).data.data,
  );
}

export function useServeBulkStop() {
  return useBulkMutation(async (p: { runId: string; stopId: string; servedQty: number; note?: string; photo?: File }) => {
    const form = new FormData();
    form.append('servedQty', String(p.servedQty));
    if (p.note) form.append('note', p.note);
    if (p.photo) form.append('photo', p.photo);
    return (
      await api.post(`/bulk-runs/${p.runId}/stops/${p.stopId}/serve`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data.data;
  });
}

export function useCompleteBulkRun() {
  return useBulkMutation(async (runId: string) => (await api.post(`/bulk-runs/${runId}/complete`)).data.data);
}

export function useCancelBulkRun() {
  return useBulkMutation(async (runId: string) => (await api.post(`/bulk-runs/${runId}/cancel`)).data.data);
}
