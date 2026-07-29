import React, { useState } from 'react';
import { Popup } from '@/components/ui/AppPopup';
import {
  SignUpVolunteerScreen as SignUpVolunteerForm,
  VolunteerInfoInput,
} from '../../components/SignUpVolunteerScreen';
import { useAuth } from '../../hooks/useAuth';
import { useOnboardingStore } from '../../stores/onboarding';
import { getErrorMessage } from '../../hooks/useErrorHandler';

interface SignUpVolunteerScreenProps {
  navigation: any;
  route: any;
}

export default function SignUpVolunteerScreen({
  navigation,
}: SignUpVolunteerScreenProps) {
  const { register, initialize } = useAuth();
  const basicInfo = useOnboardingStore((s) => s.basicInfo);
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSuccess = async (volunteerData: VolunteerInfoInput) => {
    if (!basicInfo.email || !basicInfo.password || !basicInfo.name) {
      Popup.show({
        type: 'error',
        text1: 'Thiếu thông tin tài khoản',
        text2: 'Vui lòng quay lại bước trước.',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await register({
        email: basicInfo.email,
        password: basicInfo.password,
        name: basicInfo.name,
        role: 'volunteer',
        idCardNumber: volunteerData.idCard,
        vehicleType: volunteerData.vehicleType,
        vehiclePlate: volunteerData.plateNumber,
        volunteerRole: volunteerData.specializations[0],
        selfie: volunteerData.selfie,
        idCardPhoto: volunteerData.idCardPhoto,
        vehiclePlateImage: volunteerData.vehiclePlatePhoto,
      } as any);
      await initialize();
      resetOnboarding();
      Popup.show({
        type: 'success',
        text1: 'Đăng ký thành công',
        text2: 'Hồ sơ tình nguyện viên đang chờ xác minh.',
      });
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (error) {
      Popup.show({
        type: 'error',
        text1: 'Đăng ký thất bại',
        text2: getErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SignUpVolunteerForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      isLoading={isSubmitting}
    />
  );
}
