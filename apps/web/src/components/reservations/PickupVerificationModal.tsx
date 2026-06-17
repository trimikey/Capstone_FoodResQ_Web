'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSubmitPickupProof } from '@/hooks/useReservation';
import { useFaceEnrollment } from '@/hooks/useFaceEnrollment';
import CameraCapture from '@/components/shared/CameraCapture';
import FaceEnrollmentPanel from '@/components/shared/FaceEnrollmentPanel';

type VerificationType = 'face' | 'id_card';
type Step = 'loading' | 'enroll' | 'choose' | 'capture';

interface Props {
  reservationId: string;
  listingTitle: string;
  onClose: () => void;
}

const TYPE_CONFIG: Record<
  VerificationType,
  { label: string; description: string; icon: string; hint: string }
> = {
  face: {
    label: 'Chụp khuôn mặt',
    description: 'Selfie trực tiếp — hệ thống so khớp với khuôn mặt đã đăng ký',
    icon: 'face',
    hint: 'Giữ khuôn mặt trong khung hình, đủ ánh sáng',
  },
  id_card: {
    label: 'Chụp CCCD',
    description: 'Chân dung trên thẻ được so khớp với khuôn mặt đã đăng ký',
    icon: 'badge',
    hint: 'Đặt CCCD phẳng, rõ nét, không lóa',
  },
};

function apiErrorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
      ?.message ?? fallback
  );
}

export default function PickupVerificationModal({ reservationId, listingTitle, onClose }: Props) {
  const { data: enrollment, isLoading: enrollmentLoading } = useFaceEnrollment();
  const submitProof = useSubmitPickupProof();

  const [step, setStep] = useState<Step>('loading');
  const [verificationType, setVerificationType] = useState<VerificationType>('face');

  // Chưa đăng ký khuôn mặt → bắt buộc đăng ký trước (chỉ cần selfie HOẶC CCCD)
  useEffect(() => {
    if (enrollmentLoading) return;
    setStep((current) =>
      current === 'loading' ? (enrollment?.enrolled ? 'choose' : 'enroll') : current,
    );
  }, [enrollmentLoading, enrollment?.enrolled]);

  async function onVerifyPhoto(photo: File) {
    try {
      await submitProof.mutateAsync({ id: reservationId, verificationType, photo });
      toast.success('Xác minh khuôn mặt thành công — đã nhận hàng!');
      onClose();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, 'Xác minh thất bại. Vui lòng thử lại.'));
    }
  }

  const titles: Record<Step, string> = {
    loading: 'Xác minh nhận hàng',
    enroll: 'Đăng ký khuôn mặt',
    choose: 'Xác minh nhận hàng',
    capture: TYPE_CONFIG[verificationType].label,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl flex flex-col gap-lg p-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">{titles[step]}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="font-label-sm text-label-sm text-on-surface-variant -mt-md">{listingTitle}</p>

        {step === 'loading' && (
          <div className="flex items-center justify-center py-xl">
            <span className="animate-spin border-4 border-primary border-t-transparent rounded-full w-8 h-8" />
          </div>
        )}

        {/* Chưa có khuôn mặt gốc → bắt buộc đăng ký (không cho bỏ qua vì đang nhận hàng) */}
        {step === 'enroll' && <FaceEnrollmentPanel onDone={() => setStep('choose')} />}

        {/* Xác minh khi nhận hàng (đã đăng ký) */}
        {step === 'choose' && (
          <div className="flex flex-col gap-md">
            <p className="font-body-md text-on-surface-variant">
              Chụp ảnh tại chỗ để so khớp với khuôn mặt đã đăng ký. Khớp thì đơn được hoàn tất —
              không khớp sẽ bị từ chối giao.
            </p>
            {(Object.keys(TYPE_CONFIG) as VerificationType[]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setVerificationType(type);
                  setStep('capture');
                }}
                className="flex items-center gap-md p-md bg-surface-container-low rounded-xl border border-outline-variant/20 hover:border-primary/50 hover:bg-surface-container transition-all text-left"
              >
                <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                  {TYPE_CONFIG[type].icon}
                </span>
                <div>
                  <p className="font-label-lg text-label-lg text-on-surface">
                    {TYPE_CONFIG[type].label}
                  </p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
                    {TYPE_CONFIG[type].description}
                  </p>
                </div>
                <span className="material-symbols-outlined ml-auto text-on-surface-variant">
                  chevron_right
                </span>
              </button>
            ))}
          </div>
        )}

        {step === 'capture' && (
          <CameraCapture
            mode={verificationType}
            hint={TYPE_CONFIG[verificationType].hint}
            confirmLabel="Gửi xác minh"
            busy={submitProof.isPending}
            onConfirm={onVerifyPhoto}
          />
        )}
      </div>
    </div>
  );
}
