'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useEnrollFace } from '@/hooks/useFaceEnrollment';
import CameraCapture from '@/components/shared/CameraCapture';

type EnrollMethod = 'face' | 'id_card';

interface Props {
  /** Gọi khi đăng ký khuôn mặt thành công */
  onDone: () => void;
  /** Nếu truyền vào, hiện nút "Bỏ qua" (có thể đăng ký sau khi nhận hàng lần đầu) */
  onSkip?: () => void;
}

const ENROLL_CONFIG: Record<
  EnrollMethod,
  { label: string; description: string; icon: string; hint: string }
> = {
  face: {
    label: 'Chụp khuôn mặt (selfie)',
    description: 'Không cần giấy tờ — dùng chính khuôn mặt của bạn',
    icon: 'face',
    hint: 'Chụp selfie rõ nét, đủ ánh sáng — đây sẽ là khuôn mặt gốc để đối chiếu',
  },
  id_card: {
    label: 'Chụp CCCD',
    description: 'Dùng ảnh chân dung trên căn cước công dân',
    icon: 'badge',
    hint: 'Chụp mặt trước CCCD — đặt thẻ phẳng, thấy rõ ảnh chân dung',
  },
};

/**
 * Đăng ký khuôn mặt gốc (1 lần duy nhất): chọn selfie HOẶC CCCD → chụp → gửi.
 * Dùng ở trang đăng ký tài khoản và modal xác minh nhận hàng.
 */
export default function FaceEnrollmentPanel({ onDone, onSkip }: Props) {
  const enrollFace = useEnrollFace();
  const [method, setMethod] = useState<EnrollMethod | null>(null);

  async function onEnrollPhoto(photo: File) {
    if (!method) return;
    try {
      await enrollFace.mutateAsync(method === 'face' ? { selfie: photo } : { idCard: photo });
      toast.success('Đăng ký khuôn mặt thành công!');
      onDone();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Đăng ký thất bại. Chụp lại ảnh rõ nét hơn.';
      toast.error(msg);
      setMethod(null);
    }
  }

  if (method) {
    return (
      <div className="flex flex-col gap-md">
        <CameraCapture
          mode={method}
          hint={ENROLL_CONFIG[method].hint}
          confirmLabel="Đăng ký khuôn mặt"
          busy={enrollFace.isPending}
          onConfirm={onEnrollPhoto}
        />
        <button
          onClick={() => setMethod(null)}
          disabled={enrollFace.isPending}
          className="self-center text-on-surface-variant font-label-sm text-label-sm hover:underline disabled:opacity-50"
        >
          ← Chọn cách khác
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col items-center gap-sm py-sm text-center">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: '48px' }}>
          verified_user
        </span>
        <p className="font-body-md text-on-surface">
          Đăng ký khuôn mặt để xác minh khi nhận hàng. Chọn <strong>một</strong> cách bên dưới —
          không bắt buộc phải có CCCD.
        </p>
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          Chỉ cần làm một lần. Khi nhận hàng, ảnh chụp tại chỗ sẽ được so khớp với khuôn mặt này.
        </p>
      </div>

      {(Object.keys(ENROLL_CONFIG) as EnrollMethod[]).map((m) => (
        <button
          key={m}
          onClick={() => setMethod(m)}
          className="flex items-center gap-md p-md bg-surface-container-low rounded-xl border border-outline-variant/20 hover:border-primary/50 hover:bg-surface-container transition-all text-left"
        >
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
            {ENROLL_CONFIG[m].icon}
          </span>
          <div>
            <p className="font-label-lg text-label-lg text-on-surface">{ENROLL_CONFIG[m].label}</p>
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
              {ENROLL_CONFIG[m].description}
            </p>
          </div>
          <span className="material-symbols-outlined ml-auto text-on-surface-variant">
            chevron_right
          </span>
        </button>
      ))}

      {onSkip && (
        <button
          onClick={onSkip}
          className="self-center text-on-surface-variant font-label-sm text-label-sm hover:underline mt-xs"
        >
          Bỏ qua — đăng ký sau khi nhận hàng lần đầu
        </button>
      )}
    </div>
  );
}
