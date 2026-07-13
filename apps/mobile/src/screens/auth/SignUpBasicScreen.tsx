import React, { useState } from 'react';
import { Popup } from '@/components/ui/AppPopup';
import { SignUpBasicScreen as SignUpBasicForm } from '../../components/SignUpBasicScreen';
import type { SignUpBasicInfoInput } from '../../utils/validators';
import { useAuth } from '../../hooks/useAuth';
import { useOnboardingStore } from '../../stores/onboarding';
import { getErrorMessage } from '../../hooks/useErrorHandler';

interface SignUpBasicScreenProps {
  navigation: any;
  route: any;
}

/**
 * Sign Up Basic Screen Container — bước 1 của đăng ký.
 * Lưu credential vào onboarding store rồi chuyển sang bước nhập thông tin theo role;
 * provider giữ flow nhập thông tin cơ sở riêng.
 */
export default function SignUpBasicScreen({
  navigation,
  route,
}: SignUpBasicScreenProps) {
  const { register } = useAuth();
  const setBasicInfo = useOnboardingStore((s) => s.setBasicInfo);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedRole = route?.params?.role || 'receiver';

  const handleSuccess = async (data: SignUpBasicInfoInput) => {
    setBasicInfo({ email: data.email, password: data.password, name: data.name });

    // Provider: chưa đăng ký ngay — sang màn nhập thông tin cơ sở rồi mới register.
    if (selectedRole === 'provider') {
      navigation.navigate('SignUpProvider');
      return;
    }

    if (selectedRole === 'receiver') {
      navigation.navigate('SignUpRecipient', {
        recipientType: route?.params?.recipientType ?? 'individual',
      });
      return;
    }

    if (selectedRole === 'volunteer') {
      navigation.navigate('SignUpVolunteer');
      return;
    }

    try {
      setIsSubmitting(true);
      await register({ ...data, role: selectedRole } as any);

      Popup.show({
        type: 'success',
        text1: 'Đăng ký thành công',
        text2: 'Chào mừng bạn đến với FoodResQ',
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

  const handleNavigateToSignIn = () => {
    navigation.navigate('SignIn');
  };

  return (
    <SignUpBasicForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      onNavigateToSignIn={handleNavigateToSignIn}
      isLoading={isSubmitting}
    />
  );
}
