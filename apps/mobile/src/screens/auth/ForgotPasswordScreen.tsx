import React, { useState } from 'react';
import Toast from 'react-native-toast-message';
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
 * Forgot Password Container — gửi OTP đặt lại mật khẩu qua email,
 * rồi điều hướng sang màn nhập OTP.
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

      Toast.show({
        type: 'success',
        text1: 'Đã gửi mã OTP',
        text2: 'Vui lòng kiểm tra email của bạn',
      });
      navigation.navigate('OtpVerification', { email, type: 'forgot_password' });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Gửi OTP thất bại',
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
