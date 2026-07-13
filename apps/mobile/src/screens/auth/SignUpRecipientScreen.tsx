import React, { useState } from 'react';
import { Popup } from '@/components/ui/AppPopup';
import {
  SignUpRecipientScreen as SignUpRecipientForm,
  SignUpRecipientInput,
} from '../../components/SignUpRecipientScreen';
import { useAuth } from '../../hooks/useAuth';
import { useOnboardingStore } from '../../stores/onboarding';
import { getErrorMessage } from '../../hooks/useErrorHandler';

interface SignUpRecipientScreenProps {
  navigation: any;
  route: any;
}

export default function SignUpRecipientScreen({
  navigation,
  route,
}: SignUpRecipientScreenProps) {
  const { register, initialize } = useAuth();
  const basicInfo = useOnboardingStore((s) => s.basicInfo);
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSuccess = async (recipientData: SignUpRecipientInput) => {
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
      const isCharity = (route?.params?.recipientType ?? recipientData.recipientType) === 'charity';
      await register({
        email: basicInfo.email,
        password: basicInfo.password,
        name: basicInfo.name,
        role: 'receiver',
        address: recipientData.address,
        isCharityOrg: isCharity,
        ...(isCharity && recipientData.organizationName
          ? { businessName: recipientData.organizationName }
          : {}),
        // TODO(Profile API): backend register/PATCH users/me chưa nhận idNumber/taxId.
      } as any);
      await initialize();
      resetOnboarding();
      Popup.show({
        type: 'success',
        text1: 'Đăng ký thành công',
        text2: isCharity
          ? 'Hồ sơ tổ chức đang chờ xác minh.'
          : 'Chào mừng bạn đến với FoodResQ.',
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
    <SignUpRecipientForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      isLoading={isSubmitting}
      initialRecipientType={(route?.params?.recipientType as 'individual' | 'charity') ?? 'individual'}
    />
  );
}
