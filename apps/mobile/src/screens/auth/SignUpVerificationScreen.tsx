import React, { useState } from 'react';
import { Popup } from '@/components/ui/AppPopup';
import {
  SignUpVerificationScreen as SignUpVerificationForm,
} from '../../components/SignUpVerificationScreen';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage } from '../../hooks/useErrorHandler';

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
  const { register } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const basicInfo = route?.params?.basicInfo || {};
  const volunteerData = route?.params?.volunteerData || {};
  const recipientData = route?.params?.recipientData || {};
  const type = route?.params?.type || 'receiver';

  const handleSuccess = async () => {
    try {
      setIsSubmitting(true);

      // Gộp dữ liệu các bước (store register chỉ lấy email/password/name->fullName/role)
      const fullData = {
        ...basicInfo,
        role: type === 'volunteer' ? 'volunteer' : 'receiver',
        ...(type === 'volunteer' ? volunteerData : recipientData),
      };

      await register(fullData as any);

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
