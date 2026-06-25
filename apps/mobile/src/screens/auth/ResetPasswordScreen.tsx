import React, { useState } from 'react';
import { Popup } from '@/components/ui/AppPopup';
import ResetPasswordScreenComponent from '../../components/ResetPasswordScreen';
import apiClient, { endpoints } from '../../api/client';
import { getErrorMessage } from '../../hooks/useErrorHandler';

interface ResetPasswordScreenProps {
  navigation: any;
  route: any;
}

export default function ResetPasswordScreen({
  navigation,
  route,
}: ResetPasswordScreenProps) {
  const { email, otp } = route.params || {};
  const [isLoading, setIsLoading] = useState(false);

  const handleSuccess = async (newPassword: string) => {
    try {
      setIsLoading(true);
      await apiClient.post(endpoints.auth.resetPassword, {
        email: String(email),
        otp: String(otp),
        newPassword,
      });

      Popup.show({
        type: 'success',
        text1: 'Đặt lại mật khẩu thành công',
        text2: 'Hãy đăng nhập bằng mật khẩu mới',
      });
      navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] });
    } catch (error) {
      Popup.show({
        type: 'error',
        text1: 'Đặt lại mật khẩu thất bại',
        text2: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <ResetPasswordScreenComponent
      email={email || ''}
      otp={otp || ''}
      onSuccess={handleSuccess}
      onBack={handleBack}
      isLoading={isLoading}
    />
  );
}
