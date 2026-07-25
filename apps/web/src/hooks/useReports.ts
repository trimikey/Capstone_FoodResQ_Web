import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  return useMutation({
    mutationFn: createReport,
    onSuccess: () => {
      toast.success('Đã gửi báo cáo. Đội ngũ quản trị sẽ xem xét trong 24 giờ.');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      const msg = err?.response?.data?.error?.message ?? 'Không gửi được báo cáo, vui lòng thử lại.';
      toast.error(msg);
    },
  });
}
