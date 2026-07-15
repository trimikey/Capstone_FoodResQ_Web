'use client';

import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { useMe } from '@/hooks/useProfile';
import { useFaceEnrollment } from '@/hooks/useFaceEnrollment';
import { UserRole } from '@foodresq/types';
import FaceEnrollmentPanel from '@/components/shared/FaceEnrollmentPanel';

/**
 * Cổng eKYC toàn dashboard: người nhận CÁ NHÂN và tình nguyện viên chưa có
 * khuôn mặt gốc (tài khoản tạo qua Google/Firebase bỏ qua bước selfie lúc đăng ký)
 * sẽ bị chặn bằng modal bắt buộc — không đóng được cho đến khi enroll xong.
 * BE cũng chặn đặt chỗ / bật nhận đơn (FACE_NOT_ENROLLED) nên đây là lớp UX,
 * không phải lớp bảo mật duy nhất.
 */
export default function FaceEnrollmentGate() {
  const user = useAuthStore((s) => s.user);
  const isFaceRole = user?.role === UserRole.RECEIVER || user?.role === UserRole.VOLUNTEER;

  const { data: me } = useMe(isFaceRole);
  // Tổ chức từ thiện không cần eKYC khuôn mặt
  const isCharity = !!me?.receiver?.isCharityOrg;
  const { data: enrollment } = useFaceEnrollment(isFaceRole && !isCharity && !!me);

  // Chỉ chặn khi đã CHẮC CHẮN chưa enroll (không nháy modal lúc đang tải)
  if (!isFaceRole || isCharity || !enrollment || enrollment.enrolled) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-[#FAFBF9] rounded-t-2xl sm:rounded-3xl w-full sm:max-w-3xl shadow-2xl flex flex-col gap-6 p-6 sm:p-10 max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-[#96F28A] rounded-full flex items-center justify-center mb-6 shadow-sm">
            <span className="material-symbols-outlined text-green-900 font-bold text-3xl">verified_user</span>
          </div>
          <h2 className="font-bold text-[28px] text-neutral-800">Hoàn tất xác minh khuôn mặt</h2>
          <p className="font-bold text-[15px] text-emerald-800 mt-2">
            Tài khoản của bạn chưa đăng ký khuôn mặt gốc
          </p>
          <p className="text-[13px] text-neutral-500 mt-1 max-w-md">
            {user?.role === UserRole.VOLUNTEER
              ? 'Tình nguyện viên cần khuôn mặt gốc để được giao nhiệm vụ và xác minh khi giao nhận.'
              : 'Người nhận cần khuôn mặt gốc để đối chiếu khi nhận hàng.'}{' '}
            Đây là bước bắt buộc, chỉ làm một lần — chưa xong sẽ không đặt chỗ / nhận đơn được.
          </p>
        </div>
        {/* Không truyền onSkip → không có nút bỏ qua */}
        <FaceEnrollmentPanel
          onDone={() => toast.success('Xác minh khuôn mặt hoàn tất — bạn có thể dùng đầy đủ tính năng!')}
        />
      </div>
    </div>
  );
}
