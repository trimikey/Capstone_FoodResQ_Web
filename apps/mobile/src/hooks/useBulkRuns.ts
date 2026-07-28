import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { BulkRun } from '@foodresq/types';
import type { CapturedImage } from '../services/faceCapture';
import { useNetworkStatus } from './useNetworkStatus';

export const BULK_MIN_QTY = 10;

const ACTIVE_STATUSES: BulkRun['status'][] = ['requested', 'approved', 'picked_up'] as BulkRun['status'][];

export function isActiveRun(run: BulkRun): boolean {
  return ACTIVE_STATUSES.includes(run.status);
}

export function useMyBulkRuns(enabled = true) {
  const { isOnline } = useNetworkStatus();
  return useQuery({
    queryKey: ['bulk-runs', 'my'],
    enabled: enabled && isOnline,
    refetchInterval: isOnline ? 15_000 : false,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<BulkRun[]>>(endpoints.bulkRuns.my);
      return res.data.data;
    },
  });
}

function useBulkMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bulk-runs'] });
      void qc.invalidateQueries({ queryKey: ['listings'] });
      void qc.invalidateQueries({ queryKey: ['volunteer', 'me'] });
    },
  });
}

export function useRequestBulkRun() {
  return useBulkMutation(async (params: { listingId: string; quantity: number; note?: string }) => {
    const res = await apiClient.post<ApiResponse<BulkRun>>(endpoints.bulkRuns.request, params);
    return res.data.data;
  });
}

export function usePickupBulkRun() {
  return useBulkMutation(async (params: { runId: string; photo?: CapturedImage }) => {
    const form = new FormData();
    if (params.photo) form.append('photo', params.photo as unknown as Blob);
    const res = await apiClient.post<ApiResponse<unknown>>(endpoints.bulkRuns.pickup(params.runId), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  });
}

export function useAddBulkStop() {
  return useBulkMutation(
    async (params: { runId: string; label: string; address?: string; lng: number; lat: number; plannedQty?: number }) => {
      const res = await apiClient.post<ApiResponse<unknown>>(endpoints.bulkRuns.addStop(params.runId), {
        label: params.label,
        address: params.address,
        lng: params.lng,
        lat: params.lat,
        plannedQty: params.plannedQty,
      });
      return res.data.data;
    },
  );
}

export function useServeBulkStop() {
  return useBulkMutation(
    async (params: { runId: string; stopId: string; servedQty: number; note?: string; photo?: CapturedImage }) => {
      const form = new FormData();
      form.append('servedQty', String(params.servedQty));
      if (params.note) form.append('note', params.note);
      if (params.photo) form.append('photo', params.photo as unknown as Blob);
      const res = await apiClient.post<ApiResponse<unknown>>(
        endpoints.bulkRuns.serveStop(params.runId, params.stopId),
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
  );
}

export function useCompleteBulkRun() {
  return useBulkMutation(async (runId: string) => {
    const res = await apiClient.post<ApiResponse<unknown>>(endpoints.bulkRuns.complete(runId));
    return res.data.data;
  });
}

export function useCancelBulkRun() {
  return useBulkMutation(async (runId: string) => {
    const res = await apiClient.post<ApiResponse<unknown>>(endpoints.bulkRuns.cancel(runId));
    return res.data.data;
  });
}
