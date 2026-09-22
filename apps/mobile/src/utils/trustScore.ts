export type TrustScoreMeta = {
  label: string;
  hint: string;
  tone: 'positive' | 'warning' | 'danger';
};

/**
 * Diễn giải điểm tin cậy theo trạng thái tài khoản thực tế.
 * Trạng thái được ưu tiên vì các ngưỡng có thể được quản trị viên cấu hình lại.
 */
export function trustScoreMeta(score: number, status?: string | null): TrustScoreMeta {
  if (status === 'banned') {
    return {
      label: 'Đã khóa',
      hint: 'Tài khoản đang bị khóa do điểm tin cậy thấp. Vui lòng liên hệ hỗ trợ.',
      tone: 'danger',
    };
  }

  if (status === 'suspended') {
    return {
      label: 'Bị hạn chế',
      hint: 'Tài khoản đang bị hạn chế do điểm tin cậy thấp.',
      tone: 'warning',
    };
  }

  if (score >= 80) {
    return {
      label: 'Tin cậy cao',
      hint: 'Điểm phản ánh việc hoàn thành đúng cam kết trên hệ thống.',
      tone: 'positive',
    };
  }

  if (score > 60) {
    return {
      label: 'Tin cậy tốt',
      hint: 'Điểm phản ánh việc hoàn thành đúng cam kết trên hệ thống.',
      tone: 'positive',
    };
  }

  if (score > 30) {
    return {
      label: 'Cần cải thiện',
      hint: 'Hãy hoàn thành đúng cam kết để cải thiện điểm tin cậy.',
      tone: 'warning',
    };
  }

  return {
    label: 'Điểm rất thấp',
    hint: 'Điểm tin cậy đang ở mức rất thấp. Vui lòng kiểm tra trạng thái tài khoản.',
    tone: 'danger',
  };
}
