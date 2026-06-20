import React, { useState } from 'react';
import Toast from 'react-native-toast-message';
import OtpVerificationScreenComponent from '../../components/OtpVerificationScreen';
import apiClient, { endpoints } from '../../api/client';
import { getErrorMessage } from '../../hooks/useErrorHandler';
import { useAuth } from '../../hooks/useAuth';
import { confirmPhoneCode, signInWithPhone } from '../../services/firebaseAuth';

interface OtpVerificationScreenProps {
  navigation: any;
  route: any;
}

export default function OtpVerificationScreen({
  navigation,
  route,
}: OtpVerificationScreenProps) {
  const { email, phone, type = 'signup_email' } = route.params || {};
  const [isLoading, setIsLoading] = useState(false);
  const { loginWithFirebase } = useAuth();

  const handleSuccess = async (otp: string) => {
    if (type === 'phone_login') {
      try {
        setIsLoading(true);
        const idToken = await confirmPhoneCode(otp);
        await loginWithFirebase(idToken);
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      } catch (error) {
        Toast.show({
          type: 'error',
          text1: 'Xác minh OTP thất bại',
          text2: getErrorMessage(error),
        });
      } finally {
        setIsLoading(false);
      }
    } else if (type === 'forgot_password') {
      navigation.navigate('ResetPassword', { email, otp });
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
        // Backend không có endpoint resend riêng — gọi lại forgot-password để sinh OTP mới
        await apiClient.post(endpoints.auth.forgotPassword, { email });
      } else if (type === 'phone_login' && phone) {
        await signInWithPhone(phone);
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
      phone={phone || ''}
      type={type}
      onSuccess={handleSuccess}
      onBack={handleBack}
      onResend={handleResend}
      isLoading={isLoading}
    />
  );
}
