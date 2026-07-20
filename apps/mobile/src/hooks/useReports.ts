import { useMutation, useQuery } from '@tanstack/react-query';
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

export interface MyReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

interface MyReportsPage {
  items: MyReport[];
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

/** Báo cáo của tôi. GET /reports/my */
export function useMyReports() {
  return useQuery({
    queryKey: ['reports', 'my'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<MyReport[] | MyReportsPage>>(endpoints.reports.my);
      return Array.isArray(res.data.data) ? res.data.data : res.data.data.items;
    },
  });
}
