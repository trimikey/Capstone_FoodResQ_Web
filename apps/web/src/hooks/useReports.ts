import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ReportTargetType, ReportReason } from '@foodresq/types';

interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

async function createReport(input: CreateReportInput) {
  const { data } = await api.post('/reports', input);
  return data.data as { id: string; status: string; message: string };
}

export function useCreateReport() {
  return useMutation({ mutationFn: createReport });
}
