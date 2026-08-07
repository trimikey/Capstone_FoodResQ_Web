import React, { useState } from 'react';
import { Popup } from '@/components/ui/AppPopup';
import {
  SignUpRecipientScreen as SignUpRecipientForm,
  SignUpRecipientInput,
} from '../../components/SignUpRecipientScreen';
import { useOnboardingStore } from '../../stores/onboarding';

interface SignUpRecipientScreenProps {
  navigation: any;
  route: any;
}

export default function SignUpRecipientScreen({
  navigation,
  route,
}: SignUpRecipientScreenProps) {
  const basicInfo = useOnboardingStore((s) => s.basicInfo);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSuccess = async (recipientData: SignUpRecipientInput) => {
    if (!basicInfo.email || !basicInfo.password || !basicInfo.name || !basicInfo.phone) {
      Popup.show({
        type: 'error',
        text1: 'Thiếu thông tin tài khoản',
        text2: 'Vui lòng quay lại bước trước.',
      });
      return;
    }

    setIsSubmitting(true);
    navigation.navigate('SignUpVerification', {
      type: 'receiver',
      basicInfo,
      recipientData,
    });
    setIsSubmitting(false);
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
