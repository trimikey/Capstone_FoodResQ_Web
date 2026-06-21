'use client';

import { toast } from 'sonner';
import { useEnrollFace } from '@/hooks/useFaceEnrollment';
import CameraCapture from '@/components/shared/CameraCapture';

interface Props {
  /** Gọi khi đăng ký khuôn mặt thành công */
  onDone: () => void;
  /** Nếu truyền vào, hiện nút "Bỏ qua" (chỉ dùng ở luồng không bắt buộc) */
  onSkip?: () => void;
}

/**
 * Đăng ký khuôn mặt gốc (1 lần duy nhất) bằng selfie.
 * Chỉ hoàn tất khi ảnh có khuôn mặt hợp lệ — BE từ chối ảnh không có/không rõ mặt,
 * người dùng chụp lại ngay trên khung. (Bỏ tuỳ chọn CCCD.)
 */
export default function FaceEnrollmentPanel({ onDone, onSkip }: Props) {
  const enrollFace = useEnrollFace();

  async function onEnrollPhoto(photo: File) {
    try {
      await enrollFace.mutateAsync({ selfie: photo });
      toast.success('Đăng ký khuôn mặt thành công!');
      onDone();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Không nhận diện được khuôn mặt. Vui lòng chụp lại nơi đủ sáng, thấy rõ khuôn mặt.';
      toast.error(msg);
      // Giữ nguyên khung preview → người dùng bấm "Chụp lại" để thử lại
    }
  }

  return (
    <div className="bg-white rounded-[24px] shadow-sm border border-neutral-100 p-6 sm:p-8 flex flex-col gap-6">
      <div className="text-neutral-600 text-[15px] leading-relaxed">
        Chụp (hoặc tải lên) một ảnh <strong>khuôn mặt rõ nét</strong> của bạn. Ảnh phải thấy rõ
        khuôn mặt — hệ thống sẽ từ chối nếu không nhận diện được. Chỉ cần làm một lần; khi nhận hàng,
        ảnh chụp tại chỗ sẽ được so khớp với khuôn mặt này.
      </div>

      <CameraCapture
        mode="face"
        hint="Chụp selfie rõ nét, đủ ánh sáng — đây sẽ là khuôn mặt gốc để đối chiếu"
        confirmLabel="Đăng ký khuôn mặt"
        busy={enrollFace.isPending}
        onConfirm={onEnrollPhoto}
      />

      {onSkip && (
        <div className="pt-1 flex justify-center">
          <button
            onClick={onSkip}
            className="text-neutral-500 font-semibold text-[13px] hover:text-neutral-800 transition-colors flex items-center gap-1"
          >
            Bỏ qua <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}
