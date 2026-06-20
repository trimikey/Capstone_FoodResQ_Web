import React, { useState } from 'react';
import Toast from 'react-native-toast-message';
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

  const handleSuccess = (otp: string) => {
    if (type === 'forgot_password') {
      navigation.navigate('ResetPassword', {
        email,
        otp,
      });
    } else {
      navigation.navigate('SignUpBasic', {
        email,
        verifiedOtp: otp,
      });
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleResend = async () => {
    try {
      setIsLoading(true);
      // Backend không có endpoint resend riêng — gọi lại forgot-password để sinh OTP mới
      if (type === 'forgot_password' && email) {
        await apiClient.post(endpoints.auth.forgotPassword, { email });
      }
      Toast.show({ type: 'success', text1: 'Đã gửi lại mã OTP' });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Gửi lại OTP thất bại',
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
