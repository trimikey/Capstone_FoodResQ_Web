import React, { useState } from 'react';
import { Popup } from '@/components/ui/AppPopup';
import OtpVerificationScreenComponent from '../../components/OtpVerificationScreen';
import apiClient, { endpoints } from '../../api/client';
import { getErrorMessage } from '../../hooks/useErrorHandler';

interface OtpVerificationScreenProps {
  navigation: any;
  route: any;
}

export default function OtpVerificationScreen({
  navigation,
  route,
}: OtpVerificationScreenProps) {
  const { email, type = 'signup_email' } = route.params || {};
  const [isLoading, setIsLoading] = useState(false);

  const handleSuccess = async (otp: string) => {
    if (type === 'forgot_password') {
      navigation.navigate('ResetPassword', { email, token: otp });
    } else {
      navigation.navigate('SignUpBasic', { email, verifiedOtp: otp });
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleResend = async () => {
    try {
      setIsLoading(true);
      if (type === 'forgot_password' && email) {
        // Backend không có endpoint resend riêng — gọi lại forgot-password để sinh token mới
        await apiClient.post(endpoints.auth.forgotPassword, { email });
      }
      Popup.show({ type: 'success', text1: 'Đã gửi lại email đặt lại mật khẩu' });
    } catch (error) {
      Popup.show({
        type: 'error',
        text1: 'Gửi lại email thất bại',
        text2: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OtpVerificationScreenComponent
      email={email || ''}
      type={type}
      onSuccess={handleSuccess}
      onBack={handleBack}
      onResend={handleResend}
      isLoading={isLoading}
    />
  );
}
