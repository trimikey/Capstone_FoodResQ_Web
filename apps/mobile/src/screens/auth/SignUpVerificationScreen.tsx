import React, { useState } from 'react';
import { Popup } from '@/components/ui/AppPopup';
import {
  SignUpVerificationScreen as SignUpVerificationForm,
  type VerificationSubmitData,
} from '../../components/SignUpVerificationScreen';
import { useAuth } from '../../hooks/useAuth';
import { useOnboardingStore } from '../../stores/onboarding';
import { getErrorMessage } from '../../hooks/useErrorHandler';
import { uploadRegisterEvidenceToBackend } from '../../services/imageUpload';

interface SignUpVerificationScreenProps {
  navigation: any;
  route: any;
}

/**
 * Sign Up Verification Screen Container
 * Bước cuối của luồng đăng ký — gộp dữ liệu các bước rồi gọi register().
 */
export default function SignUpVerificationScreen({
  navigation,
  route,
}: SignUpVerificationScreenProps) {
  const { register, initialize } = useAuth();
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const basicInfo = route?.params?.basicInfo || {};
  const volunteerData = route?.params?.volunteerData || {};
  const recipientData = route?.params?.recipientData || {};
  const type = route?.params?.type || 'receiver';

  const handleSuccess = async (verificationData: VerificationSubmitData) => {
    try {
      setIsSubmitting(true);
      const isCharity = recipientData.recipientType === 'charity' || !!recipientData.isCharityOrg;
      const evidenceUrls = isCharity && verificationData.charityEvidence?.length
        ? await Promise.all(
            verificationData.charityEvidence.map((image) => uploadRegisterEvidenceToBackend(image.uri)),
          )
        : undefined;

      // Gộp dữ liệu các bước (store register chỉ lấy email/password/name->fullName/role)
      const fullData = {
        ...basicInfo,
        role: type === 'volunteer' ? 'volunteer' : 'receiver',
        ...(type === 'volunteer' ? volunteerData : recipientData),
        ...(type === 'receiver' && isCharity ? { isCharityOrg: true } : {}),
        ...(isCharity && recipientData.organizationName?.trim()
          ? { businessName: recipientData.organizationName.trim() }
          : {}),
        ...(evidenceUrls?.length ? { evidenceUrls } : {}),
        ...(verificationData.selfie ? { selfie: verificationData.selfie } : {}),
      };

      await register(fullData as any);
      await initialize();
      resetOnboarding();

      Popup.show({
        type: 'success',
        text1: 'Đăng ký thành công',
        text2: 'Chào mừng bạn đến với FoodResQ',
      });

      // Token đã set -> auth guard cho qua, về Home
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (error) {
      // Lỗi mong đợi (email trùng, validate...) -> toast, KHÔNG console.error (tránh LogBox)
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
    <SignUpVerificationForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      isLoading={isSubmitting}
      recipientType={recipientData.recipientType || 'individual'}
      volunteerRole={type === 'volunteer'}
    />
  );
}
