import { useMutation } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';

export type ReportTargetType = 'user' | 'listing' | 'delivery' | 'campaign';
export type ReportReason =
  | 'spoiled_food'
  | 'unsafe_food'
  | 'no_show_provider'
  | 'fraud'
  | 'other';

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

/** Gửi báo cáo. POST /reports */
export function useCreateReport() {
  return useMutation({
    mutationFn: async (input: CreateReportInput) => {
      const res = await apiClient.post<ApiResponse<{ id: string; status: string; message: string }>>(
        endpoints.reports.create,
        input
      );
      return res.data.data;
    },
  });
}
