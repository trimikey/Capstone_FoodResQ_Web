/**
 * Định dạng hiển thị thông tin người dùng: nhãn tiếng Việt + màu cho
 * vai trò (role) và trạng thái tài khoản (status). Giá trị enum khớp backend
 * (prisma schema): UserRole và UserStatus.
 */

/** Nhãn tiếng Việt cho vai trò. */
export function roleLabel(role?: string | null): string {
  switch (role) {
    case 'admin':
      return 'Quản trị viên';
    case 'provider':
      return 'Nhà cung cấp';
    case 'receiver':
      return 'Người nhận';
    case 'volunteer':
      return 'Tình nguyện viên';
    default:
      return role ?? 'Người dùng';
  }
}

export interface StatusDisplay {
  label: string;
  /** Màu nền badge (nhạt) */
  bg: string;
  /** Màu chữ badge */
  fg: string;
}

/** Nhãn + màu cho trạng thái tài khoản. */
export function statusDisplay(status?: string | null): StatusDisplay {
  switch (status) {
    case 'active':
      return { label: 'Đang hoạt động', bg: '#dcfce7', fg: '#15803d' };
    case 'pending_verification':
      return { label: 'Chờ xác minh', bg: '#fef3c7', fg: '#b45309' };
    case 'suspended':
      return { label: 'Tạm khoá', bg: '#fee2e2', fg: '#b91c1c' };
    case 'banned':
      return { label: 'Bị cấm', bg: '#fee2e2', fg: '#991b1b' };
    default:
      return { label: status ?? 'Không rõ', bg: '#f3f4f6', fg: '#6b7280' };
  }
}

/** Nhãn tiếng Việt cho hạng tình nguyện viên (VolunteerRank). */
export function volunteerRankLabel(rank?: string | null): string {
  switch (rank) {
    case 'newcomer':
      return 'Người mới';
    case 'active':
      return 'Tích cực';
    case 'experienced':
      return 'Kinh nghiệm';
    case 'expert':
      return 'Chuyên gia';
    default:
      return rank ?? '';
  }
}
