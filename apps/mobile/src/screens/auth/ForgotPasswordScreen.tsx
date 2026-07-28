import React, { useState } from 'react';
import { Popup } from '@/components/ui/AppPopup';
import {
  ForgotPasswordScreen as ForgotPasswordForm,
} from '../../components/ForgotPasswordScreen';
import apiClient, { endpoints } from '../../api/client';
import { getErrorMessage } from '../../hooks/useErrorHandler';

interface ForgotPasswordScreenProps {
  navigation: any;
  route?: any;
}

/**
 * Forgot Password Container — gửi mã đặt lại mật khẩu qua email,
 * rồi điều hướng sang màn nhập mã.
 */
export default function ForgotPasswordScreen({
  navigation,
}: ForgotPasswordScreenProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleBack = () => {
    navigation.goBack();
  };

  const handleNavigateToSignIn = () => {
    navigation.navigate('SignIn');
  };

  const handleSuccess = async (email: string) => {
    try {
      setIsLoading(true);
      await apiClient.post(endpoints.auth.forgotPassword, { email });

      Popup.show({
        type: 'success',
        text1: 'Đã gửi email đặt lại mật khẩu',
        text2: 'Vui lòng kiểm tra email của bạn',
      });
      navigation.navigate('OtpVerification', { email, type: 'forgot_password' });
    } catch (error) {
      Popup.show({
        type: 'error',
        text1: 'Gửi email thất bại',
        text2: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ForgotPasswordForm
      onSuccess={handleSuccess}
      onBack={handleBack}
      onNavigateToSignIn={handleNavigateToSignIn}
      isLoading={isLoading}
    />
  );
}
